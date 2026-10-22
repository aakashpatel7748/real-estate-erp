import { describe, expect, it } from 'vitest';
import { api, bookingBody, key, registerCompany, setupInventory } from './helpers';

describe('bookings & plot inventory', () => {
  it('creates a booking atomically with schedule and balanced sales entry', async () => {
    const s = await registerCompany();
    const inv = await setupInventory(s, 2);
    const http = api(s);

    const res = await http.post(
      '/bookings',
      bookingBody(inv, [0], { discountPaise: 50_000_00, charges: [{ name: 'Club', amountPaise: 25_000_00 }] }),
      key(),
    );
    expect(res.status).toBe(201);
    const booking = (await http.get(`/bookings/${res.body.data.id}`).expect(200)).body.data;

    // ₹10,00,000 - ₹50,000 discount + ₹25,000 charges
    expect(booking.netAmountPaise).toBe(9_75_000_00);
    expect(booking.status).toBe('booked');
    expect(booking.bookingNumber).toMatch(/^BKG\/2026-27\/00001$/);
    const sum = booking.installments.reduce((a: number, i: { amountPaise: number }) => a + i.amountPaise, 0);
    expect(sum).toBe(booking.netAmountPaise);
    expect(booking.installments.map((i: { dueDate: string }) => i.dueDate.slice(0, 10))).toEqual([
      '2026-04-10',
      '2026-05-10',
      '2026-07-10',
    ]);

    const plot = (await http.get(`/projects/${inv.project.id}/plots/${inv.plots[0]!.id}`).expect(200)).body.data;
    expect(plot.status).toBe('booked');
    expect(plot.history[0]).toMatchObject({ from: 'available', to: 'booked' });

    const tb = (await http.get('/accounting/reports/trial-balance').expect(200)).body.data;
    expect(tb.balanced).toBe(true);
    expect(tb.rows.find((r: { code: string }) => r.code === '1100').debitPaise).toBe(9_75_000_00);
  });

  it('prevents double-booking under concurrency', async () => {
    const s = await registerCompany();
    const inv = await setupInventory(s, 1);
    const http = api(s);
    const attempts = await Promise.all(Array.from({ length: 6 }, () => http.post('/bookings', bookingBody(inv), key())));
    const statuses = attempts.map((r) => r.status).sort();
    expect(statuses.filter((x) => x === 201)).toHaveLength(1);
    expect(statuses.filter((x) => x === 409)).toHaveLength(5);
    const bookings = (await http.get('/bookings').expect(200)).body.data;
    expect(bookings).toHaveLength(1);
  });

  it('is idempotent: retries replay the original response', async () => {
    const s = await registerCompany();
    const inv = await setupInventory(s, 2);
    const http = api(s);
    const k = key();
    const first = await http.post('/bookings', bookingBody(inv), k).expect(201);
    const retry = await http.post('/bookings', bookingBody(inv), k).expect(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect((await http.get('/bookings').expect(200)).body.data).toHaveLength(1);

    // Same key, different payload -> rejected.
    const misuse = await http.post('/bookings', bookingBody(inv, [1]), k).expect(422);
    expect(misuse.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    // Missing key -> rejected.
    await http.post('/bookings', bookingBody(inv, [1])).expect(400);
  });

  it('requires the discount permission for discounts', async () => {
    const s = await registerCompany();
    const inv = await setupInventory(s, 1);
    const http = api(s);
    const roles = (await http.get('/roles')).body.data as { id: string; systemKey?: string; permissions: string[] }[];
    const sales = roles.find((r) => r.systemKey === 'sales')!;
    expect(sales.permissions).not.toContain('bookings.discount');
  });

  it('cancels a booking: releases plots, reverses sales and moves receipts to refunds payable', async () => {
    const s = await registerCompany();
    const inv = await setupInventory(s, 1);
    const http = api(s);
    const b = (await http.post('/bookings', bookingBody(inv), key()).expect(201)).body.data;
    await http.post('/payments', { bookingId: b.id, amountPaise: 3_00_000_00, mode: 'neft', receivedOn: '2026-04-11' }, key()).expect(201);

    await http.post(`/bookings/${b.id}/cancel`, { reason: 'Customer withdrew', cancellationChargePaise: 50_000_00 }).expect(200);
    const after = (await http.get(`/bookings/${b.id}`).expect(200)).body.data;
    expect(after.status).toBe('cancelled');
    expect(after.refundablePaise).toBe(2_50_000_00);
    expect(after.installments.every((i: { status: string }) => i.status === 'cancelled')).toBe(true);
    const plot = (await http.get(`/projects/${inv.project.id}/plots/${inv.plots[0]!.id}`).expect(200)).body.data;
    expect(plot.status).toBe('available');
    expect(plot.currentBookingId).toBeNull();

    // Cannot cancel twice or pay into a cancelled booking.
    await http.post(`/bookings/${b.id}/cancel`, { reason: 'again' }).expect(422);
    await http.post('/payments', { bookingId: b.id, amountPaise: 100, mode: 'cash', receivedOn: '2026-04-12' }, key()).expect(422);

    // Refund cannot exceed the refundable balance.
    await http.post(`/bookings/${b.id}/refunds`, { amountPaise: 2_50_000_01, mode: 'neft', paidOn: '2026-04-20' }, key()).expect(422);
    await http.post(`/bookings/${b.id}/refunds`, { amountPaise: 2_50_000_00, mode: 'neft', paidOn: '2026-04-20' }, key()).expect(201);

    const ledger = (await http.get(`/customers/${inv.customer.id}/ledger`).expect(200)).body.data;
    expect(ledger.totals.balancePaise).toBe(0);
    const tb = (await http.get('/accounting/reports/trial-balance').expect(200)).body.data;
    expect(tb.balanced).toBe(true);
    const pl = (await http.get('/accounting/reports/profit-loss?from=2026-04-01&to=2027-03-31').expect(200)).body.data;
    expect(pl.netProfitPaise).toBe(50_000_00); // only cancellation charges remain as income

    // The plot can be booked again.
    await http.post('/bookings', bookingBody(inv), key()).expect(201);
  });

  it('reserves with a hold, confirms, and expires stale reservations', async () => {
    const s = await registerCompany();
    const inv = await setupInventory(s, 2);
    const http = api(s);
    const r1 = (await http.post('/bookings', bookingBody(inv, [0], { mode: 'reserve', reservationHours: 1 }), key()).expect(201)).body.data;
    expect(r1.status).toBe('reserved');
    await http.post(`/bookings/${r1.id}/confirm`).expect(200);
    await http.post(`/bookings/${r1.id}/confirm`).expect(422);

    const r2 = (await http.post('/bookings', bookingBody(inv, [1], { mode: 'reserve', reservationHours: 1 }), key()).expect(201)).body.data;
    const { expireReservations } = await import('../src/modules/bookings/bookings.service');
    expect(await expireReservations(new Date(Date.now() + 2 * 3600_000))).toBeGreaterThanOrEqual(1);
    const after = (await http.get(`/bookings/${r2.id}`).expect(200)).body.data;
    expect(after.status).toBe('expired');
    const plot = (await http.get(`/projects/${inv.project.id}/plots/${inv.plots[1]!.id}`).expect(200)).body.data;
    expect(plot.status).toBe('available');
    // The confirmed booking is untouched.
    expect((await http.get(`/bookings/${r1.id}`)).body.data.status).toBe('booked');
  });

  it('allows manual block/unblock but not illegal status jumps', async () => {
    const s = await registerCompany();
    const inv = await setupInventory(s, 1);
    const http = api(s);
    const url = `/projects/${inv.project.id}/plots/${inv.plots[0]!.id}/status`;
    await http.post(url, { status: 'booked', reason: 'manual' }).expect(422);
    await http.post(url, { status: 'blocked', reason: 'Management quota' }).expect(200);
    await http.post('/bookings', bookingBody(inv), key()).expect(409);
    await http.post(url, { status: 'available', reason: 'Released' }).expect(200);
  });

  it('serves map data with live statuses', async () => {
    const s = await registerCompany();
    const inv = await setupInventory(s, 2);
    const http = api(s);
    await http
      .put(`/projects/${inv.project.id}/map/shapes`, { shapes: [{ plotId: inv.plots[0]!.id, points: '0,0 10,0 10,10 0,10' }] })
      .expect(200);
    await http.post('/bookings', bookingBody(inv), key()).expect(201);
    const map = (await http.get(`/projects/${inv.project.id}/map`).expect(200)).body.data;
    expect(map.summary).toEqual({ booked: 1, available: 1 });
    expect(map.plots.find((p: { id: string }) => p.id === inv.plots[0]!.id)).toMatchObject({
      status: 'booked',
      points: '0,0 10,0 10,10 0,10',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { api, bookingBody, key, registerCompany, setupInventory } from './helpers';

type Inst = { amountPaise: number; paidPaise: number; status: string };

describe('payments, allocation and receipts', () => {
  async function bookedFixture() {
    const s = await registerCompany();
    const inv = await setupInventory(s, 1);
    const http = api(s);
    const b = (await http.post('/bookings', bookingBody(inv), key()).expect(201)).body.data; // ₹10L: 2L / 3L / 5L
    return { s, inv, http, b };
  }

  it('allocates FIFO across installments with partial payments', async () => {
    const { http, b } = await bookedFixture();
    await http.post('/payments', { bookingId: b.id, amountPaise: 3_50_000_00, mode: 'upi', receivedOn: '2026-04-10' }, key()).expect(201);
    const d = (await http.get(`/bookings/${b.id}`)).body.data;
    expect(d.installments.map((i: Inst) => [i.paidPaise, i.status])).toEqual([
      [2_00_000_00, 'paid'],
      [1_50_000_00, 'partial'],
      [0, 'pending'],
    ]);
    expect(d.summary.outstandingPaise).toBe(6_50_000_00);
  });

  it('holds overpayments as advance and keeps the books balanced', async () => {
    const { http, b, inv } = await bookedFixture();
    const p = (await http.post('/payments', { bookingId: b.id, amountPaise: 10_10_000_00, mode: 'rtgs', receivedOn: '2026-04-10' }, key()).expect(201)).body
      .data;
    expect(p.allocatedPaise).toBe(10_00_000_00);
    expect(p.advancePaise).toBe(10_000_00);
    const ledger = (await http.get(`/customers/${inv.customer.id}/ledger`)).body.data;
    expect(ledger.totals.balancePaise).toBe(-10_000_00); // customer is in credit
    expect((await http.get('/accounting/reports/trial-balance')).body.data.balanced).toBe(true);
  });

  it('rejects overpayments when company policy says so', async () => {
    const { http, b } = await bookedFixture();
    await http.patch('/company', { settings: { overpaymentPolicy: 'reject' } }).expect(200);
    const res = await http.post('/payments', { bookingId: b.id, amountPaise: 10_00_000_01, mode: 'cash', receivedOn: '2026-04-10' }, key()).expect(422);
    expect(res.body.error.message).toMatch(/exceeds/);
  });

  it('never double-allocates under concurrent receipts and numbers receipts uniquely', async () => {
    const { http, b } = await bookedFixture();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => http.post('/payments', { bookingId: b.id, amountPaise: 1_50_000_00, mode: 'upi', receivedOn: '2026-04-15' }, key())),
    );
    const okCount = results.filter((r) => r.status === 201).length;
    // Concurrency conflicts are surfaced as retryable 422s, never as silent double counting.
    results.filter((r) => r.status !== 201).forEach((r) => expect(r.status).toBe(422));
    const d = (await http.get(`/bookings/${b.id}`)).body.data;
    const allocated = d.installments.reduce((s: number, i: Inst) => s + i.paidPaise, 0);
    expect(d.receivedPaise).toBe(okCount * 1_50_000_00);
    expect(allocated + d.advancePaise).toBe(d.receivedPaise);
    expect(allocated).toBe(d.allocatedPaise);
    const numbers = d.payments.map((p: { number: string }) => p.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers.every((n: string) => /^RCPT\/2026-27\/\d{6}$/.test(n))).toBe(true);
    expect((await http.get('/accounting/reports/trial-balance')).body.data.balanced).toBe(true);
  });

  it('replays an idempotent payment instead of recording it twice', async () => {
    const { http, b } = await bookedFixture();
    const k = key();
    const body = { bookingId: b.id, amountPaise: 1_00_000_00, mode: 'cash', receivedOn: '2026-04-10' };
    const first = await http.post('/payments', body, k).expect(201);
    const again = await http.post('/payments', body, k).expect(201);
    expect(again.body.data.id).toBe(first.body.data.id);
    expect((await http.get(`/bookings/${b.id}`)).body.data.receivedPaise).toBe(1_00_000_00);
  });

  it('reverses a bounced receipt and restores installment balances', async () => {
    const { http, b } = await bookedFixture();
    const p = (await http.post('/payments', { bookingId: b.id, amountPaise: 2_50_000_00, mode: 'cheque', receivedOn: '2026-04-10', reference: '000123' }, key())
      .expect(201)).body.data;
    await http.post(`/payments/${p.id}/reverse`, { reason: 'Cheque bounced' }).expect(200);
    await http.post(`/payments/${p.id}/reverse`, { reason: 'again' }).expect(422);
    const d = (await http.get(`/bookings/${b.id}`)).body.data;
    expect(d.receivedPaise).toBe(0);
    expect(d.installments.every((i: Inst) => i.paidPaise === 0 && i.status === 'pending')).toBe(true);
    expect((await http.get('/accounting/reports/trial-balance')).body.data.balanced).toBe(true);
    const detail = (await http.get(`/payments/${p.id}`)).body.data;
    expect(detail.status).toBe('reversed');
    expect(detail.allocations.every((a: { reversedAt?: string }) => a.reversedAt)).toBe(true);
  });

  it('produces receipt PDFs and Excel exports', async () => {
    const { http, b, inv } = await bookedFixture();
    const p = (await http.post('/payments', { bookingId: b.id, amountPaise: 1_000_00, mode: 'cash', receivedOn: '2026-04-10' }, key()).expect(201)).body.data;
    const pdf = await http.get(`/payments/${p.id}/receipt.pdf`).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    const xlsx = await http.get(`/projects/${inv.project.id}/plots.xlsx`).expect(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    await http.get(`/bookings/${b.id}/allotment.pdf`).expect(200);
  });
});

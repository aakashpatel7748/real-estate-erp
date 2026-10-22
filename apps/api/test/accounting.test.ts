import { describe, expect, it } from 'vitest';
import { api, bookingBody, key, registerCompany, setupInventory } from './helpers';

describe('double-entry accounting', () => {
  it('posts balanced manual vouchers and rejects unbalanced ones', async () => {
    const s = await registerCompany();
    const http = api(s);
    const accounts = (await http.get('/accounting/accounts').expect(200)).body.data as { id: string; systemKey?: string }[];
    const id = (k: string) => accounts.find((a) => a.systemKey === k)!.id;

    await http
      .post('/accounting/journal-entries', {
        date: '2026-05-01',
        narration: 'Unbalanced',
        lines: [
          { accountId: id('admin_expense'), debitPaise: 100 },
          { accountId: id('cash'), creditPaise: 99 },
        ],
      })
      .expect(400);

    const je = (
      await http
        .post('/accounting/journal-entries', {
          date: '2026-05-01',
          narration: 'Office rent',
          lines: [
            { accountId: id('admin_expense'), debitPaise: 25_000_00 },
            { accountId: id('bank'), creditPaise: 25_000_00 },
          ],
        })
        .expect(201)
    ).body.data;
    expect(je.entryNumber).toMatch(/^JV\/2026-27\/\d{6}$/);

    const pl = (await http.get('/accounting/reports/profit-loss?from=2026-04-01&to=2026-05-31').expect(200)).body.data;
    expect(pl.totalExpensesPaise).toBe(25_000_00);
    const bs = (await http.get('/accounting/reports/balance-sheet?asOf=2026-05-31').expect(200)).body.data;
    expect(bs.balanced).toBe(true);
  });

  it('blocks manual postings to control accounts', async () => {
    const s = await registerCompany();
    const http = api(s);
    const accounts = (await http.get('/accounting/accounts')).body.data as { id: string; systemKey?: string }[];
    const id = (k: string) => accounts.find((a) => a.systemKey === k)!.id;
    const res = await http
      .post('/accounting/journal-entries', {
        date: '2026-05-01',
        narration: 'Sneaky',
        lines: [
          { accountId: id('customer_receivable'), debitPaise: 100 },
          { accountId: id('plot_sales'), creditPaise: 100 },
        ],
      })
      .expect(422);
    expect(res.body.error.message).toMatch(/control account/);
  });

  it('corrects entries only through reversals; posted entries are immutable', async () => {
    const s = await registerCompany();
    const http = api(s);
    const accounts = (await http.get('/accounting/accounts')).body.data as { id: string; systemKey?: string }[];
    const id = (k: string) => accounts.find((a) => a.systemKey === k)!.id;
    const je = (
      await http
        .post('/accounting/journal-entries', {
          date: '2026-05-01',
          narration: 'Capital introduced',
          lines: [
            { accountId: id('bank'), debitPaise: 1_00_000_00 },
            { accountId: id('capital'), creditPaise: 1_00_000_00 },
          ],
        })
        .expect(201)
    ).body.data;

    const rev = (await http.post(`/accounting/journal-entries/${je.id}/reverse`, { reason: 'Wrong account' }).expect(200)).body.data;
    expect(rev.reversalOf).toBe(je.id);
    await http.post(`/accounting/journal-entries/${je.id}/reverse`, { reason: 'twice' }).expect(422);
    await http.post(`/accounting/journal-entries/${rev.id}/reverse`, { reason: 'reverse the reversal' }).expect(422);

    const { JournalEntry } = await import('../src/modules/accounting/accounting.models');
    const { Types } = await import('mongoose');
    const filter = { companyId: new Types.ObjectId(s.companyId), _id: new Types.ObjectId(je.id) };
    await expect(JournalEntry.updateOne(filter, { $set: { narration: 'edited' } })).rejects.toThrow(/cannot be modified/);
    await expect(JournalEntry.deleteOne(filter)).rejects.toThrow(/cannot be deleted/);
  });

  it('does not let system entries be reversed outside their workflow', async () => {
    const s = await registerCompany();
    const inv = await setupInventory(s, 1);
    const http = api(s);
    await http.post('/bookings', bookingBody(inv), key()).expect(201);
    const entries = (await http.get('/accounting/journal-entries?voucherType=sales')).body.data as { id: string }[];
    await http.post(`/accounting/journal-entries/${entries[0]!.id}/reverse`, { reason: 'try' }).expect(422);
  });

  it('dashboard KPIs come from real records', async () => {
    const s = await registerCompany();
    const inv = await setupInventory(s, 3);
    const http = api(s);
    const empty = (await http.get('/dashboard')).body.data;
    expect(empty.inventory.totalPlots).toBe(3);
    expect(empty.sales.fyCount).toBe(0);
    const b = (await http.post('/bookings', bookingBody(inv, [0], { bookingDate: new Date().toISOString().slice(0, 10) }), key()).expect(201)).body.data;
    await http.post('/payments', { bookingId: b.id, amountPaise: 1_00_000_00, mode: 'upi', receivedOn: new Date().toISOString().slice(0, 10) }, key()).expect(201);
    const d = (await http.get('/dashboard')).body.data;
    expect(d.inventory.byStatus.booked.count).toBe(1);
    expect(d.sales.monthValuePaise).toBe(10_00_000_00);
    expect(d.collections.monthPaise).toBe(1_00_000_00);
    expect(d.sales.outstandingPaise).toBe(9_00_000_00);
    expect(d.sales.trend).toHaveLength(12);
  });
});

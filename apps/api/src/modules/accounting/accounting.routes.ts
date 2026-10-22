import { Router } from 'express';
import {
  accountSchema,
  accountUpdateSchema,
  asOfSchema,
  idParam,
  journalEntrySchema,
  journalListQuerySchema,
  objectId,
  reportRangeSchema,
  reverseEntrySchema,
  todayInIndia,
  financialYear,
  type AccountInput,
  type JournalEntryInput,
} from '@erp/shared';
import { authorize } from '../../middleware/auth';
import { body, params, query, validate } from '../../middleware/validate';
import { created, ok } from '../../utils/http';
import { getCtx } from '../../utils/tenant';
import * as acc from './accounting.service';

export const accountingRouter = Router();
type Id = { id: string };

accountingRouter.get('/accounts', authorize('accounting.read'), async (req, res) => ok(res, await acc.listAccounts(getCtx(req))));
accountingRouter.post('/accounts', authorize('accounting.manageAccounts'), validate({ body: accountSchema }), async (req, res) =>
  created(res, await acc.createAccount(getCtx(req), body<AccountInput>(req))),
);
accountingRouter.patch(
  '/accounts/:id',
  authorize('accounting.manageAccounts'),
  validate({ params: idParam, body: accountUpdateSchema }),
  async (req, res) => ok(res, await acc.updateAccount(getCtx(req), params<Id>(req).id, body(req))),
);

const entryQuery = journalListQuerySchema.extend({ projectId: objectId.optional() });
accountingRouter.get('/journal-entries', authorize('accounting.read'), validate({ query: entryQuery }), async (req, res) => {
  const { items, meta } = await acc.listEntries(getCtx(req), query(req));
  ok(res, items, meta);
});
accountingRouter.post('/journal-entries', authorize('accounting.create'), validate({ body: journalEntrySchema }), async (req, res) =>
  created(res, await acc.createManualEntry(getCtx(req), body<JournalEntryInput>(req))),
);
accountingRouter.get('/journal-entries/:id', authorize('accounting.read'), validate({ params: idParam }), async (req, res) =>
  ok(res, await acc.getEntry(getCtx(req), params<Id>(req).id)),
);
accountingRouter.post(
  '/journal-entries/:id/reverse',
  authorize('accounting.reverse'),
  validate({ params: idParam, body: reverseEntrySchema }),
  async (req, res) => {
    const b = body<{ reason: string; date?: string }>(req);
    ok(res, await acc.reverseManualEntry(getCtx(req), params<Id>(req).id, b.reason, b.date));
  },
);

function defaultRange(q: { from?: string; to?: string }) {
  const today = todayInIndia();
  return { from: q.from ?? `${financialYear(today).slice(0, 4)}-04-01`, to: q.to ?? today };
}

accountingRouter.get(
  '/reports/trial-balance',
  authorize('reports.read', 'accounting.read'),
  validate({ query: asOfSchema }),
  async (req, res) => {
    const q = query<{ asOf?: string; projectId?: string }>(req);
    ok(res, await acc.trialBalance(getCtx(req), q.asOf, q.projectId));
  },
);
accountingRouter.get(
  '/reports/profit-loss',
  authorize('reports.read', 'accounting.read'),
  validate({ query: reportRangeSchema }),
  async (req, res) => {
    const q = query<{ from?: string; to?: string; projectId?: string }>(req);
    const r = defaultRange(q);
    ok(res, await acc.profitAndLoss(getCtx(req), r.from, r.to, q.projectId));
  },
);
accountingRouter.get(
  '/reports/balance-sheet',
  authorize('reports.read', 'accounting.read'),
  validate({ query: asOfSchema }),
  async (req, res) => {
    const q = query<{ asOf?: string; projectId?: string }>(req);
    ok(res, await acc.balanceSheet(getCtx(req), q.asOf, q.projectId));
  },
);
accountingRouter.get(
  '/reports/ledger/:id',
  authorize('reports.read', 'accounting.read'),
  validate({ params: idParam, query: reportRangeSchema }),
  async (req, res) => {
    const q = query<{ from?: string; to?: string; projectId?: string }>(req);
    const r = defaultRange(q);
    ok(res, await acc.accountLedger(getCtx(req), params<Id>(req).id, r.from, r.to, q.projectId));
  },
);

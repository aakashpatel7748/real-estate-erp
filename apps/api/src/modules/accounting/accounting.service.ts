import { Types } from 'mongoose';
import { NORMAL_BALANCE, parseISODate, todayInIndia, type AccountInput, type AccountType, type JournalEntryInput } from '@erp/shared';
import { withTransaction } from '../../db/transaction';
import { audit } from '../../utils/audit';
import { badRequest, businessRule, notFound } from '../../utils/errors';
import { escapeRegex, pageMeta } from '../../utils/http';
import { assertProjectAccess, toObjectId, type TenantContext } from '../../utils/tenant';
import { Project } from '../projects/project.models';
import { Account, JournalEntry } from './accounting.models';
import { postJournal, reverseJournal } from './ledger.service';

export async function listAccounts(ctx: TenantContext) {
  return Account.find({ companyId: ctx.companyId }).sort({ code: 1 }).lean();
}

export async function createAccount(ctx: TenantContext, input: AccountInput) {
  if (input.parentId) {
    const parent = await Account.findOne({ companyId: ctx.companyId, _id: toObjectId(input.parentId) }).lean();
    if (!parent) throw badRequest('Parent account not found');
    if (parent.type !== input.type) throw badRequest('Parent account must be of the same type');
  }
  if (input.isBank && input.type !== 'asset') throw badRequest('Bank accounts must be asset accounts');
  const account = await Account.create({ companyId: ctx.companyId, ...input });
  await audit(ctx, {
    action: 'accounting.account_create',
    entityType: 'account',
    entityId: account._id,
    summary: `${account.code} ${account.name}`,
  });
  return account.toJSON();
}

export async function updateAccount(ctx: TenantContext, id: string, input: { name?: string; description?: string; isActive?: boolean }) {
  const account = await Account.findOne({ companyId: ctx.companyId, _id: toObjectId(id) });
  if (!account) throw notFound('Account');
  if (input.isActive === false && account.systemKey) throw businessRule('System accounts cannot be deactivated');
  account.set(input);
  await account.save();
  await audit(ctx, { action: 'accounting.account_update', entityType: 'account', entityId: account._id, changes: input });
  return account.toJSON();
}

/** Manual voucher. Control accounts are blocked so sub-ledgers stay in sync with the books. */
export async function createManualEntry(ctx: TenantContext, input: JournalEntryInput) {
  if (input.projectId) {
    assertProjectAccess(ctx, input.projectId);
    if (!(await Project.exists({ companyId: ctx.companyId, _id: toObjectId(input.projectId) }))) throw badRequest('Project not found');
  } else if (ctx.projectScope !== null) {
    throw badRequest('Select one of your projects for this voucher');
  }
  return withTransaction(async (session) => {
    const entry = await postJournal(
      ctx,
      {
        date: input.date,
        voucherType: 'journal',
        narration: input.narration,
        reference: input.reference,
        projectId: input.projectId,
        lines: input.lines,
        source: { type: 'manual' },
      },
      session,
    );
    await audit(
      ctx,
      { action: 'accounting.journal_post', entityType: 'journal_entry', entityId: entry._id, summary: entry.entryNumber },
      session,
    );
    return entry.toJSON();
  });
}

export async function reverseManualEntry(ctx: TenantContext, id: string, reason: string, date?: string) {
  return withTransaction(async (session) => {
    const entry = await JournalEntry.findOne({ companyId: ctx.companyId, _id: toObjectId(id) })
      .session(session)
      .lean();
    if (!entry) throw notFound('Journal entry');
    if (entry.projectId) assertProjectAccess(ctx, entry.projectId);
    if (entry.source?.type !== 'manual') {
      throw businessRule('System entries are corrected through their source document (cancel the booking or reverse the receipt)');
    }
    const reversal = await reverseJournal(ctx, entry._id, reason, session, date ?? todayInIndia());
    await audit(
      ctx,
      {
        action: 'accounting.journal_reverse',
        entityType: 'journal_entry',
        entityId: entry._id,
        summary: `${entry.entryNumber} reversed by ${reversal.entryNumber}`,
        changes: { reason },
      },
      session,
    );
    return reversal.toJSON();
  });
}

function projectMatch(ctx: TenantContext, projectId?: string): Record<string, unknown> {
  if (projectId) {
    assertProjectAccess(ctx, projectId);
    return { projectId: toObjectId(projectId) };
  }
  return ctx.projectScope !== null ? { projectId: { $in: ctx.projectScope } } : {};
}

export async function listEntries(
  ctx: TenantContext,
  q: {
    page: number;
    pageSize: number;
    q?: string;
    from?: string;
    to?: string;
    accountId?: string;
    voucherType?: string;
    projectId?: string;
  },
) {
  const filter: Record<string, unknown> = { companyId: ctx.companyId, ...projectMatch(ctx, q.projectId) };
  if (q.from || q.to) filter.date = { ...(q.from ? { $gte: parseISODate(q.from) } : {}), ...(q.to ? { $lte: parseISODate(q.to) } : {}) };
  if (q.accountId) filter['lines.accountId'] = toObjectId(q.accountId);
  if (q.voucherType) filter.voucherType = q.voucherType;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ entryNumber: rx }, { narration: rx }, { reference: rx }];
  }
  const [items, total] = await Promise.all([
    JournalEntry.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .populate({ path: 'lines.accountId', select: 'code name', match: { companyId: ctx.companyId } })
      .lean(),
    JournalEntry.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(q.page, q.pageSize, total) };
}

export async function getEntry(ctx: TenantContext, id: string) {
  const entry = await JournalEntry.findOne({ companyId: ctx.companyId, _id: toObjectId(id) })
    .populate({ path: 'lines.accountId', select: 'code name type', match: { companyId: ctx.companyId } })
    .populate({ path: 'lines.customerId', select: 'name customerCode', match: { companyId: ctx.companyId } })
    .populate('postedBy', 'name')
    .lean();
  if (!entry) throw notFound('Journal entry');
  if (entry.projectId) assertProjectAccess(ctx, entry.projectId);
  return entry;
}

interface BalanceRow {
  _id: Types.ObjectId;
  debitPaise: number;
  creditPaise: number;
}

async function balancesByAccount(
  ctx: TenantContext,
  dateMatch: Record<string, unknown>,
  projectId?: string,
): Promise<Map<string, BalanceRow>> {
  const rows = await JournalEntry.aggregate<BalanceRow>([
    { $match: { companyId: ctx.companyId, ...projectMatch(ctx, projectId), ...dateMatch } },
    { $unwind: '$lines' },
    { $group: { _id: '$lines.accountId', debitPaise: { $sum: '$lines.debitPaise' }, creditPaise: { $sum: '$lines.creditPaise' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

function signedBalance(type: AccountType, debit: number, credit: number) {
  return NORMAL_BALANCE[type] === 'debit' ? debit - credit : credit - debit;
}

export async function trialBalance(ctx: TenantContext, asOf = todayInIndia(), projectId?: string) {
  const [accounts, balances] = await Promise.all([
    Account.find({ companyId: ctx.companyId }).sort({ code: 1 }).lean(),
    balancesByAccount(ctx, { date: { $lte: parseISODate(asOf) } }, projectId),
  ]);
  const rows = accounts
    .map((a) => {
      const b = balances.get(String(a._id));
      const net = (b?.debitPaise ?? 0) - (b?.creditPaise ?? 0);
      return {
        accountId: String(a._id),
        code: a.code,
        name: a.name,
        type: a.type,
        debitPaise: net > 0 ? net : 0,
        creditPaise: net < 0 ? -net : 0,
      };
    })
    .filter((r) => r.debitPaise || r.creditPaise);
  const totals = { debitPaise: rows.reduce((s, r) => s + r.debitPaise, 0), creditPaise: rows.reduce((s, r) => s + r.creditPaise, 0) };
  return { asOf, rows, totals, balanced: totals.debitPaise === totals.creditPaise };
}

export async function profitAndLoss(ctx: TenantContext, from: string, to: string, projectId?: string) {
  const [accounts, balances] = await Promise.all([
    Account.find({ companyId: ctx.companyId, type: { $in: ['income', 'expense'] } })
      .sort({ code: 1 })
      .lean(),
    balancesByAccount(ctx, { date: { $gte: parseISODate(from), $lte: parseISODate(to) } }, projectId),
  ]);
  const section = (type: 'income' | 'expense') =>
    accounts
      .filter((a) => a.type === type)
      .map((a) => {
        const b = balances.get(String(a._id));
        return {
          accountId: String(a._id),
          code: a.code,
          name: a.name,
          amountPaise: signedBalance(type, b?.debitPaise ?? 0, b?.creditPaise ?? 0),
        };
      })
      .filter((r) => r.amountPaise !== 0);
  const income = section('income');
  const expenses = section('expense');
  const totalIncome = income.reduce((s, r) => s + r.amountPaise, 0);
  const totalExpenses = expenses.reduce((s, r) => s + r.amountPaise, 0);
  return {
    from,
    to,
    income,
    expenses,
    totalIncomePaise: totalIncome,
    totalExpensesPaise: totalExpenses,
    netProfitPaise: totalIncome - totalExpenses,
  };
}

export async function balanceSheet(ctx: TenantContext, asOf = todayInIndia(), projectId?: string) {
  const [accounts, balances] = await Promise.all([
    Account.find({ companyId: ctx.companyId }).sort({ code: 1 }).lean(),
    balancesByAccount(ctx, { date: { $lte: parseISODate(asOf) } }, projectId),
  ]);
  const rowsOf = (type: AccountType) =>
    accounts
      .filter((a) => a.type === type)
      .map((a) => {
        const b = balances.get(String(a._id));
        return {
          accountId: String(a._id),
          code: a.code,
          name: a.name,
          amountPaise: signedBalance(type, b?.debitPaise ?? 0, b?.creditPaise ?? 0),
        };
      })
      .filter((r) => r.amountPaise !== 0);
  const sum = (rows: { amountPaise: number }[]) => rows.reduce((s, r) => s + r.amountPaise, 0);
  const assets = rowsOf('asset');
  const liabilities = rowsOf('liability');
  const equity = rowsOf('equity');
  const retainedEarnings = sum(rowsOf('income')) - sum(rowsOf('expense'));
  const totalEquity = sum(equity) + retainedEarnings;
  return {
    asOf,
    assets,
    liabilities,
    equity,
    retainedEarningsPaise: retainedEarnings,
    totalAssetsPaise: sum(assets),
    totalLiabilitiesPaise: sum(liabilities),
    totalEquityPaise: totalEquity,
    balanced: sum(assets) === sum(liabilities) + totalEquity,
  };
}

export async function accountLedger(ctx: TenantContext, accountId: string, from: string, to: string, projectId?: string) {
  const account = await Account.findOne({ companyId: ctx.companyId, _id: toObjectId(accountId) }).lean();
  if (!account) throw notFound('Account');
  const pm = projectMatch(ctx, projectId);
  const opening = await JournalEntry.aggregate<{ debit: number; credit: number }>([
    { $match: { companyId: ctx.companyId, ...pm, 'lines.accountId': account._id, date: { $lt: parseISODate(from) } } },
    { $unwind: '$lines' },
    { $match: { 'lines.accountId': account._id } },
    { $group: { _id: null, debit: { $sum: '$lines.debitPaise' }, credit: { $sum: '$lines.creditPaise' } } },
  ]);
  const rows = await JournalEntry.aggregate<{
    _id: Types.ObjectId;
    entryNumber: string;
    date: Date;
    narration: string;
    voucherType: string;
    debitPaise: number;
    creditPaise: number;
  }>([
    {
      $match: {
        companyId: ctx.companyId,
        ...pm,
        'lines.accountId': account._id,
        date: { $gte: parseISODate(from), $lte: parseISODate(to) },
      },
    },
    { $sort: { date: 1, createdAt: 1, _id: 1 } },
    { $limit: 5000 },
    { $unwind: '$lines' },
    { $match: { 'lines.accountId': account._id } },
    {
      $project: {
        entryNumber: 1,
        date: 1,
        voucherType: 1,
        narration: { $ifNull: ['$lines.narration', '$narration'] },
        debitPaise: '$lines.debitPaise',
        creditPaise: '$lines.creditPaise',
      },
    },
  ]);
  const type = account.type as AccountType;
  const openingBalance = signedBalance(type, opening[0]?.debit ?? 0, opening[0]?.credit ?? 0);
  let running = openingBalance;
  const entries = rows.map((r) => {
    running += signedBalance(type, r.debitPaise, r.creditPaise);
    return { ...r, balancePaise: running };
  });
  return {
    account: { id: String(account._id), code: account.code, name: account.name, type },
    from,
    to,
    openingBalancePaise: openingBalance,
    entries,
    closingBalancePaise: running,
  };
}

import { addDays, addMonths } from './dates';
import { allocateProportionally, applyBasisPoints, assertPaise, type Paise } from './money';
import type { PaymentPlanRule } from './schemas/payment-plans';

export interface ScheduledInstallment {
  sequence: number;
  name: string;
  dueDate: string; // YYYY-MM-DD
  amountPaise: Paise;
}

export class ScheduleError extends Error {}

function dueDateFor(rule: PaymentPlanRule, bookingDate: string, repeatIndex: number): string {
  const offset = repeatIndex * (rule.repeat?.everyMonths ?? 0);
  switch (rule.due.kind) {
    case 'on_booking':
      return offset ? addMonths(bookingDate, offset) : bookingDate;
    case 'days_after_booking':
      return addMonths(addDays(bookingDate, rule.due.days), offset);
    case 'months_after_booking':
      return addMonths(bookingDate, rule.due.months + offset);
    case 'fixed_date':
      return offset ? addMonths(rule.due.date, offset) : rule.due.date;
  }
}

/**
 * Expand payment-plan rules into concrete installments for a net booking amount.
 *
 * Rules:
 * - `percent` rules take `valueBp` of the net amount.
 * - `fixed` rules take an exact amount.
 * - At most one `balance` rule receives whatever remains (must be >= 0).
 * - Without a `balance` rule, there must be no fixed rules and percents must sum to 100%;
 *   rounding differences are distributed with the largest-remainder method so the
 *   installments always sum exactly to the net amount.
 * - A rule with `repeat` is split evenly into `count` installments spaced `everyMonths` apart.
 */
export function generateSchedule(rules: readonly PaymentPlanRule[], netAmount: Paise, bookingDate: string): ScheduledInstallment[] {
  assertPaise(netAmount, 'net amount');
  if (netAmount <= 0) throw new ScheduleError('Net amount must be positive');
  if (rules.length === 0) throw new ScheduleError('Payment plan has no rules');

  const balanceRules = rules.filter((r) => r.type === 'balance');
  if (balanceRules.length > 1) throw new ScheduleError('Only one balance rule is allowed');

  const ruleAmounts: Paise[] = new Array(rules.length).fill(0);
  if (balanceRules.length === 0) {
    if (rules.some((r) => r.type === 'fixed')) {
      throw new ScheduleError('Plans with fixed-amount rules need a balance rule');
    }
    const weights = rules.map((r) => (r.type === 'percent' ? r.valueBp : 0));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total !== 10_000) throw new ScheduleError(`Percentages must total 100% (got ${total / 100}%)`);
    allocateProportionally(netAmount, weights).forEach((a, i) => (ruleAmounts[i] = a));
  } else {
    let allocated = 0;
    rules.forEach((r, i) => {
      if (r.type === 'percent') ruleAmounts[i] = applyBasisPoints(netAmount, r.valueBp);
      else if (r.type === 'fixed') ruleAmounts[i] = r.amountPaise;
      allocated += ruleAmounts[i]!;
    });
    const remainder = netAmount - allocated;
    if (remainder < 0) throw new ScheduleError('Plan rules exceed the booking amount');
    ruleAmounts[rules.findIndex((r) => r.type === 'balance')] = remainder;
  }

  const out: ScheduledInstallment[] = [];
  rules.forEach((rule, i) => {
    const count = rule.repeat?.count ?? 1;
    const parts = count > 1 ? allocateProportionally(ruleAmounts[i]!, new Array(count).fill(1)) : [ruleAmounts[i]!];
    parts.forEach((amount, k) => {
      if (amount === 0) return;
      out.push({
        sequence: 0,
        name: count > 1 ? `${rule.name} ${k + 1}/${count}` : rule.name,
        dueDate: dueDateFor(rule, bookingDate, k),
        amountPaise: amount,
      });
    });
  });

  // Stable order by due date, then by rule order.
  out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  out.forEach((x, idx) => (x.sequence = idx + 1));
  return out;
}

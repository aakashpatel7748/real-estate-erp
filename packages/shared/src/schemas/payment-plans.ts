import { z } from 'zod';
import { basisPoints, isoDate, objectId, optional, positivePaise, requiredText, trimmed } from './common';

const dueRule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('on_booking') }),
  z.object({ kind: z.literal('days_after_booking'), days: z.number().int().min(0).max(3650) }),
  z.object({ kind: z.literal('months_after_booking'), months: z.number().int().min(0).max(240) }),
  z.object({ kind: z.literal('fixed_date'), date: isoDate }),
]);

const repeat = z.object({
  count: z.number().int().min(2).max(240),
  everyMonths: z.number().int().min(1).max(12),
});

const base = { name: requiredText('Installment name', 80), due: dueRule, repeat: repeat.optional() };

export const paymentPlanRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('percent'), valueBp: basisPoints.refine((v) => v > 0, 'Must be above 0%'), ...base }),
  z.object({ type: z.literal('fixed'), amountPaise: positivePaise, ...base }),
  z.object({ type: z.literal('balance'), ...base }),
]);
export type PaymentPlanRule = z.infer<typeof paymentPlanRuleSchema>;

export const paymentPlanSchema = z
  .object({
    name: requiredText('Plan name', 100),
    description: trimmed(500).optional(),
    /** Optional: restrict the plan to one project; omitted = available to all projects. */
    projectId: optional(objectId),
    isActive: z.boolean().default(true),
    rules: z.array(paymentPlanRuleSchema).min(1).max(30),
  })
  .superRefine((plan, ctx) => {
    const balance = plan.rules.filter((r) => r.type === 'balance').length;
    if (balance > 1) ctx.addIssue({ code: 'custom', path: ['rules'], message: 'Only one balance rule is allowed' });
    if (balance === 0) {
      if (plan.rules.some((r) => r.type === 'fixed'))
        ctx.addIssue({ code: 'custom', path: ['rules'], message: 'Add a balance rule when using fixed amounts' });
      const total = plan.rules.reduce((s, r) => s + (r.type === 'percent' ? r.valueBp : 0), 0);
      if (total !== 10_000)
        ctx.addIssue({ code: 'custom', path: ['rules'], message: `Percentages must total 100% (currently ${total / 100}%)` });
    }
  });
export type PaymentPlanInput = z.infer<typeof paymentPlanSchema>;

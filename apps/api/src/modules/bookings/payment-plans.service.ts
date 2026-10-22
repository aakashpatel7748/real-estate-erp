import { generateSchedule, todayInIndia, type PaymentPlanInput } from '@erp/shared';
import { audit } from '../../utils/audit';
import { badRequest, notFound } from '../../utils/errors';
import { assertProjectAccess, toObjectId, type TenantContext } from '../../utils/tenant';
import { Project } from '../projects/project.models';
import { PaymentPlan } from './booking.models';

export async function listPlans(ctx: TenantContext, projectId?: string) {
  const filter: Record<string, unknown> = { companyId: ctx.companyId };
  if (projectId) {
    assertProjectAccess(ctx, projectId);
    filter.$or = [{ projectId: null }, { projectId: toObjectId(projectId) }];
  }
  return PaymentPlan.find(filter).sort({ isActive: -1, name: 1 }).lean();
}

async function validatePlan(ctx: TenantContext, input: Partial<PaymentPlanInput>) {
  if (input.projectId) {
    assertProjectAccess(ctx, input.projectId);
    if (!(await Project.exists({ companyId: ctx.companyId, _id: toObjectId(input.projectId) }))) throw badRequest('Project not found');
  }
  // Dry-run the generator so impossible plans are rejected up front.
  if (input.rules) generateSchedule(input.rules, 1_00_00_000_00, todayInIndia());
}

export async function createPlan(ctx: TenantContext, input: PaymentPlanInput) {
  await validatePlan(ctx, input);
  const plan = await PaymentPlan.create({ companyId: ctx.companyId, ...input, projectId: input.projectId ?? null });
  await audit(ctx, { action: 'paymentPlans.create', entityType: 'payment_plan', entityId: plan._id, summary: plan.name });
  return plan.toJSON();
}

/** Editing a plan never changes existing bookings: each booking keeps a snapshot. */
export async function updatePlan(ctx: TenantContext, id: string, input: PaymentPlanInput) {
  await validatePlan(ctx, input);
  const plan = await PaymentPlan.findOneAndUpdate(
    { companyId: ctx.companyId, _id: toObjectId(id) },
    { $set: { ...input, projectId: input.projectId ?? null } },
    { new: true, runValidators: true },
  ).lean();
  if (!plan) throw notFound('Payment plan');
  await audit(ctx, { action: 'paymentPlans.update', entityType: 'payment_plan', entityId: plan._id, changes: input });
  return plan;
}

import { Types } from 'mongoose';
import { parseISODate, type BlockInput, type ListQuery, type MapConfig, type PhaseInput, type ProjectInput } from '@erp/shared';
import { audit } from '../../utils/audit';
import { badRequest, businessRule, notFound } from '../../utils/errors';
import { escapeRegex, pageMeta, parseSort } from '../../utils/http';
import { assertProjectAccess, scopedFilter, toObjectId, type TenantContext } from '../../utils/tenant';
import { Plot } from '../plots/plot.models';
import { Block, Project, ProjectPhase } from './project.models';

function dateFields<T extends Record<string, unknown>>(input: T, keys: string[]): T {
  const out: Record<string, unknown> = { ...input };
  for (const k of keys) if (typeof out[k] === 'string') out[k] = parseISODate(out[k] as string);
  return out as T;
}

export async function listProjects(ctx: TenantContext, q: ListQuery & { status?: string; includeArchived?: boolean }) {
  const filter = scopedFilter(ctx, undefined, '_id');
  if (q.status) filter.status = q.status;
  else if (!q.includeArchived) filter.status = { $ne: 'archived' };
  if (q.q) filter.$or = [{ name: new RegExp(escapeRegex(q.q), 'i') }, { code: new RegExp(escapeRegex(q.q), 'i') }];
  const sort = parseSort(q.sort, ['name', 'code', 'createdAt', 'status'], { createdAt: -1 });
  const [items, total] = await Promise.all([
    Project.find(filter)
      .sort(sort)
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .lean(),
    Project.countDocuments(filter),
  ]);

  // Inventory summary per project in one aggregation.
  const stats = await Plot.aggregate<{ _id: { p: Types.ObjectId; s: string }; n: number; value: number }>([
    { $match: { companyId: ctx.companyId, projectId: { $in: items.map((p) => p._id) }, deletedAt: null } },
    { $group: { _id: { p: '$projectId', s: '$status' }, n: { $sum: 1 }, value: { $sum: '$listPricePaise' } } },
  ]);
  const withStats = items.map((p) => {
    const mine = stats.filter((s) => String(s._id.p) === String(p._id));
    const byStatus = Object.fromEntries(mine.map((s) => [s._id.s, s.n]));
    return { ...p, id: String(p._id), plotCounts: byStatus, totalPlots: mine.reduce((a, s) => a + s.n, 0) };
  });
  return { items: withStats, meta: pageMeta(q.page, q.pageSize, total) };
}

export async function getProject(ctx: TenantContext, id: string) {
  assertProjectAccess(ctx, id);
  const project = await Project.findOne({ companyId: ctx.companyId, _id: toObjectId(id) }).lean();
  if (!project) throw notFound('Project');
  const [phases, blocks] = await Promise.all([
    ProjectPhase.find({ companyId: ctx.companyId, projectId: project._id }).sort({ sequence: 1 }).lean(),
    Block.find({ companyId: ctx.companyId, projectId: project._id }).sort({ code: 1 }).lean(),
  ]);
  return { ...project, id: String(project._id), phases, blocks };
}

export async function createProject(ctx: TenantContext, input: ProjectInput) {
  if (ctx.projectScope !== null) throw businessRule('Users restricted to specific projects cannot create projects');
  const project = await Project.create({ companyId: ctx.companyId, ...dateFields(input, ['launchDate']), createdBy: ctx.userId });
  await audit(ctx, { action: 'projects.create', entityType: 'project', entityId: project._id, summary: project.name });
  return project.toJSON();
}

export async function updateProject(ctx: TenantContext, id: string, input: Partial<ProjectInput>) {
  assertProjectAccess(ctx, id);
  const project = await Project.findOneAndUpdate(
    { companyId: ctx.companyId, _id: toObjectId(id) },
    { $set: dateFields(input, ['launchDate']) },
    { new: true, runValidators: true },
  ).lean();
  if (!project) throw notFound('Project');
  await audit(ctx, { action: 'projects.update', entityType: 'project', entityId: project._id, changes: input });
  return project;
}

export async function archiveProject(ctx: TenantContext, id: string) {
  assertProjectAccess(ctx, id);
  const projectId = toObjectId(id);
  const active = await Plot.exists({ companyId: ctx.companyId, projectId, status: { $in: ['reserved', 'booked'] } });
  if (active) throw businessRule('Projects with reserved or booked plots cannot be archived');
  const project = await Project.findOneAndUpdate(
    { companyId: ctx.companyId, _id: projectId },
    { $set: { status: 'archived', archivedAt: new Date() } },
    { new: true },
  ).lean();
  if (!project) throw notFound('Project');
  await audit(ctx, { action: 'projects.archive', entityType: 'project', entityId: projectId });
  return project;
}

export async function updateMapConfig(ctx: TenantContext, id: string, map: MapConfig) {
  assertProjectAccess(ctx, id);
  const project = await Project.findOneAndUpdate(
    { companyId: ctx.companyId, _id: toObjectId(id) },
    { $set: { map } },
    { new: true },
  ).lean();
  if (!project) throw notFound('Project');
  return project.map;
}

async function requireProject(ctx: TenantContext, projectId: string) {
  assertProjectAccess(ctx, projectId);
  const exists = await Project.exists({ companyId: ctx.companyId, _id: toObjectId(projectId) });
  if (!exists) throw notFound('Project');
  return toObjectId(projectId);
}

export async function createPhase(ctx: TenantContext, projectId: string, input: PhaseInput) {
  const pid = await requireProject(ctx, projectId);
  const phase = await ProjectPhase.create({ companyId: ctx.companyId, projectId: pid, ...dateFields(input, ['startDate', 'targetDate']) });
  await audit(ctx, { action: 'projects.phase_create', entityType: 'phase', entityId: phase._id, summary: phase.name });
  return phase.toJSON();
}

export async function updatePhase(ctx: TenantContext, projectId: string, phaseId: string, input: Partial<PhaseInput>) {
  const pid = await requireProject(ctx, projectId);
  const phase = await ProjectPhase.findOneAndUpdate(
    { companyId: ctx.companyId, projectId: pid, _id: toObjectId(phaseId) },
    { $set: dateFields(input, ['startDate', 'targetDate']) },
    { new: true, runValidators: true },
  ).lean();
  if (!phase) throw notFound('Phase');
  return phase;
}

export async function deletePhase(ctx: TenantContext, projectId: string, phaseId: string) {
  const pid = await requireProject(ctx, projectId);
  const id = toObjectId(phaseId);
  if (await Plot.exists({ companyId: ctx.companyId, projectId: pid, phaseId: id, deletedAt: null })) throw businessRule('Phase has plots');
  if (await Block.exists({ companyId: ctx.companyId, projectId: pid, phaseId: id })) throw businessRule('Phase has blocks');
  const res = await ProjectPhase.deleteOne({ companyId: ctx.companyId, projectId: pid, _id: id });
  if (!res.deletedCount) throw notFound('Phase');
}

export async function createBlock(ctx: TenantContext, projectId: string, input: BlockInput) {
  const pid = await requireProject(ctx, projectId);
  if (input.phaseId && !(await ProjectPhase.exists({ companyId: ctx.companyId, projectId: pid, _id: toObjectId(input.phaseId) }))) {
    throw badRequest('Phase does not belong to this project');
  }
  const block = await Block.create({ companyId: ctx.companyId, projectId: pid, ...input });
  await audit(ctx, { action: 'projects.block_create', entityType: 'block', entityId: block._id, summary: block.name });
  return block.toJSON();
}

export async function updateBlock(ctx: TenantContext, projectId: string, blockId: string, input: Partial<BlockInput>) {
  const pid = await requireProject(ctx, projectId);
  if (input.phaseId && !(await ProjectPhase.exists({ companyId: ctx.companyId, projectId: pid, _id: toObjectId(input.phaseId) }))) {
    throw badRequest('Phase does not belong to this project');
  }
  const block = await Block.findOneAndUpdate(
    { companyId: ctx.companyId, projectId: pid, _id: toObjectId(blockId) },
    { $set: input },
    { new: true, runValidators: true },
  ).lean();
  if (!block) throw notFound('Block');
  return block;
}

export async function deleteBlock(ctx: TenantContext, projectId: string, blockId: string) {
  const pid = await requireProject(ctx, projectId);
  const id = toObjectId(blockId);
  if (await Plot.exists({ companyId: ctx.companyId, projectId: pid, blockId: id, deletedAt: null })) throw businessRule('Block has plots');
  const res = await Block.deleteOne({ companyId: ctx.companyId, projectId: pid, _id: id });
  if (!res.deletedCount) throw notFound('Block');
}

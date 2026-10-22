import type { RoleInput } from '@erp/shared';
import { audit } from '../../utils/audit';
import { businessRule, notFound } from '../../utils/errors';
import { toObjectId, type TenantContext } from '../../utils/tenant';
import { Membership } from '../users/user.models';
import { Role } from './role.models';

export async function listRoles(ctx: TenantContext) {
  const roles = await Role.find({ companyId: ctx.companyId }).sort({ isSystem: -1, name: 1 }).lean();
  const counts = await Membership.aggregate<{ _id: unknown; n: number }>([
    { $match: { companyId: ctx.companyId, status: 'active' } },
    { $group: { _id: '$roleId', n: { $sum: 1 } } },
  ]);
  return roles.map((r) => ({ ...r, id: String(r._id), memberCount: counts.find((c) => String(c._id) === String(r._id))?.n ?? 0 }));
}

export async function createRole(ctx: TenantContext, input: RoleInput) {
  const role = await Role.create({ companyId: ctx.companyId, ...input, permissions: [...new Set(input.permissions)], isSystem: false });
  await audit(ctx, {
    action: 'roles.create',
    entityType: 'role',
    entityId: role._id,
    changes: { name: role.name, permissions: role.permissions },
  });
  return role.toJSON();
}

export async function updateRole(ctx: TenantContext, id: string, input: Partial<RoleInput>) {
  const role = await Role.findOne({ companyId: ctx.companyId, _id: toObjectId(id) });
  if (!role) throw notFound('Role');
  if (role.systemKey === 'owner' && input.permissions) throw businessRule('Owner permissions cannot be changed');
  if (String(role._id) === String(ctx.roleId) && input.permissions && !input.permissions.includes('roles.update')) {
    throw businessRule('You cannot remove role management from your own role');
  }
  const before = { name: role.name, permissions: [...role.permissions] };
  if (input.name !== undefined) role.name = input.name;
  if (input.description !== undefined) role.description = input.description;
  if (input.permissions) role.set('permissions', [...new Set(input.permissions)]);
  await role.save();
  await audit(ctx, {
    action: 'roles.update',
    entityType: 'role',
    entityId: role._id,
    changes: { before, after: { name: role.name, permissions: role.permissions } },
  });
  return role.toJSON();
}

export async function deleteRole(ctx: TenantContext, id: string) {
  const role = await Role.findOne({ companyId: ctx.companyId, _id: toObjectId(id) });
  if (!role) throw notFound('Role');
  if (role.isSystem) throw businessRule('System roles cannot be deleted');
  if (await Membership.exists({ companyId: ctx.companyId, roleId: role._id }))
    throw businessRule('Reassign members before deleting this role');
  await Role.deleteOne({ companyId: ctx.companyId, _id: role._id });
  await audit(ctx, { action: 'roles.delete', entityType: 'role', entityId: role._id, summary: role.name });
}

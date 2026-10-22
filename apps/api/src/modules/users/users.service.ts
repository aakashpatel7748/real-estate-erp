import { Types } from 'mongoose';
import type { InviteUserInput, ListQuery, UpdateMembershipInput } from '@erp/shared';
import { env } from '../../config/env';
import { withTransaction } from '../../db/transaction';
import { audit } from '../../utils/audit';
import { randomToken, sha256 } from '../../utils/crypto';
import { badRequest, businessRule, conflict, forbidden, notFound } from '../../utils/errors';
import { escapeRegex, pageMeta } from '../../utils/http';
import { sendMail } from '../../utils/mailer';
import { requirePermission, toObjectId, type TenantContext } from '../../utils/tenant';
import { Invitation } from '../auth/auth.models';
import { Company } from '../companies/company.model';
import { Project } from '../projects/project.models';
import { Role } from '../roles/role.models';
import { Membership, User } from './user.models';

async function assertRole(ctx: TenantContext, roleId: string) {
  const role = await Role.findOne({ companyId: ctx.companyId, _id: toObjectId(roleId) }).lean();
  if (!role) throw badRequest('Role not found in this company');
  return role;
}

async function normalizeProjectAccess(ctx: TenantContext, access: InviteUserInput['projectAccess']) {
  if (access.mode === 'all') return { mode: 'all' as const, projectIds: [] };
  const ids = [...new Set(access.projectIds)].map((id) => new Types.ObjectId(id));
  const count = await Project.countDocuments({ companyId: ctx.companyId, _id: { $in: ids } });
  if (count !== ids.length) throw badRequest('One or more projects do not belong to this company');
  return { mode: 'restricted' as const, projectIds: ids };
}

export async function listMembers(ctx: TenantContext, q: ListQuery) {
  const userFilter = q.q ? { $or: [{ name: new RegExp(escapeRegex(q.q), 'i') }, { email: new RegExp(escapeRegex(q.q), 'i') }] } : null;
  const filter: Record<string, unknown> = { companyId: ctx.companyId };
  if (userFilter) {
    const users = await User.find(userFilter).select('_id').limit(500).lean();
    filter.userId = { $in: users.map((u) => u._id) };
  }
  const [items, total] = await Promise.all([
    Membership.find(filter)
      .sort({ createdAt: 1 })
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .populate('userId', 'name email lastLoginAt emailVerifiedAt isActive')
      .populate({ path: 'roleId', select: 'name systemKey', match: { companyId: ctx.companyId } })
      .lean(),
    Membership.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(q.page, q.pageSize, total) };
}

export async function inviteUser(ctx: TenantContext, input: InviteUserInput) {
  await assertRole(ctx, input.roleId);
  const projectAccess = await normalizeProjectAccess(ctx, input.projectAccess);
  const existingUser = await User.findOne({ email: input.email }).select('_id').lean();
  if (existingUser && (await Membership.exists({ companyId: ctx.companyId, userId: existingUser._id, status: 'active' }))) {
    throw conflict('This user is already a member of the company');
  }
  await Invitation.updateMany({ companyId: ctx.companyId, email: input.email, status: 'pending' }, { $set: { status: 'revoked' } });
  const token = randomToken();
  const invitation = await Invitation.create({
    companyId: ctx.companyId,
    email: input.email,
    roleId: input.roleId,
    projectAccess,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
    invitedBy: ctx.userId,
  });
  const company = await Company.findById(ctx.companyId).select('name').lean();
  await sendMail({
    to: input.email,
    subject: `You're invited to ${company?.name ?? 'a company'}`,
    text: `You have been invited to join ${company?.name} on Real Estate ERP.\n\nAccept the invitation:\n${env.APP_URL}/accept-invite?token=${token}\n\nThis link expires in 7 days.`,
  });
  await audit(ctx, {
    action: 'users.invite',
    entityType: 'invitation',
    entityId: invitation._id,
    summary: input.email,
    changes: { roleId: input.roleId },
  });
  return { id: String(invitation._id), email: invitation.email, expiresAt: invitation.expiresAt };
}

export async function listInvitations(ctx: TenantContext) {
  return Invitation.find({ companyId: ctx.companyId, status: 'pending', expiresAt: { $gt: new Date() } })
    .populate({ path: 'roleId', select: 'name', match: { companyId: ctx.companyId } })
    .sort({ createdAt: -1 })
    .lean();
}

export async function revokeInvitation(ctx: TenantContext, id: string) {
  const res = await Invitation.updateOne(
    { companyId: ctx.companyId, _id: toObjectId(id), status: 'pending' },
    { $set: { status: 'revoked' } },
  );
  if (!res.matchedCount) throw notFound('Invitation');
  await audit(ctx, { action: 'users.invitation_revoked', entityType: 'invitation', entityId: id });
}

/** Changing roles, project access or status. Guards against locking the company out. */
export async function updateMembership(ctx: TenantContext, membershipId: string, input: UpdateMembershipInput) {
  return withTransaction(async (session) => {
    const membership = await Membership.findOne({ companyId: ctx.companyId, _id: toObjectId(membershipId) }).session(session);
    if (!membership) throw notFound('User');
    if (input.status && input.status !== membership.status) requirePermission(ctx, 'users.deactivate');
    if (String(membership.userId) === String(ctx.userId) && (input.roleId || input.status)) {
      throw forbidden('You cannot change your own role or status');
    }

    const before = { roleId: String(membership.roleId), status: membership.status, projectAccess: membership.projectAccess };
    const ownerRole = await Role.findOne({ companyId: ctx.companyId, systemKey: 'owner' }).session(session).lean();
    const wasActiveOwner = String(membership.roleId) === String(ownerRole?._id) && membership.status === 'active';

    if (input.roleId) membership.roleId = (await assertRole(ctx, input.roleId))._id;
    if (input.projectAccess) membership.set('projectAccess', await normalizeProjectAccess(ctx, input.projectAccess));
    if (input.status) membership.status = input.status;

    const stillActiveOwner = String(membership.roleId) === String(ownerRole?._id) && membership.status === 'active';
    if (wasActiveOwner && !stillActiveOwner) {
      const owners = await Membership.countDocuments({ companyId: ctx.companyId, roleId: ownerRole!._id, status: 'active' }).session(
        session,
      );
      if (owners <= 1) throw businessRule('The company must keep at least one active owner');
    }
    await membership.save({ session });
    await audit(
      ctx,
      {
        action: 'users.membership_update',
        entityType: 'membership',
        entityId: membership._id,
        changes: {
          before,
          after: { roleId: String(membership.roleId), status: membership.status, projectAccess: membership.projectAccess },
        },
      },
      session,
    );
    return membership.toJSON();
  });
}

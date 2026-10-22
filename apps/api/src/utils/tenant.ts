import { Types } from 'mongoose';
import type { Request } from 'express';
import type { Permission } from '@erp/shared';
import { forbidden, notFound, unauthenticated } from './errors';

/**
 * Server-established tenant context. Built only by the `tenant` middleware after verifying
 * the session, company membership and role. Services receive it explicitly and scope every
 * query with it; a companyId from the request body or query is never trusted.
 */
export interface TenantContext {
  userId: Types.ObjectId;
  companyId: Types.ObjectId;
  roleId: Types.ObjectId;
  permissions: ReadonlySet<string>;
  /** null = all projects; otherwise the only projects this user may touch. */
  projectScope: Types.ObjectId[] | null;
  meta: { ip?: string; userAgent?: string; requestId?: string };
}

export function getCtx(req: Request): TenantContext {
  if (!req.ctx) throw unauthenticated('Select a company first');
  return req.ctx;
}

export function hasPermission(ctx: TenantContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

export function requirePermission(ctx: TenantContext, permission: Permission): void {
  if (!ctx.permissions.has(permission)) throw forbidden();
}

export function toObjectId(id: string | Types.ObjectId): Types.ObjectId {
  if (id instanceof Types.ObjectId) return id;
  if (!Types.ObjectId.isValid(id) || String(new Types.ObjectId(id)) !== id.toLowerCase()) throw notFound();
  return new Types.ObjectId(id);
}

export function canAccessProject(ctx: TenantContext, projectId: Types.ObjectId | string): boolean {
  if (ctx.projectScope === null) return true;
  const id = String(projectId);
  return ctx.projectScope.some((p) => String(p) === id);
}

/** Throws 404 (not 403) so users cannot probe for projects they are not assigned to. */
export function assertProjectAccess(ctx: TenantContext, projectId: Types.ObjectId | string): void {
  if (!canAccessProject(ctx, projectId)) throw notFound('Project');
}

/**
 * Base filter for tenant + project scoped collections. If `projectId` is given it must be
 * accessible; otherwise restricted users are limited to their project list.
 */
export function scopedFilter(ctx: TenantContext, projectId?: string | Types.ObjectId, field = 'projectId'): Record<string, unknown> {
  const filter: Record<string, unknown> = { companyId: ctx.companyId };
  if (projectId) {
    assertProjectAccess(ctx, projectId);
    filter[field] = toObjectId(projectId);
  } else if (ctx.projectScope !== null) {
    filter[field] = { $in: ctx.projectScope };
  }
  return filter;
}

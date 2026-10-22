import type { ClientSession, Types } from 'mongoose';
import { AuditLog } from '../modules/audit/audit.model';
import type { TenantContext } from './tenant';

export interface AuditEvent {
  action: string;
  entityType: string;
  entityId?: Types.ObjectId | string;
  summary?: string;
  changes?: Record<string, unknown>;
}

/**
 * Record an audit event. Pass the transaction session for business operations so the
 * audit record commits (or rolls back) atomically with the change it describes.
 */
export async function audit(ctx: Pick<TenantContext, 'companyId' | 'userId' | 'meta'> | null, event: AuditEvent, session?: ClientSession) {
  await AuditLog.create(
    [
      {
        companyId: ctx?.companyId,
        actorId: ctx?.userId,
        ...event,
        ip: ctx?.meta.ip,
        userAgent: ctx?.meta.userAgent?.slice(0, 300),
        requestId: ctx?.meta.requestId,
      },
    ],
    { session },
  );
}

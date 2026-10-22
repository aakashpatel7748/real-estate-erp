import { model, Schema } from 'mongoose';
import { baseOptions } from '../../db/base';

/**
 * Append-only audit trail. Not tenant-guarded because auth events (failed logins) may have
 * no company; every read path still filters by companyId.
 */
const auditSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId },
    summary: String,
    changes: Schema.Types.Mixed,
    ip: String,
    userAgent: String,
    requestId: String,
  },
  { ...baseOptions, timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ companyId: 1, createdAt: -1 });
auditSchema.index({ companyId: 1, entityType: 1, entityId: 1, createdAt: -1 });
auditSchema.index({ companyId: 1, actorId: 1, createdAt: -1 });
auditSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'], function () {
  throw new Error('Audit logs are immutable');
});
export const AuditLog = model('AuditLog', auditSchema);

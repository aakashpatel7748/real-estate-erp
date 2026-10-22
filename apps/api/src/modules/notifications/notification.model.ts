import { model, Schema } from 'mongoose';
import { baseOptions, tenantRef, withTenant } from '../../db/base';

const notificationSchema = withTenant(
  new Schema(
    {
      companyId: tenantRef,
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      type: { type: String, required: true },
      title: { type: String, required: true },
      body: String,
      link: String,
      readAt: Date,
      /** Prevents duplicate reminders, e.g. "installment-due:<id>:<date>". */
      dedupeKey: String,
    },
    baseOptions,
  ),
);
notificationSchema.index({ companyId: 1, userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });
export const Notification = model('Notification', notificationSchema);

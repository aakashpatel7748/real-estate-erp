import { model, Schema, type ClientSession, type Types } from 'mongoose';
import { baseOptions, tenantRef, withTenant } from './base';

/** Per-company sequence counters (booking numbers, receipt numbers, voucher numbers). */
const counterSchema = withTenant(
  new Schema(
    {
      companyId: tenantRef,
      key: { type: String, required: true },
      seq: { type: Number, required: true, default: 0 },
    },
    baseOptions,
  ),
);
counterSchema.index({ companyId: 1, key: 1 }, { unique: true });
export const Counter = model('Counter', counterSchema);

/**
 * Concurrency-safe sequence allocation. `$inc` on a single document is atomic; inside a
 * transaction the increment commits or rolls back together with the business record, so
 * numbers are unique and gap-free for committed records.
 */
export async function nextSequence(companyId: Types.ObjectId, key: string, session: ClientSession): Promise<number> {
  const doc = await Counter.findOneAndUpdate({ companyId, key }, { $inc: { seq: 1 } }, { upsert: true, new: true, session });
  return doc!.seq;
}

const idempotencySchema = withTenant(
  new Schema(
    {
      companyId: tenantRef,
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      key: { type: String, required: true, maxlength: 100 },
      route: { type: String, required: true },
      requestHash: { type: String, required: true },
      state: { type: String, enum: ['in_progress', 'completed'], required: true },
      responseStatus: Number,
      responseBody: Schema.Types.Mixed,
      expiresAt: { type: Date, required: true },
    },
    baseOptions,
  ),
);
idempotencySchema.index({ companyId: 1, userId: 1, key: 1 }, { unique: true });
idempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const IdempotencyKey = model('IdempotencyKey', idempotencySchema);

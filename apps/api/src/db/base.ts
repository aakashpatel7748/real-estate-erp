import mongoose, { Schema } from 'mongoose';
import { tenantGuard } from './tenant-guard';

// Consistent JSON output: `id` instead of `_id`, no `__v`, never leak secrets.
mongoose.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret._id;
    delete ret.passwordHash;
    delete ret.tokenHash;
    return ret;
  },
});

export const { ObjectId } = Schema.Types;

export const baseOptions = { timestamps: true as const };

/** `companyId` field definition for tenant-owned collections. */
export const tenantRef = { type: Schema.Types.ObjectId, ref: 'Company', required: true as const, immutable: true };

/** Marks a schema as tenant-owned: every query must filter by companyId (see tenant-guard). */
export function withTenant<S extends Schema>(schema: S): S {
  schema.plugin(tenantGuard);
  return schema;
}

export const addressDef = {
  line1: String,
  line2: String,
  city: String,
  state: String,
  pincode: String,
};

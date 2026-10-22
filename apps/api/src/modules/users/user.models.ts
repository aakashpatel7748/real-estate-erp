import { model, Schema, type InferSchemaType } from 'mongoose';
import { MEMBERSHIP_STATUSES } from '@erp/shared';
import { baseOptions, tenantRef, withTenant } from '../../db/base';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    emailVerifiedAt: Date,
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: Date,
    /** Marks development seed accounts so deploy checks can refuse to run with them enabled. */
    isDevSeed: { type: Boolean, default: false },
  },
  baseOptions,
);
export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);

/** Links a user to a company with a role and an optional project restriction. */
const membershipSchema = withTenant(
  new Schema(
    {
      companyId: tenantRef,
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
      status: { type: String, enum: MEMBERSHIP_STATUSES, default: 'active', required: true },
      projectAccess: {
        mode: { type: String, enum: ['all', 'restricted'], default: 'all', required: true },
        projectIds: [{ type: Schema.Types.ObjectId, ref: 'Project' }],
      },
      invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    baseOptions,
  ),
);
membershipSchema.index({ companyId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ userId: 1, status: 1 });
export type MembershipDoc = InferSchemaType<typeof membershipSchema>;
export const Membership = model('Membership', membershipSchema);

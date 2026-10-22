import { model, Schema } from 'mongoose';
import { baseOptions, tenantRef, withTenant } from '../../db/base';

/**
 * One document per login session. The refresh token rotates on every use: the current
 * token's hash is in `tokenHash`, the immediately previous one in `previousTokenHash`.
 * Presenting the previous token after the grace window means the token was stolen and
 * replayed, so the whole session is revoked (refresh-token reuse detection).
 * Access tokens carry the session id, so revoking a session invalidates them immediately.
 */
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    previousTokenHash: { type: String },
    rotatedAt: Date,
    activeCompanyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    userAgent: String,
    ip: String,
    expiresAt: { type: Date, required: true },
    lastUsedAt: Date,
    revokedAt: Date,
    revokedReason: String,
  },
  baseOptions,
);
sessionSchema.index({ userId: 1, revokedAt: 1 });
sessionSchema.index({ previousTokenHash: 1 }, { sparse: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });
export const Session = model('Session', sessionSchema);

const authTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['verify_email', 'reset_password'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  baseOptions,
);
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AuthToken = model('AuthToken', authTokenSchema);

const invitationSchema = withTenant(
  new Schema(
    {
      companyId: tenantRef,
      email: { type: String, required: true, lowercase: true, trim: true },
      roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
      projectAccess: {
        mode: { type: String, enum: ['all', 'restricted'], default: 'all' },
        projectIds: [{ type: Schema.Types.ObjectId, ref: 'Project' }],
      },
      tokenHash: { type: String, required: true, unique: true },
      status: { type: String, enum: ['pending', 'accepted', 'revoked'], default: 'pending' },
      expiresAt: { type: Date, required: true },
      acceptedAt: Date,
      invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    baseOptions,
  ),
);
invitationSchema.index({ companyId: 1, email: 1, status: 1 });
export const Invitation = model('Invitation', invitationSchema);

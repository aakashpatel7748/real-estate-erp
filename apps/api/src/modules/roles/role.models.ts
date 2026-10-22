import { model, Schema } from 'mongoose';
import { ALL_PERMISSIONS } from '@erp/shared';
import { baseOptions, tenantRef, withTenant } from '../../db/base';

const roleSchema = withTenant(
  new Schema(
    {
      companyId: tenantRef,
      name: { type: String, required: true, trim: true, maxlength: 60 },
      /** Stable key for system roles (owner, manager, ...). Absent for custom roles. */
      systemKey: String,
      description: String,
      permissions: {
        type: [{ type: String, enum: ALL_PERMISSIONS }],
        default: [],
      },
      isSystem: { type: Boolean, default: false },
    },
    baseOptions,
  ),
);
roleSchema.index({ companyId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
roleSchema.index({ companyId: 1, systemKey: 1 }, { unique: true, partialFilterExpression: { systemKey: { $type: 'string' } } });
export const Role = model('Role', roleSchema);

/** Global permission catalog, seeded from `@erp/shared` so admins can browse descriptions. */
const permissionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    group: { type: String, required: true },
    action: { type: String, required: true },
    label: String,
  },
  baseOptions,
);
export const Permission = model('Permission', permissionSchema);

import { model, Schema } from 'mongoose';
import { LAND_STATUSES } from '@erp/shared';
import { baseOptions, tenantRef, withTenant } from '../../db/base';

/** Land acquisition record (Phase 2 module; schema defined now so the data model is complete). */
const landParcelSchema = withTenant(
  new Schema(
    {
      companyId: tenantRef,
      projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
      khasraNumber: { type: String, required: true, trim: true },
      khataNumber: String,
      village: { type: String, required: true },
      tehsil: String,
      district: { type: String, required: true },
      state: { type: String, required: true },
      areaX100: { type: Number, required: true, min: 1 },
      areaUnit: { type: String, enum: ['sqft', 'sqm', 'acre', 'bigha', 'hectare'], default: 'sqft' },
      owners: [{ name: { type: String, required: true }, sharePercentBp: Number, phone: String }],
      status: { type: String, enum: LAND_STATUSES, default: 'negotiation', required: true },
      agreedCostPaise: { type: Number, min: 0 },
      paidPaise: { type: Number, min: 0, default: 0 },
      agreementDate: Date,
      registryDate: Date,
      mutationDone: { type: Boolean, default: false },
      landUseConversion: { status: String, orderNumber: String, date: Date },
      notes: String,
      deletedAt: Date,
    },
    baseOptions,
  ),
);
landParcelSchema.index({ companyId: 1, district: 1, village: 1, khasraNumber: 1 }, { unique: true });
landParcelSchema.index({ companyId: 1, projectId: 1, status: 1 });
export const LandParcel = model('LandParcel', landParcelSchema);

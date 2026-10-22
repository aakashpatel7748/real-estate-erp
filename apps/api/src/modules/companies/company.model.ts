import { model, Schema, type InferSchemaType } from 'mongoose';
import { OVERPAYMENT_POLICIES } from '@erp/shared';
import { addressDef, baseOptions } from '../../db/base';

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    legalName: String,
    gstin: String,
    pan: String,
    phone: String,
    email: String,
    address: addressDef,
    settings: {
      overpaymentPolicy: { type: String, enum: OVERPAYMENT_POLICIES, default: 'advance' },
      reservationHoldHours: { type: Number, default: 72, min: 1 },
      receiptPrefix: { type: String, default: 'RCPT' },
      bookingPrefix: { type: String, default: 'BKG' },
    },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  baseOptions,
);

export type CompanyDoc = InferSchemaType<typeof companySchema>;
export const Company = model('Company', companySchema);

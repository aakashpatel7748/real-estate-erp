import { model, Schema, type InferSchemaType } from 'mongoose';
import { addressDef, baseOptions, tenantRef, withTenant } from '../../db/base';

const coApplicantSchema = new Schema(
  {
    name: { type: String, required: true },
    relation: String,
    phone: String,
    email: String,
    pan: String,
    sharePercentBp: Number,
  },
  { _id: true },
);

const customerSchema = withTenant(
  new Schema(
    {
      companyId: tenantRef,
      customerCode: { type: String, required: true },
      name: { type: String, required: true, trim: true, maxlength: 120 },
      phone: { type: String, required: true, trim: true },
      altPhone: String,
      email: { type: String, lowercase: true, trim: true },
      pan: { type: String, uppercase: true },
      aadhaarLast4: String,
      dateOfBirth: Date,
      occupation: String,
      address: addressDef,
      coApplicants: { type: [coApplicantSchema], default: [] },
      notes: String,
      leadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
      createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      deletedAt: Date,
    },
    baseOptions,
  ),
);
customerSchema.index({ companyId: 1, customerCode: 1 }, { unique: true });
customerSchema.index({ companyId: 1, phone: 1 });
customerSchema.index({ companyId: 1, name: 1 });
customerSchema.index({ companyId: 1, createdAt: -1 });
export type CustomerDoc = InferSchemaType<typeof customerSchema>;
export const Customer = model('Customer', customerSchema);

const brokerSchema = withTenant(
  new Schema(
    {
      companyId: tenantRef,
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true },
      email: String,
      pan: String,
      firmName: String,
      /** Default commission in basis points of the booking net amount. */
      commissionBp: { type: Number, default: 0, min: 0, max: 10_000 },
      isActive: { type: Boolean, default: true },
    },
    baseOptions,
  ),
);
brokerSchema.index({ companyId: 1, phone: 1 }, { unique: true });
export const Broker = model('Broker', brokerSchema);

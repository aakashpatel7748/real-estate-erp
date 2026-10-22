import { model, Schema, type InferSchemaType } from 'mongoose';
import { PAYMENT_KINDS, PAYMENT_MODES, PAYMENT_STATUSES } from '@erp/shared';
import { baseOptions, tenantRef, withTenant } from '../../db/base';

const paymentSchema = withTenant(
  new Schema(
    {
      companyId: tenantRef,
      projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, immutable: true },
      bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, immutable: true },
      customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, immutable: true },
      kind: { type: String, enum: PAYMENT_KINDS, required: true, immutable: true },
      /** Receipt number (receipts) or voucher number (refunds). Unique per company. */
      number: { type: String, required: true, immutable: true },
      amountPaise: { type: Number, required: true, min: 1, immutable: true },
      allocatedPaise: { type: Number, default: 0, min: 0 },
      /** Part of a receipt held as customer advance because it exceeded the outstanding dues. */
      advancePaise: { type: Number, default: 0, min: 0 },
      mode: { type: String, enum: PAYMENT_MODES, required: true },
      reference: String,
      bankName: String,
      date: { type: Date, required: true },
      accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
      status: { type: String, enum: PAYMENT_STATUSES, default: 'received', required: true },
      journalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
      reversal: {
        reason: String,
        at: Date,
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        journalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
      },
      remarks: String,
      createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    baseOptions,
  ),
);
paymentSchema.index({ companyId: 1, number: 1 }, { unique: true });
paymentSchema.index({ companyId: 1, bookingId: 1, createdAt: 1 });
paymentSchema.index({ companyId: 1, projectId: 1, date: -1 });
paymentSchema.index({ companyId: 1, customerId: 1 });
export type PaymentDoc = InferSchemaType<typeof paymentSchema>;
export const Payment = model('Payment', paymentSchema);

/** Links part of a receipt to one installment. Reversed allocations are kept, never deleted. */
const allocationSchema = withTenant(
  new Schema(
    {
      companyId: tenantRef,
      paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
      installmentId: { type: Schema.Types.ObjectId, ref: 'Installment', required: true },
      bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
      amountPaise: { type: Number, required: true, min: 1 },
      reversedAt: Date,
    },
    baseOptions,
  ),
);
allocationSchema.index({ companyId: 1, paymentId: 1 });
allocationSchema.index({ companyId: 1, installmentId: 1 });
export const PaymentAllocation = model('PaymentAllocation', allocationSchema);

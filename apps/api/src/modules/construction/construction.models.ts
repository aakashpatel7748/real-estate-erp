import { model, Schema } from 'mongoose';
import { WORK_ORDER_STATUSES } from '@erp/shared';
import { addressDef, baseOptions, tenantRef, withTenant } from '../../db/base';

/** Vendors, work orders and expenses (Phase 2 modules). */
const vendorSchema = withTenant(
  new Schema(
    {
      companyId: tenantRef,
      name: { type: String, required: true, trim: true },
      category: {
        type: String,
        enum: ['civil', 'electrical', 'plumbing', 'road', 'landscaping', 'material', 'consultant', 'other'],
        default: 'other',
      },
      phone: String,
      email: String,
      gstin: String,
      pan: String,
      address: addressDef,
      isActive: { type: Boolean, default: true },
    },
    baseOptions,
  ),
);
vendorSchema.index({ companyId: 1, name: 1 }, { unique: true });
export const Vendor = model('Vendor', vendorSchema);

const workOrderSchema = withTenant(
  new Schema(
    {
      companyId: tenantRef,
      projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
      vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true },
      number: { type: String, required: true },
      title: { type: String, required: true },
      scope: String,
      amountPaise: { type: Number, required: true, min: 0 },
      billedPaise: { type: Number, default: 0, min: 0 },
      status: { type: String, enum: WORK_ORDER_STATUSES, default: 'draft' },
      milestones: [
        {
          name: { type: String, required: true },
          percentBp: Number,
          dueDate: Date,
          completedAt: Date,
        },
      ],
      startDate: Date,
      endDate: Date,
    },
    baseOptions,
  ),
);
workOrderSchema.index({ companyId: 1, number: 1 }, { unique: true });
workOrderSchema.index({ companyId: 1, projectId: 1, status: 1 });
export const WorkOrder = model('WorkOrder', workOrderSchema);

const expenseSchema = withTenant(
  new Schema(
    {
      companyId: tenantRef,
      projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
      vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor' },
      workOrderId: { type: Schema.Types.ObjectId, ref: 'WorkOrder' },
      expenseAccountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
      date: { type: Date, required: true },
      amountPaise: { type: Number, required: true, min: 1 },
      description: { type: String, required: true },
      journalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
      createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    baseOptions,
  ),
);
expenseSchema.index({ companyId: 1, projectId: 1, date: -1 });
export const Expense = model('Expense', expenseSchema);

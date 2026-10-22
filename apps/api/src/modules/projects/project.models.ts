import { model, Schema, type InferSchemaType } from 'mongoose';
import { PROJECT_STATUSES } from '@erp/shared';
import { addressDef, baseOptions, tenantRef, withTenant } from '../../db/base';

const projectSchema = withTenant(
  new Schema(
    {
      companyId: tenantRef,
      name: { type: String, required: true, trim: true, maxlength: 150 },
      code: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
      status: { type: String, enum: PROJECT_STATUSES, default: 'planning', required: true },
      description: String,
      address: addressDef,
      reraNumber: String,
      totalAreaX100: { type: Number, min: 0 },
      launchDate: Date,
      defaultRatePaisePerSqft: { type: Number, min: 0 },
      map: {
        width: { type: Number, default: 1200 },
        height: { type: Number, default: 800 },
        backgroundColor: { type: String, default: '#f8fafc' },
      },
      archivedAt: Date,
      createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    baseOptions,
  ),
);
projectSchema.index({ companyId: 1, code: 1 }, { unique: true });
projectSchema.index({ companyId: 1, status: 1, createdAt: -1 });
export type ProjectDoc = InferSchemaType<typeof projectSchema>;
export const Project = model('Project', projectSchema);

const phaseSchema = withTenant(
  new Schema(
    {
      companyId: tenantRef,
      projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, immutable: true },
      name: { type: String, required: true, trim: true },
      code: { type: String, required: true, uppercase: true, trim: true },
      sequence: { type: Number, default: 1 },
      startDate: Date,
      targetDate: Date,
    },
    baseOptions,
  ),
);
phaseSchema.index({ companyId: 1, projectId: 1, code: 1 }, { unique: true });
export const ProjectPhase = model('ProjectPhase', phaseSchema);

const blockSchema = withTenant(
  new Schema(
    {
      companyId: tenantRef,
      projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, immutable: true },
      phaseId: { type: Schema.Types.ObjectId, ref: 'ProjectPhase' },
      name: { type: String, required: true, trim: true },
      code: { type: String, required: true, uppercase: true, trim: true },
    },
    baseOptions,
  ),
);
blockSchema.index({ companyId: 1, projectId: 1, code: 1 }, { unique: true });
export const Block = model('Block', blockSchema);

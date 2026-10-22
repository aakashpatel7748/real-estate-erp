import { model, Schema } from 'mongoose';
import { DOCUMENT_ENTITY_TYPES } from '@erp/shared';
import { baseOptions, tenantRef, withTenant } from '../../db/base';

/**
 * Document metadata (Phase 2 upload flow). Only the private object-storage key is stored;
 * downloads always go through an authorized endpoint that issues a short-lived signed URL.
 */
const documentSchema = withTenant(
  new Schema(
    {
      companyId: tenantRef,
      projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
      entityType: { type: String, enum: DOCUMENT_ENTITY_TYPES, required: true },
      entityId: { type: Schema.Types.ObjectId, required: true },
      category: { type: String, default: 'general' },
      fileName: { type: String, required: true },
      mimeType: { type: String, required: true },
      sizeBytes: { type: Number, required: true, min: 1 },
      storageKey: { type: String, required: true, select: false },
      checksumSha256: String,
      uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      deletedAt: Date,
    },
    baseOptions,
  ),
);
documentSchema.index({ companyId: 1, entityType: 1, entityId: 1, createdAt: -1 });
export const DocumentFile = model('Document', documentSchema);

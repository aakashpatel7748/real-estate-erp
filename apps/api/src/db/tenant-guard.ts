import type { Schema, PipelineStage } from 'mongoose';

/**
 * Defence-in-depth for tenant isolation: every query on a tenant-owned model must
 * filter by `companyId`. Services already scope queries through `TenantContext`; this
 * plugin turns an accidental unscoped query into a loud error instead of a data leak.
 *
 * System jobs that legitimately scan across tenants pass `{ crossTenant: true }` in the
 * query options (or aggregate options).
 */
const QUERY_OPS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'countDocuments',
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
  'distinct',
] as const;

export class TenantScopeError extends Error {
  constructor(model: string, op: string) {
    super(`Unscoped ${op} on tenant model ${model}: queries must filter by companyId`);
    this.name = 'TenantScopeError';
  }
}

export function tenantGuard(schema: Schema): void {
  for (const op of QUERY_OPS) {
    schema.pre(op as 'find', function () {
      const opts = this.getOptions() as { crossTenant?: boolean };
      if (opts.crossTenant) return;
      const filter = this.getFilter();
      if (!filter || filter.companyId === undefined || filter.companyId === null) {
        throw new TenantScopeError(this.model.modelName, op);
      }
    });
  }
  schema.pre('aggregate', function () {
    const opts = this.options as { crossTenant?: boolean };
    if (opts?.crossTenant) return;
    const first = this.pipeline()[0] as PipelineStage.Match | undefined;
    if (!first || !('$match' in first) || first.$match.companyId === undefined) {
      throw new TenantScopeError((this as unknown as { _model: { modelName: string } })._model.modelName, 'aggregate');
    }
  });
}

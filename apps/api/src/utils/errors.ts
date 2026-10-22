import type { ErrorCode } from '@erp/shared';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: { path: string; message: string }[]) =>
  new AppError(400, 'VALIDATION_ERROR', message, details);
export const unauthenticated = (message = 'Authentication required') => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have permission to perform this action') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (entity = 'Resource') => new AppError(404, 'NOT_FOUND', `${entity} not found`);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);
export const businessRule = (message: string) => new AppError(422, 'BUSINESS_RULE', message);

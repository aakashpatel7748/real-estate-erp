import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import type { ApiFailure } from '@erp/shared';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { ScheduleError } from '@erp/shared';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`));
}

/** Centralized error handler. Never exposes stack traces or database internals. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let body: ApiFailure['error'] = { code: 'INTERNAL', message: 'Something went wrong. Please try again.' };

  if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message, details: err.details };
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      code: 'VALIDATION_ERROR',
      message: 'Please correct the highlighted fields',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  } else if (err instanceof ScheduleError) {
    status = 422;
    body = { code: 'BUSINESS_RULE', message: err.message };
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    body = { code: 'VALIDATION_ERROR', message: `Invalid value for ${err.path}` };
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    body = {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    };
  } else if ((err as { code?: number })?.code === 11000) {
    status = 409;
    const fields = Object.keys((err as { keyPattern?: object }).keyPattern ?? {}).filter((k) => k !== 'companyId');
    body = { code: 'CONFLICT', message: fields.length ? `A record with this ${fields.join(' / ')} already exists` : 'Duplicate record' };
  } else if ((err as { type?: string })?.type === 'entity.too.large') {
    status = 413;
    body = { code: 'VALIDATION_ERROR', message: 'Request body is too large' };
  } else if ((err as { type?: string })?.type === 'entity.parse.failed') {
    status = 400;
    body = { code: 'VALIDATION_ERROR', message: 'Malformed JSON body' };
  }

  if (status >= 500) {
    logger.error({ err, requestId: req.id, path: req.path }, 'Unhandled error');
  }
  body.requestId = String(req.id);
  if (!env.isProd && status >= 500 && err instanceof Error) {
    body.message = `${body.message} (${err.message})`;
  }
  res.status(status).json({ success: false, error: body } satisfies ApiFailure);
}

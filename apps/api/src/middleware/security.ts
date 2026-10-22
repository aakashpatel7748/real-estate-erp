import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { safeEqual } from '../utils/crypto';

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get('x-request-id');
  req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}

const rateLimitHandler = () => {
  throw new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again shortly.');
};

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 10_000 : 1_000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/** Brute-force protection keyed by IP + email for credential endpoints. */
export const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.LOGIN_RATE_LIMIT_PER_15_MIN,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${String((req.body as { email?: string })?.email ?? '').toLowerCase()}`,
  skip: () => env.isTest && process.env.ENABLE_RATE_LIMIT_TESTS !== '1',
  handler: rateLimitHandler,
});

export const CSRF_COOKIE = 'erp_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Double-submit CSRF check for endpoints authenticated by cookie (refresh, logout).
 * Endpoints authenticated by the Authorization header are not CSRF-able.
 */
export function requireCsrf(req: Request, _res: Response, next: NextFunction) {
  const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const header = req.get(CSRF_HEADER);
  if (!cookie || !header || !safeEqual(cookie, header)) {
    throw new AppError(403, 'CSRF', 'Invalid or missing CSRF token');
  }
  next();
}

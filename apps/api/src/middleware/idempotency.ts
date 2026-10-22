import type { NextFunction, Request, Response } from 'express';
import { IdempotencyKey } from '../db/system.models';
import { AppError, badRequest } from '../utils/errors';
import { sha256, stableStringify } from '../utils/crypto';
import { getCtx } from '../utils/tenant';

const TTL_HOURS = 24;

/**
 * Idempotent POST handling for sensitive operations (bookings, payments, refunds).
 *
 * - Client sends `Idempotency-Key: <uuid>`.
 * - First request claims the key (unique index) and runs; the final response is stored.
 * - A retry with the same key and same body replays the stored response.
 * - Same key with a different body -> 422; a retry while the first is still running -> 409.
 * - Failed requests (4xx/5xx) release the key so the client can retry after fixing input.
 */
export function idempotent(req: Request, res: Response, next: NextFunction) {
  const key = req.get('idempotency-key');
  if (!key || !/^[\w-]{8,100}$/.test(key)) {
    throw badRequest('An Idempotency-Key header (8-100 characters) is required for this request');
  }
  const ctx = getCtx(req);
  const route = `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`;
  const requestHash = sha256(stableStringify({ route, params: req.params, body: req.body }));
  const filter = { companyId: ctx.companyId, userId: ctx.userId, key };

  const run = async () => {
    try {
      await IdempotencyKey.create({
        ...filter,
        route,
        requestHash,
        state: 'in_progress',
        expiresAt: new Date(Date.now() + TTL_HOURS * 3600_000),
      });
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      const existing = await IdempotencyKey.findOne(filter).lean();
      if (!existing) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Request is being processed, retry shortly');
      if (existing.requestHash !== requestHash) {
        throw new AppError(422, 'IDEMPOTENCY_CONFLICT', 'This Idempotency-Key was already used with a different request');
      }
      if (existing.state === 'in_progress') {
        throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'An identical request is still being processed');
      }
      res.setHeader('idempotent-replayed', 'true');
      res.status(existing.responseStatus ?? 200).json(existing.responseBody);
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = (payload: unknown) => {
      const status = res.statusCode;
      const done =
        status < 400
          ? IdempotencyKey.updateOne(filter, { $set: { state: 'completed', responseStatus: status, responseBody: payload } })
          : IdempotencyKey.deleteOne(filter);
      done.then(
        () => originalJson(payload),
        () => originalJson(payload),
      );
      return res;
    };
    next();
  };

  return run();
}

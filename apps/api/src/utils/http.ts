import type { Response } from 'express';
import { Types } from 'mongoose';
import type { PageMeta } from '@erp/shared';

/**
 * Normalizes lean Mongoose results for the wire: `_id` -> `id`, drops `__v` and secrets.
 * Hydrated documents already go through the schema `toJSON` transform.
 */
export function serialize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Types.ObjectId) return String(value);
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function' && !(value.constructor === Object)) {
    return serialize((value as { toJSON: () => unknown }).toJSON());
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === '__v' || k === 'passwordHash' || k === 'tokenHash' || k === 'storageKey') continue;
    if (k === '_id') {
      if (!('id' in (value as object))) out.id = serialize(v);
      continue;
    }
    out[k] = serialize(v);
  }
  return out;
}

export function ok<T>(res: Response, data: T, meta?: PageMeta, status = 200): void {
  const body = serialize(data);
  res.status(status).json(meta ? { success: true, data: body, meta } : { success: true, data: body });
}

export function created<T>(res: Response, data: T): void {
  ok(res, data, undefined, 201);
}

export function pageMeta(page: number, pageSize: number, total: number): PageMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Convert a `sort` query ("-createdAt") into a Mongo sort object, restricted to an allow-list
 * so clients cannot sort on unindexed or sensitive fields.
 */
export function parseSort(sort: string | undefined, allowed: readonly string[], fallback: Record<string, 1 | -1>): Record<string, 1 | -1> {
  if (!sort) return fallback;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  if (!allowed.includes(field)) return fallback;
  return { [field]: desc ? -1 : 1, _id: desc ? -1 : 1 };
}

/** Escape user input before using it inside a RegExp (prevents ReDoS / regex injection). */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

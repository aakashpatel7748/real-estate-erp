import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

interface Schemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

/**
 * Mandatory server-side validation. Parsed (coerced, trimmed, defaulted) values are stored
 * on `req.validated`; controllers read only from there. Unknown keys are stripped by Zod
 * objects, which also blocks operator injection like `{ "$gt": "" }`.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.validated = {
      body: schemas.body ? schemas.body.parse(req.body ?? {}) : undefined,
      query: schemas.query ? schemas.query.parse(req.query) : undefined,
      params: schemas.params ? schemas.params.parse(req.params) : undefined,
    };
    next();
  };
}

export function body<T>(req: Request): T {
  return req.validated?.body as T;
}
export function query<T>(req: Request): T {
  return req.validated?.query as T;
}
export function params<T>(req: Request): T {
  return req.validated?.params as T;
}

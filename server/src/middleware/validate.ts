import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

/**
 * Validates req.body against a Zod schema and replaces req.body with parsed data.
 */
export function validateBody<P = Record<string, string | string[]>>(
  schema: ZodType
): RequestHandler<P> {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }
    req.body = parsed.data;
    next();
  };
}

/**
 * Validates req.body against a Zod schema and replaces req.body with parsed data.
 * @param {import('zod').ZodTypeAny} schema
 */
export function validateBody(schema) {
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

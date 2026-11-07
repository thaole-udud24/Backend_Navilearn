const ApiError = require('../utils/ApiError');

/** Validates req[part] (body/query/params) against a Zod schema, replacing it with the parsed value. */
const validate = (schema, part = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[part]);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(ApiError.badRequest('Validation failed', 'VALIDATION_ERROR', errors));
  }
  req[part] = result.data;
  return next();
};

module.exports = validate;

class ApiError extends Error {
  constructor(status, message, code = 'ERROR', errors = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }

  static badRequest(message, code = 'BAD_REQUEST', errors = []) {
    return new ApiError(400, message, code, errors);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message, 'FORBIDDEN');
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, message, 'NOT_FOUND');
  }

  static conflict(message, code = 'CONFLICT') {
    return new ApiError(409, message, code);
  }
}

module.exports = ApiError;

const MAX_LIMIT = 100;

/** Normalizes page/limit query params; caps limit to MAX_LIMIT. */
function parsePagination(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function buildMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) || 1 };
}

module.exports = { parsePagination, buildMeta, MAX_LIMIT };

function notFound(req, res) {
  res.status(404).json({ success: false, message: 'Route not found', code: 'ROUTE_NOT_FOUND', errors: [] });
}

module.exports = notFound;

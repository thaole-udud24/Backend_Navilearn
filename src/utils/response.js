function ok(res, data, message = 'OK', meta) {
  return res.status(200).json({ success: true, data, message, ...(meta ? { meta } : {}) });
}

function created(res, data, message = 'Created') {
  return res.status(201).json({ success: true, data, message });
}

function noContent(res) {
  return res.status(204).send();
}

module.exports = { ok, created, noContent };

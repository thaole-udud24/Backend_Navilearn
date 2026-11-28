const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');

const DOC_MIME = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

// N11 (admin-report attachment): same disk-storage/multer plumbing, just a different whitelist —
// kept as its own map so asset/student-document's PDF/DOCX-only uploaders never start accepting images.
const IMAGE_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

const MAX_FILE_SIZE = 20 * 1024 * 1024;

// multer reports its own errors (e.g. too large) as plain Errors; turn them into 400s.
const mapUploadError = (err) => {
  if (err instanceof ApiError) return err;
  if (err.code === 'LIMIT_FILE_SIZE') return ApiError.badRequest('Tệp tối đa 20 MB', 'FILE_TOO_LARGE');
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return ApiError.badRequest('Số lượng hoặc tên trường tệp không hợp lệ', 'UPLOAD_ERROR');
  }
  return ApiError.badRequest(err.message, 'UPLOAD_ERROR');
};

// Shared upload plumbing for asset + student-document (+ admin-report attachments) — same disk
// storage layout and 20MB limit, differing only in storage subdir, file count, and (via mimeMap)
// which mime types are accepted. Defaults to the original PDF/DOCX-only whitelist.
function createDocumentUploader(subdir, mimeMap = DOC_MIME) {
  const dir = path.resolve(env.STORAGE_UPLOAD_DIR, subdir);

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${req.user.id}-${Math.random().toString(36).slice(2)}${mimeMap[file.mimetype]}`),
  });

  const fileFilter = (req, file, cb) =>
    mimeMap[file.mimetype]
      ? cb(null, true)
      : cb(ApiError.badRequest('Loại tệp không được hỗ trợ', 'INVALID_FILE_TYPE'));

  const build = (files) => multer({ storage, limits: { fileSize: MAX_FILE_SIZE, files }, fileFilter });

  return {
    single: (fieldName) => {
      const upload = build(1);
      return (req, res, next) => upload.single(fieldName)(req, res, (err) => (err ? next(mapUploadError(err)) : next()));
    },
    array: (fieldName, maxCount) => {
      const upload = build(maxCount);
      return (req, res, next) =>
        upload.array(fieldName, maxCount)(req, res, (err) => (err ? next(mapUploadError(err)) : next()));
    },
  };
}

module.exports = { createDocumentUploader, IMAGE_MIME };

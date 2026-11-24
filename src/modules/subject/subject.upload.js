const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const { ALLOWED_FILE_TYPES, MAX_FILE_SIZE, MAX_IMPORT_FILES } = require('./subject.constants');

// Private folder: app.js only serves /uploads/avatars statically, so documents are reachable only through
// the authenticated download endpoints.
const DOCUMENT_DIR = path.resolve(env.STORAGE_UPLOAD_DIR, 'documents');

const hasAllowedExtension = (file) =>
  path.extname(file.originalname).toLowerCase() === ALLOWED_FILE_TYPES[file.mimetype];

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(DOCUMENT_DIR, { recursive: true });
      cb(null, DOCUMENT_DIR);
    },
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${ALLOWED_FILE_TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_IMPORT_FILES },
  fileFilter: (req, file, cb) =>
    ALLOWED_FILE_TYPES[file.mimetype] && hasAllowedExtension(file)
      ? cb(null, true)
      : cb(ApiError.badRequest('Chỉ nhận tệp PDF hoặc DOCX', 'INVALID_FILE_TYPE')),
});

function removeStoredFile(storedName) {
  if (!storedName) return Promise.resolve();
  return fs.promises.unlink(path.join(DOCUMENT_DIR, path.basename(storedName))).catch(() => {});
}

function storedPath(storedName) {
  return path.join(DOCUMENT_DIR, path.basename(storedName));
}

// The client-supplied mimetype is not trustworthy: check the file's real signature (PDF "%PDF", DOCX is a zip "PK").
function hasValidSignature(file) {
  const head = Buffer.alloc(4);
  const fd = fs.openSync(file.path, 'r');
  try {
    fs.readSync(fd, head, 0, 4, 0);
  } finally {
    fs.closeSync(fd);
  }
  return file.mimetype === 'application/pdf' ? head.toString('latin1') === '%PDF' : head.toString('latin1').startsWith('PK');
}

const uploadedFiles = (req) => (req.file ? [req.file] : req.files || []);

function mapMulterError(err) {
  if (err instanceof ApiError) return err;
  if (err.code === 'LIMIT_FILE_SIZE') return ApiError.badRequest('Tệp tối đa 20 MB', 'FILE_TOO_LARGE');
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return ApiError.badRequest('Số lượng hoặc tên trường tệp không hợp lệ', 'UPLOAD_ERROR');
  }
  return ApiError.badRequest(err.message, 'UPLOAD_ERROR');
}

const wrap = (handler) => (req, res, next) =>
  handler(req, res, async (err) => {
    const files = uploadedFiles(req);
    if (err) {
      await Promise.all(files.map((f) => removeStoredFile(f.filename)));
      return next(mapMulterError(err));
    }
    try {
      files.forEach((file) => {
        // multer decodes multipart filenames as latin1, which garbles Vietnamese names.
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
        if (!hasValidSignature(file)) throw ApiError.badRequest('Nội dung tệp không đúng định dạng', 'INVALID_FILE_TYPE');
      });
    } catch (e) {
      await Promise.all(files.map((f) => removeStoredFile(f.filename)));
      return next(e);
    }
    return next();
  });

const uploadOne = wrap(upload.single('file'));
const uploadMany = wrap(upload.array('files', MAX_IMPORT_FILES));

module.exports = { uploadOne, uploadMany, removeStoredFile, storedPath, DOCUMENT_DIR };

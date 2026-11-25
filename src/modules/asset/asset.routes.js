const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const ApiError = require('../../utils/ApiError');
const { ROLES } = require('../../shared/roles');
const env = require('../../config/env');
const { createSchema, listQuerySchema, idParamsSchema } = require('./asset.validation');
const ctrl = require('./asset.controller');

const ASSET_DIR = path.resolve(env.STORAGE_UPLOAD_DIR, 'assets');
const DOC_MIME = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(ASSET_DIR, { recursive: true });
      cb(null, ASSET_DIR);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${req.user.id}${DOC_MIME[file.mimetype]}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    DOC_MIME[file.mimetype]
      ? cb(null, true)
      : cb(ApiError.badRequest('Chỉ nhận tệp PDF hoặc DOCX', 'INVALID_FILE_TYPE')),
});

// multer reports its own errors (e.g. too large) as plain Errors; turn them into 400s.
const uploadAsset = (req, res, next) =>
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof ApiError) return next(err);
    if (err.code === 'LIMIT_FILE_SIZE') return next(ApiError.badRequest('Tệp tối đa 20 MB', 'FILE_TOO_LARGE'));
    return next(ApiError.badRequest(err.message, 'UPLOAD_ERROR'));
  });

const router = express.Router();

router.use(authenticate);

// Tài liệu nguồn is admin-authored but shared read-only with students (UC: "Tài liệu học tập") —
// list/get only ever return status:'active' rows (see asset.service.list/getById), so a student
// can only ever see what an admin has published. Managing it (upload/remove) stays admin-only.
router.get('/', authorize(ROLES.ADMIN, ROLES.STUDENT), validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.get('/:id', authorize(ROLES.ADMIN, ROLES.STUDENT), validate(idParamsSchema, 'params'), ctrl.getCtrl);
router.post('/', authorize(ROLES.ADMIN), uploadAsset, validate(createSchema), ctrl.createCtrl);
router.delete('/:id', authorize(ROLES.ADMIN), validate(idParamsSchema, 'params'), ctrl.removeCtrl);

module.exports = router;

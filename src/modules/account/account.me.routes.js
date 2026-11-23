const fs = require('fs');
const express = require('express');
const multer = require('multer');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const ApiError = require('../../utils/ApiError');
const v = require('./account.me.validation');
const ctrl = require('./account.me.controller');
const { AVATAR_DIR } = require('./account.me.service');

const IMAGE_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(AVATAR_DIR, { recursive: true });
      cb(null, AVATAR_DIR);
    },
    filename: (req, file, cb) => cb(null, `${req.user.id}-${Date.now()}${IMAGE_EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    IMAGE_EXT[file.mimetype]
      ? cb(null, true)
      : cb(ApiError.badRequest('Ảnh đại diện chỉ nhận png, jpg, webp', 'INVALID_FILE_TYPE')),
});

// multer reports its own errors (e.g. too large) as plain Errors; turn them into 400s.
const uploadAvatar = (req, res, next) =>
  upload.single('avatar')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof ApiError) return next(err);
    if (err.code === 'LIMIT_FILE_SIZE') return next(ApiError.badRequest('Ảnh tối đa 2 MB', 'FILE_TOO_LARGE'));
    return next(ApiError.badRequest(err.message, 'UPLOAD_ERROR'));
  });

const router = express.Router();

router.use(authenticate);
router.get('/profile', ctrl.getProfileCtrl);
router.patch('/profile', validate(v.updateProfileSchema), ctrl.updateProfileCtrl);
router.post('/avatar', uploadAvatar, ctrl.avatarCtrl);
router.post('/change-password', validate(v.changePasswordSchema), ctrl.changePasswordCtrl);
router.get('/sessions', ctrl.listSessionsCtrl);
router.delete('/sessions', ctrl.revokeOtherSessionsCtrl);
router.delete('/sessions/:id', validate(v.sessionIdParamsSchema, 'params'), ctrl.revokeSessionCtrl);
router.delete('/', validate(v.deleteAccountSchema), ctrl.deleteAccountCtrl);

module.exports = router;

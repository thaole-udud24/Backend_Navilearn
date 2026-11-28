const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const { createDocumentUploader, IMAGE_MIME } = require('../../shared/documentUpload');
const {
  createSchema,
  updateStatusSchema,
  listQuerySchema,
  idParamsSchema,
  respondSchema,
} = require('./admin-report.validation');
const ctrl = require('./admin-report.controller');

// N11: optional screenshot attachment — only engages multer when the request is actually
// multipart/form-data, so plain-JSON callers (existing tests, no-attachment submits) are unaffected.
const uploadAttachment = createDocumentUploader('admin-report-attachments', IMAGE_MIME).single('attachment');

const router = express.Router();

router.use(authenticate);
router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.post('/', authorize(ROLES.STUDENT), uploadAttachment, validate(createSchema), ctrl.createCtrl);
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getCtrl);
router.patch(
  '/:id/status',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(updateStatusSchema),
  ctrl.updateStatusCtrl,
);
// B10: admin reply, shown back to the student on their own report.
router.patch(
  '/:id/respond',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(respondSchema),
  ctrl.respondCtrl,
);
router.delete('/:id', validate(idParamsSchema, 'params'), ctrl.removeCtrl);

module.exports = router;

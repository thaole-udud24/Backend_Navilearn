const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const {
  createSchema,
  updateSchema,
  listQuerySchema,
  idParamsSchema,
  applySchema,
  publishSchema,
  importSchema,
} = require('./plan-template.validation');
const ctrl = require('./plan-template.controller');

const router = express.Router();

router.use(authenticate);

router.get('/export', authorize(ROLES.ADMIN), ctrl.exportCtrl);
router.post('/import', authorize(ROLES.ADMIN), validate(importSchema), ctrl.importCtrl);

// Student reads only active templates; admin reads/manages the full catalog (scoped in the service).
router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getCtrl);
router.post('/', authorize(ROLES.ADMIN), validate(createSchema), ctrl.createCtrl);
router.patch(
  '/:id',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(updateSchema),
  ctrl.updateCtrl,
);
router.delete('/:id', authorize(ROLES.ADMIN), validate(idParamsSchema, 'params'), ctrl.removeCtrl);
router.patch(
  '/:id/publish',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(publishSchema),
  ctrl.publishCtrl,
);
router.patch(
  '/:id/archive',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  ctrl.archiveCtrl,
);

router.post(
  '/:id/apply',
  authorize(ROLES.STUDENT),
  validate(idParamsSchema, 'params'),
  validate(applySchema),
  ctrl.applyCtrl,
);

module.exports = router;

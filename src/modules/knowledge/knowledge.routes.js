const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const {
  createSchema,
  updateSchema,
  updateStatusSchema,
  listQuerySchema,
  idParamsSchema,
  importSchema,
  copyStructureSchema,
} = require('./knowledge.validation');
const ctrl = require('./knowledge.controller');

const router = express.Router();

router.use(authenticate);
router.get('/export', authorize(ROLES.ADMIN), ctrl.exportCtrl);
router.post('/import', authorize(ROLES.ADMIN), validate(importSchema), ctrl.importCtrl);
router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.post('/', authorize(ROLES.ADMIN), validate(createSchema), ctrl.createCtrl);
router.get('/subject/:id/graph', validate(idParamsSchema, 'params'), ctrl.subjectGraphCtrl);
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getCtrl);
router.patch(
  '/:id',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(updateSchema),
  ctrl.updateCtrl,
);
router.patch(
  '/:id/status',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(updateStatusSchema),
  ctrl.updateStatusCtrl,
);
// Sample structures (a top-level concept and everything below it): admin tools.
router.get('/:id/validate', authorize(ROLES.ADMIN), validate(idParamsSchema, 'params'), ctrl.validateStructureCtrl);
router.post(
  '/:id/copy',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(copyStructureSchema),
  ctrl.copyStructureCtrl,
);
router.post('/:id/deactivate-tree', authorize(ROLES.ADMIN), validate(idParamsSchema, 'params'), ctrl.deactivateStructureCtrl);
router.post('/:id/restore-tree', authorize(ROLES.ADMIN), validate(idParamsSchema, 'params'), ctrl.restoreStructureCtrl);
router.delete('/:id', authorize(ROLES.ADMIN), validate(idParamsSchema, 'params'), ctrl.removeCtrl);

module.exports = router;

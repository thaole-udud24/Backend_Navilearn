const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const {
  createSchema,
  updateSchema,
  updatePolicySchema,
  updateStatusSchema,
  listQuerySchema,
  idParamsSchema,
  createRubricSchema,
  updateRubricSchema,
  updateRubricStatusSchema,
  listRubricsQuerySchema,
} = require('./assessment-config.validation');
const ctrl = require('./assessment-config.controller');

const router = express.Router();

router.use(authenticate);

// Rubric sub-resource (UC-ACF-07..10) — literal path, must come before '/:id'.
router.get('/rubrics', validate(listRubricsQuerySchema, 'query'), ctrl.listRubricsCtrl);
router.post('/rubrics', authorize(ROLES.ADMIN), validate(createRubricSchema), ctrl.createRubricCtrl);
router.get('/rubrics/:id', validate(idParamsSchema, 'params'), ctrl.getRubricCtrl);
router.patch(
  '/rubrics/:id',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(updateRubricSchema),
  ctrl.updateRubricCtrl,
);
router.patch(
  '/rubrics/:id/status',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(updateRubricStatusSchema),
  ctrl.updateRubricStatusCtrl,
);

router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.post('/', authorize(ROLES.ADMIN), validate(createSchema), ctrl.createCtrl);
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getCtrl);
router.patch(
  '/:id',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(updateSchema),
  ctrl.updateCtrl,
);
router.patch(
  '/:id/policy',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(updatePolicySchema),
  ctrl.updatePolicyCtrl,
);
router.post('/:id/duplicate', authorize(ROLES.ADMIN), validate(idParamsSchema, 'params'), ctrl.duplicateCtrl);
router.patch(
  '/:id/status',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(updateStatusSchema),
  ctrl.updateStatusCtrl,
);
router.delete('/:id', authorize(ROLES.ADMIN), validate(idParamsSchema, 'params'), ctrl.removeCtrl);

module.exports = router;

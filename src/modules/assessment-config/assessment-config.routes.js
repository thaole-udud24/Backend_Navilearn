const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const { createSchema, updateStatusSchema, listQuerySchema, idParamsSchema } = require('./assessment-config.validation');
const ctrl = require('./assessment-config.controller');

const router = express.Router();

router.use(authenticate);
router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.post('/', authorize(ROLES.STUDENT), validate(createSchema), ctrl.createCtrl);
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getCtrl);
router.patch(
  '/:id/status',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(updateStatusSchema),
  ctrl.updateStatusCtrl,
);
router.delete('/:id', validate(idParamsSchema, 'params'), ctrl.removeCtrl);

module.exports = router;

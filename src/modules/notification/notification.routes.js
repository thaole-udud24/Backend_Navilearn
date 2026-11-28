const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const {
  createSchema,
  updateStatusSchema,
  listQuerySchema,
  idParamsSchema,
  broadcastSchema,
} = require('./notification.validation');
const ctrl = require('./notification.controller');

const router = express.Router();

router.use(authenticate);
router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.post('/', authorize(ROLES.STUDENT), validate(createSchema), ctrl.createCtrl);
// Literal paths before '/:id' so they aren't swallowed by the id param route.
router.patch('/read-all', authorize(ROLES.STUDENT), ctrl.markAllReadCtrl);
// B9: admin compose + sent history.
router.post('/broadcast', authorize(ROLES.ADMIN), validate(broadcastSchema), ctrl.broadcastCreateCtrl);
router.get('/broadcasts', authorize(ROLES.ADMIN), ctrl.listBroadcastsCtrl);
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getCtrl);
router.patch(
  '/:id/status',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(updateStatusSchema),
  ctrl.updateStatusCtrl,
);
router.patch(
  '/:id/read',
  authorize(ROLES.STUDENT),
  validate(idParamsSchema, 'params'),
  ctrl.markReadCtrl,
);
router.delete('/:id', validate(idParamsSchema, 'params'), ctrl.removeCtrl);

module.exports = router;

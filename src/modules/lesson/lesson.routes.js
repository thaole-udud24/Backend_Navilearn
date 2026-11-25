const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const { createSchema, updateSchema, listQuerySchema, idParamsSchema } = require('./lesson.validation');
const ctrl = require('./lesson.controller');

const router = express.Router();

router.use(authenticate);
// Thư viện bài học is shared admin content — only admins manage it (no student-facing use yet).
router.use(authorize(ROLES.ADMIN));

router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.post('/', validate(createSchema), ctrl.createCtrl);
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getCtrl);
router.patch('/:id', validate(idParamsSchema, 'params'), validate(updateSchema), ctrl.updateCtrl);
router.patch('/:id/publish', validate(idParamsSchema, 'params'), ctrl.publishCtrl);
router.patch('/:id/archive', validate(idParamsSchema, 'params'), ctrl.archiveCtrl);
router.delete('/:id', validate(idParamsSchema, 'params'), ctrl.removeCtrl);

module.exports = router;

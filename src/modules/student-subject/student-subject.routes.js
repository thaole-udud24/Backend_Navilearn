const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const { createSchema, updateSchema, listQuerySchema, idParamsSchema } = require('./student-subject.validation');
const ctrl = require('./student-subject.controller');

const router = express.Router();

// Personal learning data (BR-02/BR-35): student-only, admin has no access.
router.use(authenticate, authorize(ROLES.STUDENT));
router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.get('/all', ctrl.listAllCtrl);
router.post('/', validate(createSchema), ctrl.createCtrl);
// Fixed path must stay above '/:id'.
router.get('/trash', validate(listQuerySchema, 'query'), ctrl.trashCtrl);
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getCtrl);
router.patch('/:id', validate(idParamsSchema, 'params'), validate(updateSchema), ctrl.updateCtrl);
router.post('/:id/restore', validate(idParamsSchema, 'params'), ctrl.restoreCtrl);
router.delete('/:id', validate(idParamsSchema, 'params'), ctrl.removeCtrl);

module.exports = router;

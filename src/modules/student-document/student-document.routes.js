const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const { createDocumentUploader } = require('../../shared/documentUpload');
const { createSchema, updateSchema, listQuerySchema, idParamsSchema } = require('./student-document.validation');
const ctrl = require('./student-document.controller');

const uploadDocument = createDocumentUploader('student-documents').single('file');

const router = express.Router();

// Personal learning data (BR-02/BR-35): student-only, owner-scoped (see getOwned in service) —
// a student can never see or manage another student's documents, admin gets no access either.
router.use(authenticate, authorize(ROLES.STUDENT));

router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getCtrl);
router.post('/', uploadDocument, validate(createSchema), ctrl.createCtrl);
router.post('/:id/analyze', validate(idParamsSchema, 'params'), ctrl.analyzeCtrl);
router.patch('/:id', validate(idParamsSchema, 'params'), validate(updateSchema), ctrl.updateCtrl);
router.delete('/:id', validate(idParamsSchema, 'params'), ctrl.removeCtrl);

module.exports = router;

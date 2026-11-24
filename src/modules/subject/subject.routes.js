const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const v = require('./subject.validation');
const { uploadOne } = require('./subject.upload');
const ctrl = require('./subject.controller');

// Personal subjects and documents: STUDENT only. ADMIN never reads personal learning data (BR-02, BR-35).
const router = express.Router();

const idParams = validate(v.idParamsSchema, 'params');
const docParams = validate(v.documentParamsSchema, 'params');

router.use(authenticate, authorize(ROLES.STUDENT));

router.get('/', validate(v.listSubjectsQuerySchema, 'query'), ctrl.listCtrl);
router.post('/', validate(v.createSubjectSchema), ctrl.createCtrl);
// Fixed paths must stay above '/:id'.
router.post('/from-catalog', validate(v.fromCatalogSchema), ctrl.fromCatalogCtrl);
router.patch('/reorder', validate(v.reorderSchema), ctrl.reorderCtrl);
router.get('/:id', idParams, ctrl.getCtrl);
router.patch('/:id', idParams, validate(v.updateSubjectSchema), ctrl.updateCtrl);
router.patch('/:id/pin', idParams, validate(v.pinSchema), ctrl.pinCtrl);
router.post('/:id/archive', idParams, ctrl.archiveCtrl);
router.post('/:id/restore', idParams, ctrl.restoreCtrl);
router.delete('/:id', idParams, ctrl.removeCtrl);

router.get('/:id/documents', idParams, validate(v.listDocumentsQuerySchema, 'query'), ctrl.listDocumentsCtrl);
router.get('/:id/documents/uploads', idParams, validate(v.listDocumentsQuerySchema, 'query'), ctrl.listUploadsCtrl);
router.post('/:id/documents', idParams, uploadOne, validate(v.uploadDocumentSchema), ctrl.createDocumentCtrl);
router.get('/:id/documents/:docId', docParams, ctrl.getDocumentCtrl);
router.patch('/:id/documents/:docId', docParams, validate(v.updateDocumentSchema), ctrl.updateDocumentCtrl);
router.put('/:id/documents/:docId/file', docParams, uploadOne, ctrl.replaceDocumentFileCtrl);
router.get('/:id/documents/:docId/download', docParams, ctrl.downloadDocumentCtrl);
router.delete('/:id/documents/:docId', docParams, ctrl.removeDocumentCtrl);

module.exports = router;

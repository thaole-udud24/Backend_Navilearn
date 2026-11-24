const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const v = require('./subject.validation');
const { uploadOne, uploadMany } = require('./subject.upload');
const ctrl = require('./subject.catalog.controller');

// Shared catalog (/subject-catalog) and shared document library (/shared-documents):
// both roles read, only ADMIN writes.
const catalogRouter = express.Router();
const idParams = validate(v.idParamsSchema, 'params');
const admin = authorize(ROLES.ADMIN);

catalogRouter.use(authenticate);
catalogRouter.get('/', validate(v.listCatalogQuerySchema, 'query'), ctrl.listCtrl);
catalogRouter.get('/export', admin, ctrl.exportCtrl);
catalogRouter.post('/', admin, validate(v.createSubjectSchema), ctrl.createCtrl);
catalogRouter.get('/:id', idParams, ctrl.getCtrl);
catalogRouter.patch('/:id', admin, idParams, validate(v.updateSubjectSchema), ctrl.updateCtrl);
catalogRouter.post('/:id/deactivate', admin, idParams, ctrl.deactivateCtrl);
catalogRouter.post('/:id/restore', admin, idParams, ctrl.restoreCtrl);

const documentRouter = express.Router();

documentRouter.use(authenticate);
documentRouter.get('/', validate(v.listSharedDocumentsQuerySchema, 'query'), ctrl.listDocumentsCtrl);
documentRouter.post('/', admin, uploadOne, validate(v.uploadSharedDocumentSchema), ctrl.createDocumentCtrl);
documentRouter.post('/import', admin, uploadMany, validate(v.importSharedDocumentsSchema), ctrl.importDocumentsCtrl);
documentRouter.get('/:id', idParams, ctrl.getDocumentCtrl);
documentRouter.get('/:id/download', idParams, ctrl.downloadDocumentCtrl);
documentRouter.patch('/:id', admin, idParams, validate(v.updateDocumentSchema), ctrl.updateDocumentCtrl);
documentRouter.delete('/:id', admin, idParams, ctrl.removeDocumentCtrl);

module.exports = { catalogRouter, documentRouter };

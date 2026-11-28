const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const { createDocumentUploader } = require('../../shared/documentUpload');
const { createSchema, updateSchema, listQuerySchema, idParamsSchema, importSchema } = require('./asset.validation');
const ctrl = require('./asset.controller');

const assetUploader = createDocumentUploader('assets');
const uploadAsset = assetUploader.single('file');

const MAX_IMPORT_FILES = 20;
const uploadAssets = assetUploader.array('files', MAX_IMPORT_FILES);

const router = express.Router();

router.use(authenticate);

// Tài liệu nguồn is admin-authored but shared read-only with students (UC: "Tài liệu học tập") —
// list/get only ever return status:'active' rows (see asset.service.list/getById), so a student
// can only ever see what an admin has published. Managing it (upload/remove) stays admin-only.
router.get('/', authorize(ROLES.ADMIN, ROLES.STUDENT), validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.get('/:id', authorize(ROLES.ADMIN, ROLES.STUDENT), validate(idParamsSchema, 'params'), ctrl.getCtrl);
router.post('/', authorize(ROLES.ADMIN), uploadAsset, validate(createSchema), ctrl.createCtrl);
router.post('/import', authorize(ROLES.ADMIN), uploadAssets, validate(importSchema), ctrl.importCtrl);
router.patch('/:id', authorize(ROLES.ADMIN), validate(idParamsSchema, 'params'), validate(updateSchema), ctrl.updateCtrl);
router.delete('/:id', authorize(ROLES.ADMIN), validate(idParamsSchema, 'params'), ctrl.removeCtrl);

module.exports = router;

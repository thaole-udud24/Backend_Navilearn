const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const v = require('./knowledge.validation');
const ctrl = require('./knowledge.personal.controller');

// A student's own knowledge structure, notes and AI proposals. STUDENT only: ADMIN never reads personal
// learning data (BR-02, BR-35).
const router = express.Router();

const subjectParams = validate(v.subjectParamsSchema, 'params');
const idParams = validate(v.nodeParamsSchema, 'params');

router.use(authenticate, authorize(ROLES.STUDENT));

// structure
router.get('/subjects/:subjectId/tree', subjectParams, validate(v.treeQuerySchema, 'query'), ctrl.treeCtrl);
router.get('/subjects/:subjectId/search', subjectParams, validate(v.searchQuerySchema, 'query'), ctrl.searchCtrl);
router.post('/subjects/:subjectId/nodes', subjectParams, validate(v.createNodeSchema), ctrl.createNodeCtrl);
router.post('/subjects/:subjectId/apply-template', subjectParams, validate(v.applyTemplateSchema), ctrl.applyTemplateCtrl);
router.patch('/nodes/:id', idParams, validate(v.updateNodeSchema), ctrl.updateNodeCtrl);
router.post('/nodes/:id/archive', idParams, ctrl.archiveNodeCtrl);
router.post('/nodes/:id/restore', idParams, ctrl.restoreNodeCtrl);

// notes
router.get('/notes', validate(v.noteListQuerySchema, 'query'), ctrl.listNotesCtrl);
router.post('/notes', validate(v.createNoteSchema), ctrl.createNoteCtrl);
router.patch('/notes/:id', idParams, validate(v.updateNoteSchema), ctrl.updateNoteCtrl);
router.delete('/notes/:id', idParams, ctrl.deleteNoteCtrl);

// AI proposals
router.get('/subjects/:subjectId/proposals', subjectParams, validate(v.proposalListQuerySchema, 'query'), ctrl.listProposalsCtrl);
router.post('/subjects/:subjectId/proposals/generate', subjectParams, validate(v.generateProposalSchema), ctrl.generateProposalCtrl);
router.post('/proposals/:id/confirm', idParams, ctrl.confirmProposalCtrl);
router.post('/proposals/:id/reject', idParams, ctrl.rejectProposalCtrl);

module.exports = router;

const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const { dueQuerySchema, statsQuerySchema, cardIdParamsSchema, reviewSchema } = require('./card-state.validation');
const ctrl = require('./card-state.controller');

const router = express.Router();

// Personal spaced-repetition progress — student-only, no admin read (same as wrong-item/mastery).
router.use(authenticate, authorize(ROLES.STUDENT));

// Literal paths before '/:cardId' so they aren't swallowed by the cardId param route.
router.get('/due', validate(dueQuerySchema, 'query'), ctrl.listDueCtrl);
router.get('/stats', validate(statsQuerySchema, 'query'), ctrl.statsCtrl);
router.post(
  '/:cardId/review',
  validate(cardIdParamsSchema, 'params'),
  validate(reviewSchema),
  ctrl.reviewCtrl,
);

module.exports = router;

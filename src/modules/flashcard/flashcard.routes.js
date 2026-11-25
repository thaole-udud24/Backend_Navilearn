const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const {
  createDeckSchema,
  updateDeckSchema,
  updateDeckStatusSchema,
  listDecksQuerySchema,
  createCardSchema,
  updateCardSchema,
  updateCardStatusSchema,
  listCardsQuerySchema,
  idParamsSchema,
  deckIdParamsSchema,
  cardParamsSchema,
} = require('./flashcard.validation');
const ctrl = require('./flashcard.controller');

const router = express.Router();

router.use(authenticate);
// Thẻ ghi nhớ is shared admin content — only admins manage it (no student-facing use yet).
router.use(authorize(ROLES.ADMIN));

router.get('/', validate(listDecksQuerySchema, 'query'), ctrl.listDecksCtrl);
router.post('/', validate(createDeckSchema), ctrl.createDeckCtrl);
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getDeckCtrl);
router.patch('/:id', validate(idParamsSchema, 'params'), validate(updateDeckSchema), ctrl.updateDeckCtrl);
router.patch(
  '/:id/status',
  validate(idParamsSchema, 'params'),
  validate(updateDeckStatusSchema),
  ctrl.updateDeckStatusCtrl,
);
router.delete('/:id', validate(idParamsSchema, 'params'), ctrl.removeDeckCtrl);

router.get('/:deckId/cards', validate(deckIdParamsSchema, 'params'), validate(listCardsQuerySchema, 'query'), ctrl.listCardsCtrl);
router.post('/:deckId/cards', validate(deckIdParamsSchema, 'params'), validate(createCardSchema), ctrl.createCardCtrl);
router.patch(
  '/:deckId/cards/:id',
  validate(cardParamsSchema, 'params'),
  validate(updateCardSchema),
  ctrl.updateCardCtrl,
);
router.patch(
  '/:deckId/cards/:id/status',
  validate(cardParamsSchema, 'params'),
  validate(updateCardStatusSchema),
  ctrl.updateCardStatusCtrl,
);
router.delete('/:deckId/cards/:id', validate(cardParamsSchema, 'params'), ctrl.removeCardCtrl);

module.exports = router;

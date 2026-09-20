const express = require('express');
const router = express.Router();
const { protect, checkPermission } = require('../middleware/auth');
const {
  createOfferLetter,
  getOfferLetters,
  getOfferLetterById,
  updateOfferLetter,
  deleteOfferLetter,
  releaseOfferLetter,
  sendOfferLetterEmailAction,
  revokeOfferLetter,
  getPublicOfferLetter,
  acceptPublicOfferLetter,
  rejectPublicOfferLetter,
} = require('../controllers/offerLetterController');

// ── Public Candidate Routes (No Auth Needed) ──────────────────────────────
router.get('/public/:token', getPublicOfferLetter);
router.post('/public/:token/accept', acceptPublicOfferLetter);
router.post('/public/:token/reject', rejectPublicOfferLetter);

// ── Protected Admin Routes (JWT Auth + Permissions) ──────────────────────
router.use(protect);

router.post('/', checkPermission('offerLetters', 'create'), createOfferLetter);
router.get('/', checkPermission('offerLetters', 'view'), getOfferLetters);
router.get('/:id', checkPermission('offerLetters', 'view'), getOfferLetterById);
router.put('/:id', checkPermission('offerLetters', 'edit'), updateOfferLetter);
router.delete('/:id', checkPermission('offerLetters', 'delete'), deleteOfferLetter);

router.post('/:id/release', releaseOfferLetter);
router.post('/:id/send-email', sendOfferLetterEmailAction);
router.post('/:id/revoke', revokeOfferLetter);

module.exports = router;

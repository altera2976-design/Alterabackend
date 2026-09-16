const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const quotationController = require('../controllers/quotationController');

// ── PUBLIC CLIENT ACCESS (NO JWT REQUIRED) ──────────────────────────────────
// Allows prospective clients to securely review and approve their quotation
router.get('/public/:token', quotationController.getPublicQuotation);
router.post('/public/:token/approve', quotationController.clientApproveQuotation);
router.post('/public/:token/reject', quotationController.clientRejectQuotation);

// ── PROTECTED AUTHENTICATED ROUTES ──────────────────────────────────────────
router.use(protect);

// Global settings & templates
router.get('/config', quotationController.getConfig);
router.put('/config', authorize('ADMIN'), quotationController.updateConfig);

// Quotation summary KPIs
router.get('/summary', quotationController.getQuotationSummary);

// Quotation CRUD
router.get('/', quotationController.getQuotations);
router.post('/', quotationController.createQuotation);
router.get('/:id', quotationController.getQuotationById);
router.put('/:id', quotationController.updateQuotation);
router.delete('/:id', quotationController.deleteQuotation);

// Quotation specific actions
router.post('/:id/send', quotationController.sendQuotation);
router.post('/:id/convert-to-project', quotationController.convertToProject);

module.exports = router;

const express = require('express');
const router = express.Router();
const { protect, checkPermission } = require('../middleware/auth');
const quotationController = require('../controllers/quotationController');

// ── PUBLIC CLIENT ACCESS (NO JWT REQUIRED) ──────────────────────────────────
// Allows prospective clients to securely review and approve their quotation
router.get('/public/:token', quotationController.getPublicQuotation);
router.post('/public/:token/approve', quotationController.clientApproveQuotation);
router.post('/public/:token/reject', quotationController.clientRejectQuotation);

// ── PROTECTED AUTHENTICATED ROUTES ──────────────────────────────────────────
router.use(protect);

// Global settings & templates
router.get('/config', checkPermission('quotation', 'view'), quotationController.getConfig);
router.put('/config', checkPermission('quotation', 'edit'), quotationController.updateConfig);

// Quotation summary KPIs
router.get('/summary', checkPermission('quotation', 'view'), quotationController.getQuotationSummary);

// Quotation CRUD
router.get('/', checkPermission('quotation', 'view'), quotationController.getQuotations);
router.post('/', checkPermission('quotation', 'create'), quotationController.createQuotation);
router.get('/:id', checkPermission('quotation', 'view'), quotationController.getQuotationById);
router.put('/:id', checkPermission('quotation', 'edit'), quotationController.updateQuotation);
router.delete('/:id', checkPermission('quotation', 'delete'), quotationController.deleteQuotation);

// Quotation specific actions & transactions
router.get('/:id/transactions', checkPermission('quotation', 'view'), quotationController.getQuotationTransactions);
router.post('/:id/transactions', checkPermission('quotation', 'edit'), quotationController.addQuotationTransaction);
router.post('/:id/send', checkPermission('quotation', 'edit'), quotationController.sendQuotation);
router.post('/:id/convert-to-project', checkPermission('quotation', 'edit'), quotationController.convertToProject);

module.exports = router;

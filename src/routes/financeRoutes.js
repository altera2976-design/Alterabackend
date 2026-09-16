const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// Invoices
router.get('/invoices', financeController.getInvoices);
router.post('/invoices', financeController.createInvoice);
router.get('/invoices/:id', financeController.getInvoiceById);
router.put('/invoices/:id', financeController.updateInvoice);
router.post('/invoices/:id/payments', financeController.recordPayment);

// Expenses
router.get('/expenses', financeController.getExpenses);
router.post('/expenses', financeController.createExpense);
router.patch('/expenses/:id/approve', financeController.approveExpense);
router.delete('/expenses/:id', financeController.deleteExpense);

// Vendor Payments
router.get('/vendor-payments', financeController.getVendorPayments);
router.post('/vendor-payments', financeController.createVendorPayment);
router.patch('/vendor-payments/:id/pay', financeController.markVendorPaymentPaid);

// Revenue & Outstanding
router.get('/revenue-summary', financeController.getRevenueSummary);
router.get('/outstanding-payments', financeController.getOutstandingPayments);

// Profit & Loss
router.get('/profit-loss', financeController.getProfitLoss);

module.exports = router;

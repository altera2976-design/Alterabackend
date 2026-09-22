const express = require('express');
const router = express.Router();
const { protect, checkPermission } = require('../middleware/auth');
const transactionController = require('../controllers/transactionController');

// Require authentication for all transaction routes
router.use(protect);

// Summary & Export endpoints
router.get('/summary', checkPermission('transactions', 'viewSummary'), transactionController.getTransactionSummary);
router.get('/export', checkPermission('transactions', 'export'), transactionController.exportTransactions);

// Specific transaction timeline
router.get('/:id/timeline', checkPermission('transactions', 'viewDetails'), transactionController.getTransactionTimeline);

// Refund transaction
router.post('/:id/refund', checkPermission('transactions', 'refund'), transactionController.refundTransaction);

// CRUD routes
router.get('/', checkPermission('transactions', 'view'), transactionController.getTransactions);
router.get('/:id', checkPermission('transactions', 'viewDetails'), transactionController.getTransactionById);
router.post('/', checkPermission('transactions', 'create'), transactionController.createTransaction);
router.patch('/:id', checkPermission('transactions', 'edit'), transactionController.updateTransaction);
router.delete('/:id', checkPermission('transactions', 'delete'), transactionController.deleteTransaction);

module.exports = router;

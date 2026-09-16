const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const auditController = require('../controllers/auditController');

router.use(protect);
router.get('/', authorize('ADMIN'), auditController.getAuditLogs);

module.exports = router;

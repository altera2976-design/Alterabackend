const express = require('express');
const router = express.Router();
const { protect, checkPermission } = require('../middleware/auth');
const reportController = require('../controllers/reportController');

router.get('/details', protect, checkPermission('reports', 'view'), reportController.getDetailedReport);
router.get('/', protect, checkPermission('reports', 'view'), reportController.getReportData);
router.post('/send-email', protect, checkPermission('reports', 'export'), reportController.sendReportByEmail);

module.exports = router;

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const reportController = require('../controllers/reportController');

router.get('/details', protect, reportController.getDetailedReport);
router.get('/', protect, reportController.getReportData);
router.post('/send-email', protect, reportController.sendReportByEmail);

module.exports = router;

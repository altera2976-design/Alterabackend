const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const dashboardController = require('../controllers/dashboardController');

router.get('/stats', protect, dashboardController.getDashboardStats);
router.get('/mobile', protect, dashboardController.getDashboardStats);
router.get('/', protect, dashboardController.getDashboardStats);

module.exports = router;

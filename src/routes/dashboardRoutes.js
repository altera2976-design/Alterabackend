const express = require('express');
const router = express.Router();
const { protect, checkPermission } = require('../middleware/auth');
const dashboardController = require('../controllers/dashboardController');

router.get('/stats', protect, checkPermission('dashboard', 'view'), dashboardController.getDashboardStats);
router.get('/mobile', protect, checkPermission('dashboard', 'view'), dashboardController.getDashboardStats);
router.get('/', protect, checkPermission('dashboard', 'view'), dashboardController.getDashboardStats);

module.exports = router;

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const appConfigController = require('../controllers/appConfigController');

// Optional auth helper for GET /api/app-config so public/unauthenticated requests can fetch basic layout,
// while authenticated requests get role-filtered configs.
const optionalProtect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (user) {
        req.user = user;
      }
    } catch {
      // ignore invalid token in optional auth
    }
  }
  next();
};

// Public/role-filtered configuration
router.get('/', optionalProtect, appConfigController.getAppConfig);

// Master config (Admin & Super Admin only)
router.get('/master', protect, authorize('ADMIN', 'SUPER_ADMIN'), appConfigController.getMasterAppConfig);

// Configuration mutations (Admin & Super Admin only)
router.put('/modules', protect, authorize('ADMIN', 'SUPER_ADMIN'), appConfigController.updateModules);
router.put('/forms', protect, authorize('ADMIN', 'SUPER_ADMIN'), appConfigController.updateFormSchema);
router.put('/tables', protect, authorize('ADMIN', 'SUPER_ADMIN'), appConfigController.updateTableSchema);
router.put('/settings', protect, authorize('ADMIN', 'SUPER_ADMIN'), appConfigController.updateSystemSettings);

// Realtime sync broadcast trigger
router.post('/sync-trigger', protect, authorize('ADMIN', 'SUPER_ADMIN'), appConfigController.triggerSync);

module.exports = router;

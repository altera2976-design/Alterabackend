const express = require('express');
const router = express.Router();
const { protect, checkPermission } = require('../middleware/auth');
const settingController = require('../controllers/settingController');

router.get('/:key', protect, checkPermission('administration', 'view'), settingController.getSetting);
router.put('/:key', protect, checkPermission('administration', 'edit'), settingController.updateSetting);

module.exports = router;

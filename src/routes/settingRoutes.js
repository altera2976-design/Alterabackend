const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const settingController = require('../controllers/settingController');

router.get('/:key', protect, settingController.getSetting);
router.put('/:key', protect, authorize('ADMIN'), settingController.updateSetting);

module.exports = router;

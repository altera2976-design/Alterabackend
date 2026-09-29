const express = require('express');
const router = express.Router();
const {
  getActiveFestival,
  getAllFestivals,
  createFestival,
  updateFestival,
  deleteFestival
} = require('../controllers/festivalController');
const { protect, authorize } = require('../middleware/auth');

// Public route for active festival (used by all apps)
router.get('/active', getActiveFestival);

// Admin routes for managing festivals
router.route('/')
  .get(protect, authorize('ADMIN'), getAllFestivals)
  .post(protect, authorize('ADMIN'), createFestival);

router.route('/:id')
  .put(protect, authorize('ADMIN'), updateFestival)
  .delete(protect, authorize('ADMIN'), deleteFestival);

module.exports = router;

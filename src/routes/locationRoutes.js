const express = require('express');
const router = express.Router();
const {
  createLocation,
  getLocations,
  updateLocation,
  deleteLocation,
  generateQrToken,
} = require('../controllers/locationController');

const { protect, authorize } = require('../middleware/auth');

// All location routes should be protected and only accessible by ADMIN
router.use(protect);
router.use(authorize('ADMIN'));

router.route('/')
  .post(createLocation)
  .get(getLocations);

router.route('/:id')
  .put(updateLocation)
  .delete(deleteLocation);

router.get('/:locationId/qr', generateQrToken);

module.exports = router;

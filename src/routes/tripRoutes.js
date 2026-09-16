const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const tripController = require('../controllers/tripController');

router.get('/', protect, tripController.getTrips);
router.post('/start', protect, tripController.startTrip);
router.put('/:id/sync', protect, tripController.syncTrip);
router.post('/:id/stop', protect, tripController.stopTrip);

module.exports = router;

const Trip = require('../models/Trip');
const Setting = require('../models/Setting');

// Haversine formula to calculate distance in km
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

// Start a new trip
exports.startTrip = async (req, res, next) => {
  try {
    const { startLocation } = req.body;

    // Check if there's already an ongoing trip for this user
    let existingTrip = await Trip.findOne({ employee: req.user._id, status: 'ONGOING' });
    if (existingTrip) {
      return res.status(400).json({ success: false, message: 'An ongoing trip already exists', data: existingTrip });
    }

    // Get current rate
    let rateSetting = await Setting.findOne({ key: 'BIKE_RATE_PER_KM' });
    const ratePerKm = rateSetting ? rateSetting.value : 5.0; // Default 5

    const trip = await Trip.create({
      employee: req.user._id,
      startLocation,
      route: startLocation ? [startLocation] : [],
      ratePerKm,
    });

    res.status(201).json({ success: true, data: trip });
  } catch (error) {
    next(error);
  }
};

// Sync trip (add coordinates)
exports.syncTrip = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { coordinates } = req.body; // Array of coordinates

    if (!coordinates || !coordinates.length) {
      return res.status(400).json({ success: false, message: 'No coordinates provided' });
    }

    const trip = await Trip.findById(id);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
    if (trip.employee.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: 'Not authorized' });
    if (trip.status === 'COMPLETED') return res.status(400).json({ success: false, message: 'Trip already completed' });

    // Calculate incremental distance
    let newKm = 0;
    let lastPoint = trip.route.length > 0 ? trip.route[trip.route.length - 1] : null;

    coordinates.forEach(point => {
      if (lastPoint) {
        newKm += calculateDistance(lastPoint.latitude, lastPoint.longitude, point.latitude, point.longitude);
      }
      trip.route.push(point);
      lastPoint = point;
    });

    trip.totalKm += newKm;
    trip.totalExpense = trip.totalKm * trip.ratePerKm;

    await trip.save();

    res.status(200).json({ success: true, data: trip });
  } catch (error) {
    next(error);
  }
};

// Stop trip
exports.stopTrip = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { endLocation, clientDistance } = req.body; // Frontend can provide its calculated distance for fallback

    const trip = await Trip.findById(id);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
    if (trip.employee.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: 'Not authorized' });
    
    if (endLocation) {
       // add final point
       let lastPoint = trip.route.length > 0 ? trip.route[trip.route.length - 1] : null;
       if (lastPoint) {
         trip.totalKm += calculateDistance(lastPoint.latitude, lastPoint.longitude, endLocation.latitude, endLocation.longitude);
       }
       trip.route.push(endLocation);
       trip.endLocation = endLocation;
    }

    trip.status = 'COMPLETED';
    trip.endTime = Date.now();
    trip.totalExpense = trip.totalKm * trip.ratePerKm;

    await trip.save();

    res.status(200).json({ success: true, data: trip });
  } catch (error) {
    next(error);
  }
};

// Get Trips
exports.getTrips = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'EMPLOYEE') {
      filter.employee = req.user._id;
    }
    const trips = await Trip.find(filter).populate('employee', 'name email').sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: trips });
  } catch (error) {
    next(error);
  }
};

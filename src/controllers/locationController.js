const Location = require('../models/Location');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid'); // Might need this for jti, but we can just use crypto or simple math

exports.createLocation = async (req, res, next) => {
  try {
    const { name, address, latitude, longitude, radius } = req.body;
    
    const location = await Location.create({
      name,
      address,
      latitude,
      longitude,
      radius,
      createdBy: req.user._id,
    });

    res.status(201).json({ success: true, location });
  } catch (error) {
    next(error);
  }
};

exports.getLocations = async (req, res, next) => {
  try {
    const locations = await Location.find().sort('-createdAt');
    res.status(200).json({ success: true, locations });
  } catch (error) {
    next(error);
  }
};

exports.updateLocation = async (req, res, next) => {
  try {
    const { name, address, latitude, longitude, radius } = req.body;
    const location = await Location.findByIdAndUpdate(
      req.params.id,
      { name, address, latitude, longitude, radius },
      { new: true, runValidators: true }
    );

    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }

    res.status(200).json({ success: true, location });
  } catch (error) {
    next(error);
  }
};

exports.deleteLocation = async (req, res, next) => {
  try {
    const location = await Location.findByIdAndDelete(req.params.id);
    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }
    res.status(200).json({ success: true, message: 'Location deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Generates a short-lived (30s) JWT for a specific location.
 * The QR code on the frontend will encode this token.
 */
exports.generateQrToken = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    
    const location = await Location.findById(locationId);
    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }

    // 30 seconds expiration for high security
    const token = jwt.sign(
      { 
        locationId: location._id.toString(),
        type: 'ATTENDANCE_QR'
      },
      process.env.JWT_SECRET,
      { expiresIn: '30s', jwtid: require('crypto').randomBytes(16).toString('hex') }
    );

    res.status(200).json({ success: true, token });
  } catch (error) {
    next(error);
  }
};

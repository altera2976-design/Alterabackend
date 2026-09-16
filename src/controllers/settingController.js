const Setting = require('../models/Setting');

// Get a setting by key
exports.getSetting = async (req, res, next) => {
  try {
    const { key } = req.params;
    let setting = await Setting.findOne({ key });
    
    // Default rate if not set
    if (!setting && key === 'BIKE_RATE_PER_KM') {
      setting = await Setting.create({ key, value: 5.0, description: 'Rate per KM for bike travel expenses' });
    }

    res.status(200).json({ success: true, data: setting });
  } catch (error) {
    next(error);
  }
};

// Update a setting
exports.updateSetting = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    let setting = await Setting.findOneAndUpdate(
      { key },
      { value },
      { new: true, upsert: true }
    );

    res.status(200).json({ success: true, data: setting });
  } catch (error) {
    next(error);
  }
};

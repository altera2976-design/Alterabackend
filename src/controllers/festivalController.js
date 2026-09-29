const Festival = require('../models/Festival');

// Get active festival
exports.getActiveFestival = async (req, res) => {
  try {
    const now = new Date();
    const activeFestival = await Festival.findOne({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).sort({ startDate: 1 });

    res.json({ success: true, data: activeFestival });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Get all festivals (Admin)
exports.getAllFestivals = async (req, res) => {
  try {
    const festivals = await Festival.find().sort({ startDate: -1 });
    res.json({ success: true, data: festivals });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Create a new festival (Admin)
exports.createFestival = async (req, res) => {
  try {
    const newFestival = new Festival(req.body);
    await newFestival.save();
    res.status(201).json({ success: true, data: newFestival });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Update festival (Admin)
exports.updateFestival = async (req, res) => {
  try {
    const updatedFestival = await Festival.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedFestival) {
      return res.status(404).json({ success: false, message: 'Festival not found' });
    }
    res.json({ success: true, data: updatedFestival });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Delete festival (Admin)
exports.deleteFestival = async (req, res) => {
  try {
    const deleted = await Festival.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Festival not found' });
    }
    res.json({ success: true, message: 'Festival deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

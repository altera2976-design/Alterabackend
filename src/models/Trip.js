const mongoose = require('mongoose');

const TripSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: {
      type: Date,
    },
    startLocation: {
      latitude: Number,
      longitude: Number,
      timestamp: Number
    },
    endLocation: {
      latitude: Number,
      longitude: Number,
      timestamp: Number
    },
    route: [
      {
        latitude: Number,
        longitude: Number,
        timestamp: Number
      }
    ],
    totalKm: {
      type: Number,
      default: 0,
    },
    ratePerKm: {
      type: Number,
      default: 0,
    },
    totalExpense: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['ONGOING', 'COMPLETED'],
      default: 'ONGOING',
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Trip', TripSchema);

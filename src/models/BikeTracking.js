const mongoose = require("mongoose");

const BikeTrackingSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Employee ID is required"],
    },
    employeeName: {
      type: String,
      required: [true, "Employee name is required"],
    },
    bikeNumber: {
      type: String,
      required: [true, "Bike number is required"],
    },
    startTime: {
      type: Date,
      required: [true, "Start time is required"],
    },
    stopTime: {
      type: Date,
    },
    startLocation: {
      type: Object,
      default: null,
    },
    stopLocation: {
      type: Object,
      default: null,
    },
    locationHistory: [
      {
        latitude: Number,
        longitude: Number,
        accuracy: Number,
        speed: Number,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    startingMeterReading: {
      type: Number,
      required: [true, "Starting meter reading is required"],
    },
    endingMeterReading: {
      type: Number,
    },
    distanceKm: {
      type: Number,
    },
    totalWorkingMinutes: {
      type: Number,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED"],
      default: "ACTIVE",
    },
    date: {
      type: String, // YYYY-MM-DD
      required: [true, "Date is required"],
    },
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

BikeTrackingSchema.index({ employeeId: 1, status: 1 });
BikeTrackingSchema.index({ status: 1, stopTime: -1 });
BikeTrackingSchema.index({ status: 1, startTime: -1 });
BikeTrackingSchema.index({ date: 1 });
BikeTrackingSchema.index({ createdAt: -1 });

module.exports = mongoose.model("BikeTracking", BikeTrackingSchema);



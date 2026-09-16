const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      // YYYY-MM-DD format for easy querying
      type: String,
      required: true,
    },
    checkInTime: {
      type: Date,
      required: function () {
        return this.status !== 'LEAVE' && this.status !== 'ABSENT';
      },
    },
    checkOutTime: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE'],
      default: 'PRESENT',
    },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
    },
    distance: {
      type: Number, // Distance from the location in meters
    },
    sessionToken: {
      type: String, // Store the JTI or QR token to prevent reuse or track it
    },
    // Keeping this for backwards compatibility with old records
    qrId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AttendanceQr',
    },
    userLocation: {
      latitude: Number,
      longitude: Number,
      address: String,
    },
    // ── Project Site Attendance Link ─────────────────────────────────────────
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
    projectName: {
      type: String,
      default: '',
    },
    // ── Selfie Attendance Fields ─────────────────────────────────────────────
    checkInSelfie: {
      type: String, // Relative storage path e.g. "uploads/attendance_selfies/..."
    },
    checkOutSelfie: {
      type: String,
    },
    checkInLocation: {
      latitude: Number,
      longitude: Number,
      address: String,
      distance: Number, // Distance from office in meters
    },
    checkOutLocation: {
      latitude: Number,
      longitude: Number,
      address: String,
      distance: Number,
    },
    verificationStatus: {
      type: String,
      enum: ['VERIFIED', 'REVIEW_REQUIRED', 'FAILED'],
      default: 'REVIEW_REQUIRED',
    },
    livenessStatus: {
      type: String,
      enum: ['VERIFIED', 'NOT_AVAILABLE', 'SUSPICIOUS'],
      default: 'NOT_AVAILABLE',
    },
    geofenceStatus: {
      type: String,
      enum: ['INSIDE', 'OUTSIDE', 'DISABLED'],
      default: 'INSIDE',
    },
    totalHours: {
      type: Number,
      default: 0,
    },
    leaveType: {
      type: String,
      enum: ['PAID', 'UNPAID', 'CASUAL', 'SICK', 'ANNUAL', 'MATERNITY', 'PATERNITY'],
      default: 'PAID',
    },
    leaveReason: {
      type: String,
      default: '',
    },
    reviewNotes: {
      type: String,
      default: '',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// A user can only have one attendance record per day
AttendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', AttendanceSchema);

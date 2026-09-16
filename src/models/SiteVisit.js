const mongoose = require('mongoose');

const SiteVisitSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    projectName: {
      type: String,
      default: '',
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    employeeName: {
      type: String,
      required: true,
    },
    visitDate: {
      type: Date,
      default: Date.now,
    },
    gpsLocation: {
      latitude: Number,
      longitude: Number,
      address: { type: String, default: '' },
    },
    sitePhotos: [
      {
        url: String,
        caption: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    notes: {
      type: String,
      default: '',
    },
    issuesFound: [
      {
        description: String,
        severity: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
        resolved: { type: Boolean, default: false },
      },
    ],
    clientPresent: {
      type: Boolean,
      default: false,
    },
    nextActionItem: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('SiteVisit', SiteVisitSchema);

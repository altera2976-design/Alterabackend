const mongoose = require('mongoose');

const FollowUpSchema = new mongoose.Schema(
  {
    targetType: {
      type: String,
      enum: ['Lead', 'Client'],
      default: 'Lead',
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'targetType',
    },
    targetName: {
      type: String,
      required: true,
      trim: true,
    },
    targetPhone: {
      type: String,
      default: '',
    },
    assignedEmployee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    assignedEmployeeName: {
      type: String,
      default: 'Admin',
    },
    followUpDate: {
      type: Date,
      required: true,
    },
    followUpTime: {
      type: String,
      default: '11:00 AM',
    },
    type: {
      type: String,
      enum: ['Phone Call', 'WhatsApp', 'Email', 'Office Meeting', 'Site Visit'],
      default: 'Phone Call',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Rescheduled', 'Cancelled'],
      default: 'Pending',
    },
    reminder: {
      type: Boolean,
      default: true,
    },
    completedAt: {
      type: Date,
    },
    completedNotes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('FollowUp', FollowUpSchema);

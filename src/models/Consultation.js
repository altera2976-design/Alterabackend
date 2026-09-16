const mongoose = require('mongoose');

const ConsultationSchema = new mongoose.Schema(
  {
    targetType: {
      type: String,
      enum: ['Lead', 'Client'],
      default: 'Lead',
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'targetType',
    },
    clientName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      default: '',
    },
    email: {
      type: String,
      default: '',
    },
    designer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    designerName: {
      type: String,
      default: 'Lead Interior Designer',
    },
    date: {
      type: Date,
      required: true,
    },
    time: {
      type: String,
      default: '02:00 PM',
    },
    meetingType: {
      type: String,
      enum: [
        'Initial Consultation',
        'Concept & Moodboard Review',
        'Material & Finish Selection',
        'Budget & Quotation Discussion',
        'Site Inspection Meeting',
        'Final Handover & Walkthrough',
      ],
      default: 'Initial Consultation',
    },
    locationType: {
      type: String,
      enum: ['Design Studio / Office', 'Client Site', 'Virtual / Zoom Meeting'],
      default: 'Design Studio / Office',
    },
    locationAddress: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Scheduled', 'Completed', 'Cancelled', 'Rescheduled'],
      default: 'Scheduled',
    },
    outcome: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Consultation', ConsultationSchema);

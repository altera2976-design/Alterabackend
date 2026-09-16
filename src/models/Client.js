const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    company: {
      type: String,
      trim: true,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      default: '',
    },
    gstin: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      enum: ['Lead', 'Client'],
      default: 'Client',
    },
    status: {
      type: String,
      enum: ['New', 'Contacted', 'Qualified', 'Active', 'Inactive', 'Lost'],
      default: 'Active',
    },
    latestActivity: {
      type: String,
      default: 'Created',
    },
    image: {
      type: String,
      default: 'https://randomuser.me/api/portraits/lego/1.jpg',
    },
    notes: {
      type: String,
      default: '',
    },
    financialSummary: {
      totalQuoted: { type: Number, default: 0 },
      totalInvoiced: { type: Number, default: 0 },
      totalPaid: { type: Number, default: 0 },
      totalOutstanding: { type: Number, default: 0 },
    },
    communicationHistory: [
      {
        channel: { type: String, enum: ['Call', 'WhatsApp', 'Email', 'Meeting'], default: 'Meeting' },
        summary: String,
        performedBy: String,
        date: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Client', ClientSchema);

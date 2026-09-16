const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema(
  {
    leadNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
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
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    leadSource: {
      type: String,
      enum: ['Website', 'Instagram', 'Facebook', 'Referral', 'Walk-in', 'Google Ads', 'Architect / Broker', 'Other'],
      default: 'Website',
    },
    requirement: {
      type: String,
      trim: true,
      default: 'Full Home Interior',
    },
    propertyType: {
      type: String,
      enum: ['1BHK', '2BHK', '3BHK', '4BHK+', 'Villa / Bungalow', 'Office', 'Retail / Commercial', 'Other'],
      default: '3BHK',
    },
    budget: {
      type: Number,
      default: 500000,
    },
    location: {
      type: String,
      trim: true,
      default: '',
    },
    assignedEmployee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    assignedEmployeeName: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: [
        'New Lead',
        'Contacted',
        'Qualified',
        'Consultation',
        'Site Visit',
        'Design',
        'Quotation',
        'Negotiation',
        'Approved',
        'Converted',
        'Lost',
      ],
      default: 'New Lead',
    },
    stageHistory: [
      {
        stage: String,
        updatedAt: { type: Date, default: Date.now },
        note: String,
      },
    ],
    notes: {
      type: String,
      default: '',
    },
    nextFollowUpDate: {
      type: Date,
    },
    convertedClientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
    },
    convertedProjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate lead number
LeadSchema.pre('validate', async function (next) {
  if (!this.leadNumber) {
    const count = await mongoose.model('Lead').countDocuments();
    this.leadNumber = `LD-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Lead', LeadSchema);

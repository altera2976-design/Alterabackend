const mongoose = require('mongoose');

const VendorPaymentSchema = new mongoose.Schema(
  {
    vendorName: {
      type: String,
      required: true,
      trim: true,
    },
    vendorContact: {
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
      gstin: { type: String, default: '' },
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
    projectName: {
      type: String,
      default: 'General Store',
    },
    procurementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Procurement',
    },
    materialOrService: {
      type: String,
      required: true,
      default: 'Materials / Hardware Supply',
    },
    amount: {
      type: Number,
      required: true,
      default: 0,
    },
    paymentMethod: {
      type: String,
      enum: ['Bank Transfer (NEFT/RTGS)', 'UPI', 'Cheque', 'Cash'],
      default: 'Bank Transfer (NEFT/RTGS)',
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Paid', 'Overdue', 'Cancelled'],
      default: 'Pending',
    },
    transactionRef: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

VendorPaymentSchema.pre('save', function (next) {
  if (this.dueDate && new Date() > new Date(this.dueDate) && this.paymentStatus === 'Pending') {
    this.paymentStatus = 'Overdue';
  }
  next();
});

module.exports = mongoose.model('VendorPayment', VendorPaymentSchema);

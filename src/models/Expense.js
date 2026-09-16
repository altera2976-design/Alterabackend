const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: [
        'Material Cost',
        'Labour / Contractor',
        'Site Utilities & Power',
        'Transportation & Freight',
        'Tools & Consumables',
        'Office & Administration',
        'Marketing & Client Acquisition',
        'Printing & Design Plots',
        'Miscellaneous',
      ],
      required: true,
      default: 'Material Cost',
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
    projectName: {
      type: String,
      default: '',
    },
    vendorOrEmployee: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      default: 0,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    paymentMethod: {
      type: String,
      enum: ['Bank Transfer', 'UPI', 'Cheque', 'Petty Cash', 'Company Card'],
      default: 'Bank Transfer',
    },
    receiptUrl: {
      type: String,
      default: '',
    },
    approvalStatus: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Approved',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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

module.exports = mongoose.model('Expense', ExpenseSchema);

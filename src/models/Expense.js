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
      enum: [
        'Bank Transfer', 'BANK_TRANSFER', 'Bank_Transfer',
        'UPI', 'upi',
        'Cheque', 'CHEQUE',
        'Petty Cash', 'Cash', 'CASH',
        'Company Card', 'Card', 'CARD',
        'Online', 'ONLINE',
        'Other', 'OTHER'
      ],
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

ExpenseSchema.index({ projectId: 1, date: -1 });
ExpenseSchema.index({ approvalStatus: 1 });
ExpenseSchema.index({ category: 1 });
ExpenseSchema.index({ date: -1 });

module.exports = mongoose.model('Expense', ExpenseSchema);

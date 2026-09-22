const mongoose = require('mongoose');

const TransactionTimelineSchema = new mongoose.Schema(
  {
    previousStatus: {
      type: String,
      default: '',
    },
    newStatus: {
      type: String,
      required: true,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    changedByName: {
      type: String,
      default: 'System',
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
    reason: {
      type: String,
      default: '',
    },
  },
  { _id: true }
);

const TransactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    referenceId: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    employeeName: {
      type: String,
      default: '',
      trim: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    adminName: {
      type: String,
      default: '',
      trim: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      index: true,
    },
    customerName: {
      type: String,
      default: '',
      trim: true,
    },
    quotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
      index: true,
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      index: true,
    },
    transactionType: {
      type: String,
      enum: [
        'Payment Received',
        'Payment Sent',
        'Refund',
        'Advance Payment',
        'Salary Payment',
        'Quotation Payment',
        'Invoice Payment',
        'Other',
      ],
      default: 'Payment Received',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Razorpay', 'Other'],
      default: 'UPI',
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Transaction amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    currency: {
      type: String,
      default: 'INR',
    },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Failed', 'Cancelled', 'Refunded'],
      default: 'Pending',
      index: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    transactionDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    timeline: [TransactionTimelineSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    createdByName: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for optimization
TransactionSchema.index({ status: 1, transactionDate: -1 });
TransactionSchema.index({ employeeId: 1, transactionDate: -1 });
TransactionSchema.index({ adminId: 1, transactionDate: -1 });
TransactionSchema.index({ customerId: 1, transactionDate: -1 });
TransactionSchema.index({ transactionType: 1, status: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema);

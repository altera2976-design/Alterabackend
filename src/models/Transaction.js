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
    mobileNumber: {
      type: String,
      default: '',
      trim: true,
    },
    quotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
      index: true,
    },
    quotationRef: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      index: true,
    },
    invoiceRef: {
      type: String,
      default: '',
      trim: true,
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
      enum: [
        'UPI', 'upi',
        'CASH', 'Cash', 'cash', 'Petty Cash',
        'BANK_TRANSFER', 'Bank Transfer', 'bank_transfer', 'Bank_Transfer', 'BANK TRANSFER', 'NEFT', 'RTGS', 'IMPS',
        'CHEQUE', 'Cheque', 'cheque',
        'ONLINE', 'Online', 'online', 'Net Banking', 'NET_BANKING',
        'CARD', 'Card', 'card', 'Company Card', 'Credit Card', 'Debit Card',
        'RAZORPAY', 'Razorpay', 'razorpay',
        'OTHER', 'Other', 'other',
        'Pending', 'PENDING', 'pending',
      ],
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
      enum: [
        'Pending', 'Completed', 'Failed', 'Cancelled', 'Refunded',
        'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED',
        'pending', 'completed', 'failed', 'cancelled', 'refunded',
        'PAID', 'paid', 'Success', 'SUCCESS', 'success',
      ],
      default: 'Completed',
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

// Auto-normalize paymentMethod and status to safe values
TransactionSchema.pre('validate', function (next) {
  if (this.paymentMethod && typeof this.paymentMethod === 'string') {
    const raw = this.paymentMethod.trim();
    const upper = raw.toUpperCase().replace(/[\s\-_]+/g, '');
    if (upper === 'ONLINE' || upper === 'NETBANKING' || upper === 'NETBANK' || upper === 'INTERNETBANKING') {
      this.paymentMethod = 'ONLINE';
    } else if (upper === 'UPI') {
      this.paymentMethod = 'UPI';
    } else if (upper === 'CASH' || upper === 'PETTYCASH') {
      this.paymentMethod = 'CASH';
    } else if (upper === 'BANKTRANSFER' || upper === 'NEFT' || upper === 'RTGS' || upper === 'IMPS') {
      this.paymentMethod = 'BANK_TRANSFER';
    } else if (upper === 'CHEQUE' || upper === 'CHECK') {
      this.paymentMethod = 'CHEQUE';
    } else if (upper === 'CARD' || upper === 'CREDITCARD' || upper === 'DEBITCARD') {
      this.paymentMethod = 'CARD';
    } else if (upper === 'RAZORPAY') {
      this.paymentMethod = 'RAZORPAY';
    } else {
      const allowed = [
        'UPI', 'upi',
        'CASH', 'Cash', 'cash', 'Petty Cash',
        'BANK_TRANSFER', 'Bank Transfer', 'bank_transfer', 'Bank_Transfer', 'BANK TRANSFER', 'NEFT', 'RTGS', 'IMPS',
        'CHEQUE', 'Cheque', 'cheque',
        'ONLINE', 'Online', 'online', 'Net Banking', 'NET_BANKING',
        'CARD', 'Card', 'card', 'Company Card', 'Credit Card', 'Debit Card',
        'RAZORPAY', 'Razorpay', 'razorpay',
        'OTHER', 'Other', 'other',
        'Pending', 'PENDING', 'pending',
      ];
      this.paymentMethod = allowed.includes(raw) ? raw : 'ONLINE';
    }
  } else {
    this.paymentMethod = 'UPI';
  }

  if (this.status && typeof this.status === 'string') {
    const s = this.status.trim().toUpperCase();
    if (['COMPLETED', 'PAID', 'SUCCESS', 'SUCCESSFUL'].includes(s)) {
      this.status = 'Completed';
    } else if (['PENDING', 'UNPAID', 'PROCESSING', 'INITIATED'].includes(s)) {
      this.status = 'Pending';
    } else if (['FAILED', 'FAILURE', 'DECLINED', 'REJECTED'].includes(s)) {
      this.status = 'Failed';
    } else if (['CANCELLED', 'CANCELED', 'VOID'].includes(s)) {
      this.status = 'Cancelled';
    } else if (['REFUNDED', 'REFUND'].includes(s)) {
      this.status = 'Refunded';
    } else if (['Completed', 'Pending', 'Failed', 'Cancelled', 'Refunded'].includes(this.status.trim())) {
      this.status = this.status.trim();
    } else {
      this.status = 'Completed';
    }
  } else {
    this.status = 'Completed';
  }
  next();
});

// Compound indexes for optimization
TransactionSchema.index({ status: 1, transactionDate: -1 });
TransactionSchema.index({ employeeId: 1, transactionDate: -1 });
TransactionSchema.index({ adminId: 1, transactionDate: -1 });
TransactionSchema.index({ customerId: 1, transactionDate: -1 });
TransactionSchema.index({ transactionType: 1, status: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema);

const mongoose = require('mongoose');

const InvoiceItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  room: { type: String, default: 'General' },
  quantity: { type: Number, required: true, default: 1 },
  rate: { type: Number, required: true, default: 0 },
  amount: { type: Number, required: true, default: 0 },
});

const PaymentRecordSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  paymentDate: { type: Date, default: Date.now },
  method: {
    type: String,
    enum: ['Bank Transfer (NEFT/RTGS)', 'UPI', 'Cheque', 'Credit Card', 'Cash'],
    default: 'Bank Transfer (NEFT/RTGS)',
  },
  transactionRef: { type: String, default: '' },
  notes: { type: String, default: '' },
  receivedBy: { type: String, default: 'Admin' },
});

const InvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
    projectName: {
      type: String,
      default: '',
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
    },
    clientName: {
      type: String,
      required: true,
      trim: true,
    },
    clientContact: {
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
      address: { type: String, default: '' },
      gstin: { type: String, default: '' },
    },
    quotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
    },
    quotationNumber: {
      type: String,
      default: '',
    },
    items: [InvoiceItemSchema],
    subtotal: {
      type: Number,
      required: true,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    gstRate: {
      type: Number,
      default: 18,
    },
    gstAmount: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    balanceAmount: {
      type: Number,
      default: 0,
    },
    issueDate: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['Draft', 'Issued', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'],
      default: 'Issued',
    },
    payments: [PaymentRecordSchema],
    notes: {
      type: String,
      default: 'Thank you for your business. Please complete payment by due date.',
    },
    bankDetails: {
      bankName: { type: String, default: 'HDFC Bank' },
      accountName: { type: String, default: 'Interior Design Studio Pvt Ltd' },
      accountNumber: { type: String, default: '50200012345678' },
      ifscCode: { type: String, default: 'HDFC0001234' },
      upiId: { type: String, default: 'interior@hdfcbank' },
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate invoiceNumber if not provided
InvoiceSchema.pre('validate', async function (next) {
  if (!this.invoiceNumber) {
    const count = await mongoose.model('Invoice').countDocuments();
    const year = new Date().getFullYear();
    this.invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// Auto compute balance and status
InvoiceSchema.pre('save', function (next) {
  this.balanceAmount = Math.max(0, this.totalAmount - (this.paidAmount || 0));
  if (this.totalAmount > 0 && this.balanceAmount <= 0) {
    this.paymentStatus = 'Paid';
  } else if (this.paidAmount > 0 && this.balanceAmount > 0) {
    this.paymentStatus = 'Partially Paid';
  } else if (this.dueDate && new Date() > new Date(this.dueDate) && this.balanceAmount > 0) {
    this.paymentStatus = 'Overdue';
  }
  next();
});

module.exports = mongoose.model('Invoice', InvoiceSchema);

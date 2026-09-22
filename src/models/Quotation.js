const mongoose = require('mongoose');

const QuotationItemSchema = new mongoose.Schema(
  {
    itemNumber: { type: Number, default: 1 },
    room: {
      type: String,
      required: true,
      default: 'Living Room',
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    unit: {
      type: String,
      enum: ['Sq Ft', 'Sq M', 'Nos', 'Running Ft', 'Lump Sum', 'Hours', 'Days', 'Custom'],
      default: 'Sq Ft',
    },
    measurements: {
      length: { type: Number, default: 0 },
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
      calculatedArea: { type: Number, default: 0 },
    },
    quantity: {
      type: Number,
      required: true,
      min: [0.01, 'Quantity must be greater than zero'],
      default: 1,
    },
    rate: {
      type: Number,
      required: true,
      min: [0, 'Rate cannot be negative'],
      default: 0,
    },
    amount: {
      type: Number,
      required: true,
      default: 0,
    },
    specifications: {
      carcass: { type: String, default: '' },
      shutter: { type: String, default: '' },
      finish: { type: String, default: '' },
      brand: { type: String, default: '' },
      hardware: { type: String, default: '' },
      thickness: { type: String, default: '18mm' },
    },
    accessories: [
      {
        name: { type: String, required: true },
        qty: { type: Number, default: 1 },
        inclusionType: {
          type: String,
          enum: ['INCLUDED', 'EXCLUDED', 'LUMP_SUM', 'ACTUAL_COST'],
          default: 'INCLUDED',
        },
        cost: { type: Number, default: 0 },
      },
    ],
    remarks: { type: String, default: '' },
    scope: {
      type: String,
      enum: ['COMPANY_SCOPE', 'CLIENT_SCOPE'],
      default: 'COMPANY_SCOPE',
    },
    costVariationNote: {
      type: String,
      default: 'Cost may vary as per Design or Measurements.',
    },
  },
  { _id: true }
);

const QuotationSchema = new mongoose.Schema(
  {
    quotationNumber: {
      type: String,
      required: true,
      trim: true,
    },
    revision: {
      type: Number,
      default: 0,
    },
    isLatest: {
      type: Boolean,
      default: true,
    },
    parentQuotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
    },
    client: {
      name: { type: String, required: true, trim: true },
      company: { type: String, trim: true, default: '' },
      phone: { type: String, trim: true, default: '' },
      email: { type: String, trim: true, default: '' },
      address: { type: String, trim: true, default: '' },
      gstin: { type: String, trim: true, default: '' },
    },
    projectTitle: {
      type: String,
      required: true,
      default: 'Interior Project',
      trim: true,
    },
    projectType: {
      type: String,
      default: 'Residential Interior',
      trim: true,
    },
    siteLocation: {
      type: String,
      default: '',
      trim: true,
    },
    assignedDesigner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    assignedDesignerName: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: [
        'Draft',
        'Sent',
        'Viewed',
        'Under Discussion',
        'Approved',
        'Rejected',
        'Expired',
        'Revised',
        'Converted to Project',
        'Cancelled',
      ],
      default: 'Draft',
    },
    quotationDate: {
      type: Date,
      default: Date.now,
    },
    validUntil: {
      type: Date,
      required: true,
    },
    items: [QuotationItemSchema],
    pricing: {
      subtotal: { type: Number, default: 0 },
      handlingFeePercent: { type: Number, default: 2 },
      handlingFeeAmount: { type: Number, default: 0 },
      designFeePercent: { type: Number, default: 2 },
      designFeeAmount: { type: Number, default: 0 },
      discountType: {
        type: String,
        enum: ['PERCENT', 'FIXED'],
        default: 'PERCENT',
      },
      discountValue: { type: Number, default: 0 },
      discountAmount: { type: Number, default: 0 },
      taxableAmount: { type: Number, default: 0 },
      gstPercent: { type: Number, default: 18 },
      gstType: {
        type: String,
        enum: ['CGST_SGST', 'IGST', 'AS_PER_ACTUAL'],
        default: 'AS_PER_ACTUAL',
      },
      cgstAmount: { type: Number, default: 0 },
      sgstAmount: { type: Number, default: 0 },
      igstAmount: { type: Number, default: 0 },
      totalGstAmount: { type: Number, default: 0 },
      grandTotal: { type: Number, default: 0 },
      amountInWords: { type: String, default: '' },
    },
    paymentMilestones: [
      {
        milestoneName: { type: String, required: true },
        percentage: { type: Number, required: true },
        amount: { type: Number, default: 0 },
        stage: { type: String, default: '' },
      },
    ],
    termsAndConditions: [
      {
        type: String,
      },
    ],
    bankDetails: {
      accountName: { type: String, default: 'Altera Interior Pvt Ltd' },
      bankName: { type: String, default: 'HDFC Bank' },
      accountNumber: { type: String, default: '50200012345678' },
      ifscCode: { type: String, default: 'HDFC0001234' },
      branch: { type: String, default: 'Main Branch' },
      upiId: { type: String, default: 'altera@hdfcbank' },
    },
    companyDetails: {
      name: { type: String, default: 'Altera Interior' },
      tagline: { type: String, default: 'The Modern Home Maker • Interior | Architect | Construction' },
      address: { type: String, default: 'Plot 42, Sector 18, Commercial Hub' },
      phone: { type: String, default: '+91 98765 43210' },
      email: { type: String, default: 'contact@alterainterior.com' },
      gstin: { type: String, default: '07AAAAA0000A1Z5' },
      logoUrl: { type: String, default: '' },
    },
    publicToken: {
      type: String,
      unique: true,
      sparse: true,
    },
    clientApproval: {
      approved: { type: Boolean, default: false },
      approvedAt: { type: Date },
      clientComments: { type: String, default: '' },
      rejectionReason: { type: String, default: '' },
      clientIp: { type: String, default: '' },
    },
    convertedProject: {
      projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
      convertedAt: { type: Date },
      convertedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    notes: {
      type: String,
      default: '',
    },
    auditLog: [
      {
        action: { type: String, required: true },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        performedByName: { type: String, default: '' },
        timestamp: { type: Date, default: Date.now },
        details: { type: String, default: '' },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

QuotationSchema.index({ quotationNumber: 1, revision: 1 });
QuotationSchema.index({ status: 1 });
QuotationSchema.index({ clientId: 1 });
QuotationSchema.index({ 'client.name': 'text', projectTitle: 'text', quotationNumber: 'text' });

module.exports = mongoose.model('Quotation', QuotationSchema);

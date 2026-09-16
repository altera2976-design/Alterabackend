const mongoose = require('mongoose');

const ProcurementSchema = new mongoose.Schema(
  {
    poNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    projectName: {
      type: String,
      default: '',
    },
    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Material',
    },
    materialName: {
      type: String,
      required: true,
      trim: true,
    },
    supplier: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      default: 1,
    },
    unit: {
      type: String,
      default: 'Nos',
    },
    purchasePrice: {
      type: Number,
      required: true,
      default: 0,
    },
    totalCost: {
      type: Number,
      default: 0,
    },
    orderDate: {
      type: Date,
      default: Date.now,
    },
    expectedDelivery: {
      type: Date,
    },
    actualDeliveryDate: {
      type: Date,
    },
    deliveryStatus: {
      type: String,
      enum: ['Draft / PO Created', 'Ordered with Vendor', 'Dispatched / In Transit', 'Delivered at Site', 'Cancelled'],
      default: 'Ordered with Vendor',
    },
    invoiceNumber: {
      type: String,
      default: '',
    },
    paymentStatus: {
      type: String,
      enum: ['Unpaid', 'Partially Paid', 'Paid'],
      default: 'Unpaid',
    },
    receivedBy: {
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

ProcurementSchema.pre('validate', async function (next) {
  if (!this.poNumber) {
    const count = await mongoose.model('Procurement').countDocuments();
    this.poNumber = `PO-${String(count + 1).padStart(5, '0')}`;
  }
  if (this.quantity && this.purchasePrice) {
    this.totalCost = Number((this.quantity * this.purchasePrice).toFixed(2));
  }
  next();
});

module.exports = mongoose.model('Procurement', ProcurementSchema);

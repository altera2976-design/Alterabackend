const mongoose = require('mongoose');

const BOQItemSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectRoom',
    },
    roomName: {
      type: String,
      default: 'General',
    },
    item: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    unit: {
      type: String,
      enum: ['Sq Ft', 'Sq M', 'Nos', 'Rft', 'Lump Sum', 'Sets', 'Kg', 'Mtr'],
      default: 'Sq Ft',
    },
    quantity: {
      type: Number,
      required: true,
      default: 1,
    },
    rate: {
      type: Number,
      required: true,
      default: 0,
    },
    amount: {
      type: Number,
      default: 0,
    },
    material: {
      type: String,
      default: 'Commercial Plywood 18mm',
    },
    brand: {
      type: String,
      default: 'CenturyPly / Greenlam',
    },
    finish: {
      type: String,
      default: '1mm High Gloss Laminate',
    },
    status: {
      type: String,
      enum: ['Pending', 'Material Ordered', 'In Progress', 'Completed', 'Inspected'],
      default: 'Pending',
    },
  },
  {
    timestamps: true,
  }
);

BOQItemSchema.pre('save', function (next) {
  this.amount = (this.quantity || 0) * (this.rate || 0);
  next();
});

module.exports = mongoose.model('BOQItem', BOQItemSchema);

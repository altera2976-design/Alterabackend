const mongoose = require('mongoose');

const MaterialSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: [
        'Plywood & Boards',
        'Laminates & Veneers',
        'Hardware & Fittings',
        'Paints & Polish',
        'Tiles & Flooring',
        'Electrical & Lighting',
        'Glass & Mirrors',
        'Fabrics & Upholstery',
        'Sanitary & Plumbing',
        'Granite & Quartz',
        'Other',
      ],
      default: 'Plywood & Boards',
    },
    brand: {
      type: String,
      trim: true,
      default: '',
    },
    finish: {
      type: String,
      default: 'Matte / Suede',
    },
    thickness: {
      type: String,
      default: '18mm',
    },
    unit: {
      type: String,
      enum: ['Sheets', 'Sq Ft', 'Nos', 'Running Ft', 'Ltr', 'Boxes', 'Sets', 'Kg', 'Mtr'],
      default: 'Sheets',
    },
    rate: {
      type: Number,
      required: true,
      default: 0,
    },
    supplier: {
      type: String,
      default: '',
    },
    stock: {
      type: Number,
      default: 0,
    },
    minStockLevel: {
      type: Number,
      default: 5,
    },
    locationInWarehouse: {
      type: String,
      default: 'Main Store',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Material', MaterialSchema);

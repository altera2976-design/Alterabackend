const mongoose = require('mongoose');

const ProjectRoomSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    roomName: {
      type: String,
      required: true,
      trim: true,
    },
    roomType: {
      type: String,
      enum: [
        'Living Room',
        'Master Bedroom',
        'Bedroom 01',
        'Bedroom 02',
        'Kitchen',
        'Dining Room',
        'Bathroom / Powder Room',
        'Balcony / Terrace',
        'Home Office / Study',
        'Pooja Room',
        'Foyer / Entryway',
        'Other',
      ],
      default: 'Living Room',
    },
    dimensions: {
      length: { type: Number, default: 0 },
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
      unit: { type: String, default: 'ft' },
      carpetAreaSqFt: { type: Number, default: 0 },
    },
    itemsCount: {
      type: Number,
      default: 0,
    },
    designStatus: {
      type: String,
      enum: ['Not Started', 'In Design', 'Review Pending', 'Client Approved', 'Revision Required'],
      default: 'Not Started',
    },
    estimatedCost: {
      type: Number,
      default: 0,
    },
    actualCost: {
      type: Number,
      default: 0,
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    materialsUsed: [
      {
        materialName: String,
        category: String,
        quantity: Number,
        unit: String,
      },
    ],
    assignedEmployee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    assignedEmployeeName: {
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

module.exports = mongoose.model('ProjectRoom', ProjectRoomSchema);

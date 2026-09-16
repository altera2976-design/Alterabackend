const mongoose = require('mongoose');

const MeasurementSchema = new mongoose.Schema(
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
      required: true,
    },
    componentName: {
      type: String,
      default: 'Main Wall / Opening',
    },
    length: {
      type: Number,
      required: true,
      default: 0,
    },
    width: {
      type: Number,
      required: true,
      default: 0,
    },
    height: {
      type: Number,
      default: 0,
    },
    area: {
      type: Number,
      default: 0,
    },
    unit: {
      type: String,
      enum: ['ft', 'inch', 'mm', 'mtr'],
      default: 'ft',
    },
    photoUrl: {
      type: String,
      default: '',
    },
    measuredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    measuredByName: {
      type: String,
      default: 'Site Supervisor',
    },
    date: {
      type: Date,
      default: Date.now,
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

MeasurementSchema.pre('save', function (next) {
  if (this.length && this.width) {
    this.area = Number((this.length * this.width).toFixed(2));
  }
  next();
});

module.exports = mongoose.model('Measurement', MeasurementSchema);

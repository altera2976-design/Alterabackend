const mongoose = require('mongoose');

const ProjectPhotoSchema = new mongoose.Schema(
  {
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
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    uploadedByName: {
      type: String,
      default: '',
    },
    photoUrl: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    location: {
      latitude: Number,
      longitude: Number,
      address: String,
    },
    category: {
      type: String,
      enum: ['Progress', 'Site Condition', 'Inspection', 'Material', 'Completed Work', 'Issue', 'Other'],
      default: 'Progress',
    },
    capturedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ProjectPhoto', ProjectPhotoSchema);

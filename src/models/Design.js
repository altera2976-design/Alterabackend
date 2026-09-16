const mongoose = require('mongoose');

const DesignSchema = new mongoose.Schema(
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
      default: 'Overall Project',
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['2D Floor Plan', '3D Design / Render', 'Elevation', 'Mood Board', 'Electrical & Plumbing Layout', 'False Ceiling Detail'],
      default: '3D Design / Render',
    },
    fileUrl: {
      type: String,
      required: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    designerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    designerName: {
      type: String,
      default: 'Architect / 3D Visualizer',
    },
    clientApprovalStatus: {
      type: String,
      enum: ['Draft / Internal', 'Shared with Client', 'Client Approved', 'Revision Requested', 'Rejected'],
      default: 'Draft / Internal',
    },
    clientFeedback: {
      type: String,
      default: '',
    },
    approvalDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Design', DesignSchema);

const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema(
  {
    taskId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: false,
      index: true,
    },
    projectName: {
      type: String,
      default: '',
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
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    assignedToName: {
      type: String,
      default: '',
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
    },
    startDate: {
      type: String,
      default: '',
    },
    dueDate: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Pending', 'To Do', 'In Progress', 'On Hold', 'Blocked', 'Completed'],
      default: 'Pending',
      index: true,
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    pdfUrl: {
      type: String,
      default: '',
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        comment: { type: String, default: '' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedByName: { type: String, default: '' },
        updatedAt: { type: Date, default: Date.now },
        images: [
          {
            fileName: { type: String },
            originalName: { type: String },
            fileUrl: { type: String },
            url: { type: String },
            driveFileId: { type: String },
            driveUrl: { type: String },
            fileType: { type: String },
            fileSize: { type: Number },
            uploadedAt: { type: Date, default: Date.now },
          },
        ],
      },
    ],
    comments: [
      {
        authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        authorName: { type: String, default: '' },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    attachments: [
      {
        fileName: { type: String },
        originalName: { type: String },
        driveFileId: { type: String },
        driveUrl: { type: String },
        fileUrl: { type: String },
        fileType: { type: String },
        mimeType: { type: String },
        fileSize: { type: Number },
        folderType: { type: String, default: 'Tasks' },
        name: { type: String },
        url: { type: String },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        uploadedByName: { type: String, default: '' },
        uploadedAt: { type: Date, default: Date.now },
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

module.exports = mongoose.model('Task', TaskSchema);

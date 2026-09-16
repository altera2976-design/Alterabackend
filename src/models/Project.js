const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema(
  {
    projectId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    client: {
      type: String,
      required: true,
      trim: true,
    },
    clientContact: {
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
    },
    projectAddress: {
      type: String,
      default: '',
    },
    projectType: {
      type: String,
      enum: ['Interior', 'Architecture', 'Renovation', 'Commercial', 'Residential', 'Modular Kitchen', 'Other'],
      default: 'Interior',
    },
    quotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
    },
    quotationNumber: {
      type: String,
      default: '',
    },
    startDate: {
      type: String, // String representation or ISO date e.g. "2026-09-15"
      default: '',
    },
    expectedCompletionDate: {
      type: String,
      default: '',
    },
    actualCompletionDate: {
      type: String,
      default: '',
    },
    deadline: {
      type: String, // Kept for backwards compatibility
      default: '',
    },
    budget: {
      estimatedBudget: { type: Number, default: 0 },
      approvedBudget: { type: Number, default: 0 },
      actualCost: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
      expenses: { type: Number, default: 0 },
      profit: { type: Number, default: 0 },
    },
    value: {
      type: Number,
      default: 0,
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
    },
    status: {
      type: String,
      enum: ['Draft', 'Not Started', 'Planning', 'In Progress', 'On Hold', 'Completed', 'Cancelled'],
      default: 'Planning',
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    tasks: {
      type: Number,
      default: 0,
    },
    tasksCount: {
      total: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
      inProgress: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      blocked: { type: Number, default: 0 },
    },
    paymentSummary: {
      quotationValue: { type: Number, default: 0 },
      paymentsReceived: { type: Number, default: 0 },
      pendingPayments: { type: Number, default: 0 },
    },
    projectManager: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
    },
    assignedTeam: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        name: { type: String, required: true },
        email: { type: String, default: '' },
        phone: { type: String, default: '' },
        role: {
          type: String,
          default: 'Team Member', // Designer, Site Engineer, Supervisor, Carpenter/Execution, etc.
        },
        assignedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    attachments: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        category: {
          type: String,
          enum: [
            'Quotation',
            'Design',
            'Drawing',
            'Measurement',
            'Material',
            'Invoice',
            'Payment',
            'Site Photo',
            'Client Document',
            'Other',
          ],
          default: 'Other',
        },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        uploadedByName: { type: String, default: '' },
        uploadedAt: { type: Date, default: Date.now },
        size: { type: Number, default: 0 },
      },
    ],
    notes: [
      {
        text: { type: String, required: true },
        author: { type: String, default: 'Admin' },
        authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    description: {
      type: String,
      default: '',
    },
    image: {
      type: String,
      default: 'https://images.unsplash.com/photo-1595515106969-1ce29566ff1c?w=400&q=80',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Helper method to sanitize financial information for non-admin viewers
ProjectSchema.methods.toEmployeeJSON = function () {
  const obj = this.toObject();
  delete obj.budget;
  delete obj.paymentSummary;
  // If financial values shouldn't be seen by employees:
  delete obj.value;
  return obj;
};

module.exports = mongoose.model('Project', ProjectSchema);

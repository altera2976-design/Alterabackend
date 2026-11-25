const mongoose = require('mongoose');

const VALID_PROJECT_TYPES = [
  'Interior',
  'Architecture',
  'Renovation',
  'Commercial',
  'Residential',
  'Modular Kitchen',
  'Modular Wardrobe',
  'Wardrobe/Kitchen',
  'Modular Work',
  'Turnkey Interior',
  'Other',
];

function normalizeProjectType(val) {
  if (!val || typeof val !== 'string') return 'Interior';
  const clean = val.trim();
  const lower = clean.toLowerCase();

  // Direct case-insensitive match
  const directMatch = VALID_PROJECT_TYPES.find(
    (t) => t.toLowerCase() === lower
  );
  if (directMatch) return directMatch;

  // Composite & specific alias mappings
  if (
    (lower.includes('wardrobe') && lower.includes('kitchen')) ||
    lower.includes('wardrobe/kitchen') ||
    lower.includes('kitchen/wardrobe') ||
    lower.includes('wardrobe / kitchen') ||
    lower.includes('kitchen / wardrobe')
  ) {
    return 'Wardrobe/Kitchen';
  }

  if (lower.includes('modular') && lower.includes('kitchen')) {
    return 'Modular Kitchen';
  }

  if (
    lower.includes('modular') &&
    (lower.includes('wardrobe') || lower.includes('closet'))
  ) {
    return 'Modular Wardrobe';
  }

  if (lower === 'wardrobe' || lower === 'wardrobes' || lower.includes('wardrobe')) {
    return 'Modular Wardrobe';
  }

  if (lower === 'kitchen' || lower.includes('kitchen')) {
    return 'Modular Kitchen';
  }

  if (
    lower.includes('modular') &&
    (lower.includes('work') || lower.includes('works') || lower === 'modular')
  ) {
    return 'Modular Work';
  }

  if (
    lower.includes('residential') ||
    lower.includes('villa') ||
    lower.includes('flat') ||
    lower.includes('apartment') ||
    lower.includes('home')
  ) {
    return 'Residential';
  }

  if (
    lower.includes('commercial') ||
    lower.includes('office') ||
    lower.includes('retail') ||
    lower.includes('shop') ||
    lower.includes('store') ||
    lower.includes('restaurant')
  ) {
    return 'Commercial';
  }

  if (
    lower.includes('renovat') ||
    lower.includes('civil') ||
    lower.includes('remodel') ||
    lower.includes('restoration')
  ) {
    return 'Renovation';
  }

  if (lower.includes('architect')) {
    return 'Architecture';
  }

  if (lower.includes('turnkey')) {
    return 'Turnkey Interior';
  }

  if (lower.includes('interior')) {
    return 'Interior';
  }

  return 'Other';
}

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
      set: normalizeProjectType,
      enum: VALID_PROJECT_TYPES,
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

// Normalize projectType before validation
ProjectSchema.pre('validate', function (next) {
  if (this.projectType) {
    this.projectType = normalizeProjectType(this.projectType);
  } else {
    this.projectType = 'Interior';
  }
  if (typeof next === 'function') next();
});

ProjectSchema.statics.normalizeProjectType = normalizeProjectType;
ProjectSchema.statics.VALID_PROJECT_TYPES = VALID_PROJECT_TYPES;

ProjectSchema.index({ 'assignedTeam.userId': 1 });
ProjectSchema.index({ 'projectManager.userId': 1 });
ProjectSchema.index({ status: 1 });
ProjectSchema.index({ projectType: 1 });
ProjectSchema.index({ priority: 1 });
ProjectSchema.index({ createdAt: -1 });
ProjectSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Project', ProjectSchema);

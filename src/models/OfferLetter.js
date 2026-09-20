const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_RULES = [
  {
    ruleNumber: 1,
    title: 'Client Communication & Personal Contact',
    description: 'Employees must maintain strict professional communication with clients through official company channels only. Sharing personal contact numbers, personal social media profiles, or engaging in personal conversations with clients without prior authorization is strictly prohibited.',
  },
  {
    ruleNumber: 2,
    title: 'No Personal Work During Office Hours',
    description: 'Working hours are dedicated exclusively to company tasks, client projects, and business responsibilities. Engaging in freelance work, personal business activities, or non-work-related tasks during official working hours is prohibited.',
  },
  {
    ruleNumber: 3,
    title: 'Confidentiality',
    description: 'You will have access to sensitive company data, client information, designs, financial records, and operational strategies. All such information must remain strictly confidential during and after your tenure with the company.',
  },
  {
    ruleNumber: 4,
    title: 'Client & Company Property',
    description: 'All hardware, software tools, designs, data files, prototypes, and physical assets issued by or created for the company remain the exclusive property of Altera Interior. Company assets must be handled with care and returned upon request or exit.',
  },
  {
    ruleNumber: 5,
    title: 'Professional Conduct',
    description: 'Employees are expected to represent Altera Interior with high standards of professionalism, integrity, ethical conduct, and respect toward colleagues, management, sub-contractors, and clients at all times.',
  },
  {
    ruleNumber: 6,
    title: 'Attendance & Punctuality',
    description: 'Adherence to designated working hours and punctual attendance is compulsory. In case of unexpected delay or emergency, immediate notification to your Reporting Manager or HR department is required.',
  },
  {
    ruleNumber: 7,
    title: 'Leave & Absence',
    description: 'All leave requests must be submitted in advance through the company HR portal and approved by your Reporting Manager. Unapproved absences may lead to pro-rata salary deduction and disciplinary action.',
  },
  {
    ruleNumber: 8,
    title: 'Notice Period',
    description: 'Either party may terminate the employment relationship by providing the specified written notice period or equivalent salary in lieu thereof, subject to proper handover completion and company approval.',
  },
  {
    ruleNumber: 9,
    title: 'Handover on Exit',
    description: 'Upon resignation or termination, you must complete a formal handover of all ongoing projects, documentation, credentials, access keys, and physical assets to the designated authority before final clearance.',
  },
  {
    ruleNumber: 10,
    title: 'Conflict of Interest',
    description: 'You shall not engage in any business, consultancy, or employment that directly or indirectly competes with Altera Interior or conflicts with your duty of loyalty to the company.',
  },
  {
    ruleNumber: 11,
    title: 'No Unauthorized Commitments',
    description: 'No employee has the authority to make financial, legal, or commercial commitments, agreements, or discounts on behalf of Altera Interior without explicit written consent from Super Admin.',
  },
  {
    ruleNumber: 12,
    title: 'Use of Company Resources',
    description: 'Company internet, computer systems, email accounts, and software tools must be used solely for legitimate business purposes. Unauthorized downloads, illegal software, or misuse of IT assets is strictly banned.',
  },
  {
    ruleNumber: 13,
    title: 'Social Media & Public Communication',
    description: 'Public statements, press comments, or social media posts regarding company operations, clients, internal matters, or proprietary designs require prior written approval from management.',
  },
  {
    ruleNumber: 14,
    title: 'Policy Updates',
    description: 'Altera Interior reserves the right to amend, update, or implement new internal rules, employee handbooks, and working policies as necessary for business operational excellence.',
  },
  {
    ruleNumber: 15,
    title: 'Disciplinary Action',
    description: 'Violation of company policies, misconduct, breach of confidentiality, or gross negligence will result in disciplinary procedures up to and including immediate termination without notice.',
  },
];

const RuleSchema = new mongoose.Schema({
  ruleNumber: { type: Number, required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  isCustom: { type: Boolean, default: false },
});

const AuditLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: { type: String, default: 'System' },
  userRole: { type: String, default: 'SUPER_ADMIN' },
  action: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  ip: { type: String, default: '' },
  details: { type: String, default: '' },
});

const OfferLetterSchema = new mongoose.Schema(
  {
    offerLetterNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    offerLetterDate: {
      type: Date,
      default: Date.now,
    },

    // Candidate Info
    candidateName: {
      type: String,
      required: [true, 'Candidate name is required'],
      trim: true,
    },
    fatherGuardianName: {
      type: String,
      required: [true, 'Father / Guardian name is required'],
      trim: true,
    },
    address: {
      type: String,
      required: [true, 'Residential address is required'],
      trim: true,
    },
    mobile: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email ID is required'],
      lowercase: true,
      trim: true,
    },

    // Position Details
    designation: {
      type: String,
      required: [true, 'Designation is required'],
      trim: true,
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
    },
    joiningDate: {
      type: Date,
      required: [true, 'Date of joining is required'],
    },
    employmentType: {
      type: String,
      enum: ['Full Time', 'Part Time', 'Internship', 'Contract'],
      default: 'Full Time',
    },
    reportingManager: {
      type: String,
      trim: true,
      default: 'Management / HR',
    },
    workLocation: {
      type: String,
      trim: true,
      default: 'Gurugram, Haryana',
    },
    probationPeriod: {
      type: String,
      trim: true,
      default: '3 Months',
    },
    noticePeriod: {
      type: String,
      trim: true,
      default: '30 Days',
    },

    // Salary Details
    monthlySalary: {
      type: Number,
      required: [true, 'Monthly salary is required'],
      min: [0, 'Salary cannot be negative'],
    },
    annualCTC: {
      type: Number,
      required: [true, 'Annual CTC is required'],
      min: [0, 'Annual CTC cannot be negative'],
    },
    salaryPaymentCycle: {
      type: String,
      default:
        'Salary will be credited / paid on or before the 10th of every month, subject to attendance, approved leave and applicable company policies.',
    },

    // Letter Content & Rules
    companyName: {
      type: String,
      default: 'Altera Interior Pvt. Ltd.',
    },
    greetingText: {
      type: String,
      default: 'Dear [Candidate Name],',
    },
    offerParagraph: {
      type: String,
      default:
        'We are pleased to offer you employment with Altera Interior for the position of [Designation]. Based on your profile, skills and discussions with the company, we believe that you can contribute positively to our team and ongoing projects.',
    },
    rulesAndRegulations: {
      type: [RuleSchema],
      default: DEFAULT_RULES,
    },

    // Workflow Status
    status: {
      type: String,
      enum: [
        'DRAFT',
        'PENDING_APPROVAL',
        'RELEASED',
        'VIEWED',
        'ACCEPTED',
        'REJECTED',
        'REVOKED',
        'EXPIRED',
      ],
      default: 'DRAFT',
    },

    // Access Token for Candidate Acceptance
    publicToken: {
      type: String,
      unique: true,
      default: () => uuidv4(),
    },
    pdfUrl: {
      type: String,
      default: '',
    },
    pdfFileName: {
      type: String,
      default: '',
    },

    // Audit & Workflow Lifecycle
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    createdByName: {
      type: String,
      default: '',
    },
    releasedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    releasedByName: {
      type: String,
      default: '',
    },
    releasedAt: {
      type: Date,
    },

    // Candidate Acceptance
    viewedAt: {
      type: Date,
    },
    acceptedAt: {
      type: Date,
    },
    acceptedIP: {
      type: String,
      default: '',
    },
    candidateSignature: {
      type: String,
      default: '',
    },
    rejectedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      default: '',
    },

    // Revocation
    revokedAt: {
      type: Date,
    },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    revokedByName: {
      type: String,
      default: '',
    },
    revokeReason: {
      type: String,
      default: '',
    },

    auditLogs: [AuditLogSchema],
  },
  {
    timestamps: true,
  }
);

OfferLetterSchema.statics.getDefaultRules = function () {
  return DEFAULT_RULES;
};

module.exports = mongoose.model('OfferLetter', OfferLetterSchema);

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_RULES = [
  {
    ruleNumber: 1,
    title: 'Client Communication & Personal Contact',
    description: "Employees must not share or use personal mobile numbers, personal email IDs or private social-media accounts for direct client communication without written authorization. All official client communication must be made through the company's authorized office number / official communication channels.",
  },
  {
    ruleNumber: 2,
    title: 'No Personal Work During Office Hours',
    description: 'During working hours, employees must devote their time and attention to the company. Employees shall not perform work, assignments, freelance projects or business activities for any other client / company during office hours.',
  },
  {
    ruleNumber: 3,
    title: 'Confidentiality',
    description: 'All client information, quotations, designs, drawings, measurements, vendor details, pricing, project information, documents, passwords and other company information must be kept strictly confidential and must not be shared with unauthorized persons.',
  },
  {
    ruleNumber: 4,
    title: 'Client & Company Property',
    description: 'Client documents, samples, keys, drawings, photographs, files, software access, company devices and other materials must be handled responsibly and returned when requested or upon separation from the company.',
  },
  {
    ruleNumber: 5,
    title: 'Professional Conduct',
    description: 'Employees must maintain professional behaviour, punctuality, appropriate communication and respectful conduct with clients, management, colleagues, vendors and contractors.',
  },
  {
    ruleNumber: 6,
    title: 'Attendance & Punctuality',
    description: 'Employees are expected to report on time and follow the working hours, attendance system and leave procedure prescribed by the company.',
  },
  {
    ruleNumber: 7,
    title: 'Leave & Absence',
    description: 'Planned leave should be requested and approved in advance. In case of an emergency or unavoidable absence, the employee must inform the reporting manager / office at the earliest possible time.',
  },
  {
    ruleNumber: 8,
    title: 'Notice Period',
    description: "An employee intending to resign or discontinue employment must provide at least 15 days' prior written notice to the company, unless otherwise agreed in writing by management.",
  },
  {
    ruleNumber: 9,
    title: 'Handover on Exit',
    description: 'Before leaving the company, the employee must complete pending responsibilities and provide a proper handover of files, client information, project status, passwords, company property and other work-related materials.',
  },
  {
    ruleNumber: 10,
    title: 'Conflict of Interest',
    description: "Employees must disclose any situation that may create a conflict between their personal interests and the company's interests. No employee may use company clients, leads or resources for personal commercial benefit.",
  },
  {
    ruleNumber: 11,
    title: 'No Unauthorized Commitments',
    description: 'Employees must not promise prices, discounts, timelines, designs, refunds, services or other commitments to clients on behalf of the company without authorization.',
  },
  {
    ruleNumber: 12,
    title: 'Use of Company Resources',
    description: 'Company systems, software, internet, devices, documents and other resources must be used responsibly and primarily for official work.',
  },
  {
    ruleNumber: 13,
    title: 'Social Media & Public Communication',
    description: 'Employees must not publish confidential project information, client details, internal documents or statements representing the company without authorization.',
  },
  {
    ruleNumber: 14,
    title: 'Policy Updates',
    description: 'The company may update its internal policies, procedures and operational guidelines from time to time. Employees are expected to comply with applicable updated policies communicated by management.',
  },
  {
    ruleNumber: 15,
    title: 'Disciplinary Action',
    description: 'Violation of company rules, misuse of confidential information, unauthorized client dealing, fraud, serious misconduct or repeated non-compliance may result in disciplinary action, up to and including termination, subject to applicable law and company policy.',
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
      default: 'N/A',
      trim: true,
    },
    address: {
      type: String,
      default: 'N/A',
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
    pdfDriveFileId: {
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

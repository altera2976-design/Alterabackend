const mongoose = require('mongoose');

const PayrollSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    month: {
      // YYYY-MM format
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}$/, 'Please provide a valid month (YYYY-MM)'],
    },
    status: {
      type: String,
      enum: ['DRAFT', 'CALCULATED', 'APPROVED', 'PROCESSING', 'PAID', 'CANCELLED'],
      default: 'CALCULATED',
    },
    salaryType: {
      type: String,
      enum: ['MONTHLY', 'DAILY', 'HOURLY'],
      default: 'MONTHLY',
    },
    perDaySalary: {
      type: Number,
      default: 0,
    },
    attendanceSummary: {
      totalCalendarDays: { type: Number, default: 30 },
      workingDays: { type: Number, default: 26 },
      presentDays: { type: Number, default: 0 },
      absentDays: { type: Number, default: 0 },
      halfDays: { type: Number, default: 0 },
      paidLeave: { type: Number, default: 0 },
      unpaidLeave: { type: Number, default: 0 },
      holidays: { type: Number, default: 0 },
      weekOffs: { type: Number, default: 0 },
      lateDays: { type: Number, default: 0 },
      regularWorkingHours: { type: Number, default: 8 },
      actualWorkingHours: { type: Number, default: 0 },
      overtimeHours: { type: Number, default: 0 },
    },
    earnings: {
      basic: { type: Number, default: 0 },
      hra: { type: Number, default: 0 },
      allowances: { type: Number, default: 0 },
      bonus: { type: Number, default: 0 },
      overtimeRate: { type: Number, default: 200 },
      overtimeAmount: { type: Number, default: 0 },
      otherEarnings: { type: Number, default: 0 },
      grossSalary: { type: Number, default: 0 },
    },
    deductions: {
      unpaidLeaveDeduction: { type: Number, default: 0 },
      halfDayDeduction: { type: Number, default: 0 },
      pf: { type: Number, default: 0 },
      esi: { type: Number, default: 0 },
      profTax: { type: Number, default: 0 },
      tds: { type: Number, default: 0 },
      otherDeductions: { type: Number, default: 0 },
      totalDeductions: { type: Number, default: 0 },
    },
    netSalary: {
      type: Number,
      default: 0,
      min: [0, 'Net salary cannot be negative'],
    },
    proRata: {
      isProRata: { type: Boolean, default: false },
      joiningDate: { type: Date },
      eligibleDays: { type: Number },
      notes: { type: String, default: '' },
    },
    payment: {
      paidAmount: { type: Number, default: 0 },
      paymentDate: { type: Date },
      paymentMethod: {
        type: String,
        enum: ['BANK_TRANSFER', 'CASH', 'UPI', 'CHEQUE', 'PENDING'],
        default: 'PENDING',
      },
      transactionId: { type: String, default: '' },
      paymentStatus: {
        type: String,
        enum: ['PENDING', 'PAID', 'FAILED'],
        default: 'PENDING',
      },
    },
    attendanceSnapshotHash: {
      type: String,
      default: '',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    auditLog: [
      {
        action: { type: String, required: true },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        performedByName: { type: String, default: '' },
        timestamp: { type: Date, default: Date.now },
        details: { type: String, default: '' },
        previousValue: { type: mongoose.Schema.Types.Mixed },
        newValue: { type: mongoose.Schema.Types.Mixed },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Unique constraint: one payroll record per employee per month
PayrollSchema.index({ userId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Payroll', PayrollSchema);

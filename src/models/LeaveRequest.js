const mongoose = require('mongoose');

const LeaveRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    employeeName: {
      type: String,
      required: true,
    },
    employeeId: {
      type: String,
      default: '',
    },
    leaveType: {
      type: String,
      enum: ['Casual Leave (CL)', 'Sick Leave (SL)', 'Privilege / Earned Leave (PL)', 'Unpaid Leave (LWP)', 'Compensatory Off (CO)'],
      default: 'Casual Leave (CL)',
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    daysCount: {
      type: Number,
      required: true,
      default: 1,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
      default: 'Pending',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedByName: {
      type: String,
      default: '',
    },
    approvalDate: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      default: '',
    },
    leaveBalance: {
      casual: { type: Number, default: 12 },
      sick: { type: Number, default: 7 },
      earned: { type: Number, default: 15 },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('LeaveRequest', LeaveRequestSchema);

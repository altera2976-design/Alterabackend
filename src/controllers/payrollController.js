const mongoose = require('mongoose');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Payroll = require('../models/Payroll');
const Setting = require('../models/Setting');
const {
  getPayrollConfig,
  calculateEmployeePayroll,
  generateAttendanceSignature,
} = require('../services/payrollService');
const { sendPayslipEmail } = require('../services/emailService');

/**
 * Format currency helper
 */
function formatINR(val) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val || 0);
}

/**
 * GET /api/payroll/calculate
 * Query: ?month=YYYY-MM&recalculate=true
 * Live calculation engine: computes or refreshes payroll for the selected month
 */
exports.calculatePayroll = async (req, res, next) => {
  try {
    const { month, recalculate } = req.query;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid month in YYYY-MM format (e.g. 2026-09).',
      });
    }

    const config = await getPayrollConfig();

    // Query active employees
    // Admin sees all employees; non-admin employee sees only self
    const query = { role: 'EMPLOYEE', status: 'ACTIVE' };
    if (req.user && req.user.role !== 'ADMIN') {
      query._id = req.user._id;
    }
    const employees = await User.find(query).sort({ name: 1 });

    const results = [];

    for (const emp of employees) {
      // Check if a saved Payroll record exists
      let savedRecord = await Payroll.findOne({ userId: emp._id, month });

      // If approved or paid and not explicitly forced by admin, check for change detection
      if (
        savedRecord &&
        (savedRecord.status === 'APPROVED' || savedRecord.status === 'PAID') &&
        recalculate !== 'true'
      ) {
        // Check if attendance records changed after approval
        const [yearStr, monthStr] = month.split('-');
        const year = parseInt(yearStr, 10);
        const monthNum = parseInt(monthStr, 10);
        const totalDays = new Date(year, monthNum, 0).getDate();
        const curAtts = await Attendance.find({
          userId: emp._id,
          date: { $gte: `${month}-01`, $lte: `${month}-${String(totalDays).padStart(2, '0')}` },
        }).lean();
        const curHash = generateAttendanceSignature(curAtts);

        const attendanceChangedAfterApproval =
          savedRecord.attendanceSnapshotHash && savedRecord.attendanceSnapshotHash !== curHash;

        const recordObj = savedRecord.toObject();
        recordObj.employee = {
          _id: emp._id,
          name: emp.name,
          email: emp.email,
          employeeId: emp.employeeId,
          department: emp.department,
          designation: emp.designation,
          salary: emp.salary,
        };
        recordObj.attendanceChangedAfterApproval = attendanceChangedAfterApproval;
        results.push(recordObj);
        continue;
      }

      // Calculate fresh payroll metrics
      const calculated = await calculateEmployeePayroll(emp, month, config);

      if (!savedRecord) {
        savedRecord = new Payroll({
          ...calculated,
          status: 'CALCULATED',
          auditLog: [
            {
              action: 'PAYROLL_CALCULATED',
              performedBy: req.user._id,
              performedByName: req.user.name,
              timestamp: new Date(),
              details: `Initial calculation for ${month}: Net ${formatINR(calculated.netSalary)}`,
            },
          ],
        });
      } else {
        // Update unapproved record or admin recalculation
        const prevNet = savedRecord.netSalary;
        savedRecord.salaryType = calculated.salaryType;
        savedRecord.perDaySalary = calculated.perDaySalary;
        savedRecord.attendanceSummary = calculated.attendanceSummary;
        savedRecord.earnings = calculated.earnings;
        savedRecord.deductions = calculated.deductions;
        savedRecord.netSalary = calculated.netSalary;
        savedRecord.proRata = calculated.proRata;
        savedRecord.attendanceSnapshotHash = calculated.attendanceSnapshotHash;

        if (recalculate === 'true' && savedRecord.status === 'APPROVED') {
          savedRecord.status = 'CALCULATED'; // Reset approval if explicitly recalculated
        }

        savedRecord.auditLog.push({
          action: 'PAYROLL_RECALCULATED',
          performedBy: req.user._id,
          performedByName: req.user.name,
          timestamp: new Date(),
          details: `Recalculated for ${month}. Previous Net: ${formatINR(prevNet)} -> New Net: ${formatINR(calculated.netSalary)}`,
          previousValue: prevNet,
          newValue: calculated.netSalary,
        });
      }

      await savedRecord.save();

      const recordObj = savedRecord.toObject();
      recordObj.employee = {
        _id: emp._id,
        name: emp.name,
        email: emp.email,
        employeeId: emp.employeeId,
        department: emp.department,
        designation: emp.designation,
        salary: emp.salary,
      };
      recordObj.attendanceChangedAfterApproval = false;
      results.push(recordObj);
    }

    // Summary KPIs
    const totalEmployees = results.length;
    const totalGrossSalary = results.reduce((acc, r) => acc + (r.earnings?.grossSalary || 0), 0);
    const totalDeductions = results.reduce((acc, r) => acc + (r.deductions?.totalDeductions || 0), 0);
    const totalNetSalary = results.reduce((acc, r) => acc + (r.netSalary || 0), 0);

    const statusCounts = {
      draft: results.filter(r => r.status === 'DRAFT').length,
      calculated: results.filter(r => r.status === 'CALCULATED').length,
      approved: results.filter(r => r.status === 'APPROVED').length,
      paid: results.filter(r => r.status === 'PAID').length,
    };

    res.status(200).json({
      success: true,
      month,
      summary: {
        totalEmployees,
        totalGrossSalary,
        totalDeductions,
        totalNetSalary,
        statusCounts,
      },
      payroll: results,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/payroll/employee/:id
 * Detailed salary breakdown for an employee
 */
exports.getEmployeeSalaryDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { month } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID.' });
    }

    // Authorization: Employee can only see their own salary
    if (req.user.role !== 'ADMIN' && req.user._id.toString() !== id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not authorized to view this salary breakdown.',
      });
    }

    const employee = await User.findById(id).select('-password');
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const selectedMonth = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    let payrollRecord = await Payroll.findOne({ userId: id, month: selectedMonth });

    // If not found, compute live
    if (!payrollRecord) {
      const config = await getPayrollConfig();
      const calculated = await calculateEmployeePayroll(employee, selectedMonth, config);
      payrollRecord = await Payroll.create({
        ...calculated,
        status: 'CALCULATED',
      });
    }

    res.status(200).json({
      success: true,
      month: selectedMonth,
      employee,
      payroll: payrollRecord,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/payroll/approve
 * Approve payroll for a month (locks historical record)
 */
exports.approvePayroll = async (req, res, next) => {
  try {
    const { month, employeeIds } = req.body;

    if (!month) {
      return res.status(400).json({ success: false, message: 'Month is required.' });
    }

    const filter = { month };
    if (Array.isArray(employeeIds) && employeeIds.length > 0) {
      filter.userId = { $in: employeeIds };
    }

    const records = await Payroll.find(filter);

    for (const record of records) {
      record.status = 'APPROVED';
      record.approvedBy = req.user._id;
      record.approvedAt = new Date();
      record.auditLog.push({
        action: 'PAYROLL_APPROVED',
        performedBy: req.user._id,
        performedByName: req.user.name,
        timestamp: new Date(),
        details: `Approved payroll for ${month} by ${req.user.name}`,
      });
      await record.save();
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('payroll_approved', {
        month,
        approvedBy: req.user.name,
        count: records.length,
      });
    }

    res.status(200).json({
      success: true,
      message: `Successfully approved payroll for ${records.length} employee(s).`,
      count: records.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/payroll/pay
 * Mark salary as paid with payment details
 */
exports.markPayrollPaid = async (req, res, next) => {
  try {
    const { payrollId, paymentMethod = 'BANK_TRANSFER', transactionId, paidAmount, paymentDate } = req.body;

    if (!payrollId || !mongoose.Types.ObjectId.isValid(payrollId)) {
      return res.status(400).json({ success: false, message: 'Valid payrollId is required.' });
    }

    const payroll = await Payroll.findById(payrollId).populate('userId', 'name email employeeId');
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll record not found.' });
    }

    const amount = paidAmount !== undefined ? Number(paidAmount) : payroll.netSalary;

    payroll.status = 'PAID';
    payroll.payment = {
      paidAmount: amount,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      paymentMethod,
      transactionId: transactionId || `TXN-${Date.now()}`,
      paymentStatus: 'PAID',
    };
    payroll.paidBy = req.user._id;

    payroll.auditLog.push({
      action: 'SALARY_PAID',
      performedBy: req.user._id,
      performedByName: req.user.name,
      timestamp: new Date(),
      details: `Paid ${formatINR(amount)} via ${paymentMethod}. Ref: ${payroll.payment.transactionId}`,
      newValue: payroll.payment,
    });

    await payroll.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('salary_paid', {
        payrollId: payroll._id,
        employeeName: payroll.userId?.name,
        amount,
        paymentMethod,
      });
    }

    res.status(200).json({
      success: true,
      message: `Salary marked as paid for ${payroll.userId?.name || 'Employee'}.`,
      payroll,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/payroll/send-payslip
 * Send payslip PDF via email
 */
exports.sendPayslip = async (req, res, next) => {
  try {
    const { payrollId, recipientEmail, subject, message, pdfBase64 } = req.body;

    if (!payrollId || !mongoose.Types.ObjectId.isValid(payrollId)) {
      return res.status(400).json({ success: false, message: 'Valid payrollId is required.' });
    }

    const payroll = await Payroll.findById(payrollId).populate('userId', 'name email employeeId department designation');
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll record not found.' });
    }

    // Permission check
    if (req.user.role !== 'ADMIN' && req.user._id.toString() !== payroll.userId?._id?.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to send this payslip.' });
    }

    const targetEmail = recipientEmail || payroll.userId?.email;
    if (!targetEmail) {
      return res.status(400).json({ success: false, message: 'Recipient email address is required.' });
    }

    if (!pdfBase64) {
      return res.status(400).json({ success: false, message: 'Payslip PDF data is required.' });
    }

    const filename = `Payslip_${payroll.userId?.name?.replace(/\s+/g, '_')}_${payroll.month}.pdf`;

    const emailResult = await sendPayslipEmail({
      to: targetEmail,
      employeeName: payroll.userId?.name || 'Employee',
      employeeId: payroll.userId?.employeeId || '—',
      month: payroll.month,
      netSalary: payroll.netSalary,
      customMessage: message,
      attachments: [
        {
          filename,
          content: pdfBase64,
          encoding: 'base64',
          contentType: 'application/pdf',
        },
      ],
    });

    payroll.auditLog.push({
      action: 'PAYSLIP_SENT',
      performedBy: req.user._id,
      performedByName: req.user.name,
      timestamp: new Date(),
      details: `Payslip for ${payroll.month} dispatched to ${targetEmail}`,
    });
    await payroll.save();

    res.status(200).json({
      success: true,
      message: `Payslip successfully sent to ${targetEmail}.`,
      previewUrl: emailResult.previewUrl,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/payroll/config
 */
exports.getPayrollConfigHandler = async (req, res, next) => {
  try {
    const config = await getPayrollConfig();
    res.status(200).json({ success: true, data: config });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/payroll/config
 * Update payroll rules & holidays (Admin only)
 */
exports.updatePayrollConfigHandler = async (req, res, next) => {
  try {
    const {
      standardWorkingHours,
      workingDaysPerWeek,
      weekOffDays,
      holidays,
      calculationMethod,
      defaultOvertimeRatePerHour,
      halfDaySalaryRatio,
      deductionRules,
    } = req.body;

    const currentConfig = await getPayrollConfig();

    const updatedValue = {
      ...currentConfig,
      ...(standardWorkingHours !== undefined ? { standardWorkingHours: Number(standardWorkingHours) } : {}),
      ...(workingDaysPerWeek !== undefined ? { workingDaysPerWeek: Number(workingDaysPerWeek) } : {}),
      ...(weekOffDays !== undefined ? { weekOffDays } : {}),
      ...(holidays !== undefined ? { holidays } : {}),
      ...(calculationMethod !== undefined ? { calculationMethod } : {}),
      ...(defaultOvertimeRatePerHour !== undefined ? { defaultOvertimeRatePerHour: Number(defaultOvertimeRatePerHour) } : {}),
      ...(halfDaySalaryRatio !== undefined ? { halfDaySalaryRatio: Number(halfDaySalaryRatio) } : {}),
      ...(deductionRules !== undefined ? { deductionRules: { ...currentConfig.deductionRules, ...deductionRules } } : {}),
    };

    const setting = await Setting.findOneAndUpdate(
      { key: 'PAYROLL_CONFIG' },
      { value: updatedValue, description: 'Payroll calculation rules, holidays, and statutory deductions' },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Payroll configuration updated successfully.',
      data: setting.value,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/payroll/employee-salary/:id
 * Update individual employee salary and structure (Admin only)
 */
exports.updateEmployeeSalaryStructure = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { salary, salaryType, salaryStructure } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID.' });
    }

    const employee = await User.findById(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    if (salary !== undefined) employee.salary = Number(salary);
    if (salaryType !== undefined) employee.salaryType = salaryType;
    if (salaryStructure !== undefined) {
      employee.salaryStructure = {
        ...employee.salaryStructure,
        ...salaryStructure,
      };
    }

    await employee.save();

    res.status(200).json({
      success: true,
      message: `Salary structure updated for ${employee.name}.`,
      employee: {
        _id: employee._id,
        name: employee.name,
        salary: employee.salary,
        salaryType: employee.salaryType,
        salaryStructure: employee.salaryStructure,
      },
    });
  } catch (error) {
    next(error);
  }
};

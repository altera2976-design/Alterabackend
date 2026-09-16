const crypto = require('crypto');
const Setting = require('../models/Setting');
const Attendance = require('../models/Attendance');
const User = require('../models/User');

const DEFAULT_CONFIG = {
  standardWorkingHours: 8,
  workingDaysPerWeek: 6, // Mon-Sat
  weekOffDays: [0], // Sunday is 0
  holidays: [
    { date: '2026-01-26', name: 'Republic Day' },
    { date: '2026-08-15', name: 'Independence Day' },
    { date: '2026-10-02', name: 'Gandhi Jayanti' },
    { date: '2026-11-08', name: 'Diwali' },
    { date: '2026-12-25', name: 'Christmas' },
  ],
  calculationMethod: 'CALENDAR_DAYS', // 'CALENDAR_DAYS' or 'WORKING_DAYS'
  defaultOvertimeRatePerHour: 200,
  halfDaySalaryRatio: 0.5,
  deductionRules: {
    pfPercentage: 12, // 12% of basic
    esiPercentage: 0.75, // 0.75% of gross
    profTaxFixed: 200, // Monthly PT
    tdsDefaultPercentage: 0,
  },
};

/**
 * Fetch or initialize payroll configuration
 */
async function getPayrollConfig() {
  let setting = await Setting.findOne({ key: 'PAYROLL_CONFIG' });
  if (!setting) {
    setting = await Setting.create({
      key: 'PAYROLL_CONFIG',
      value: DEFAULT_CONFIG,
      description: 'Payroll calculation rules, holidays, and statutory deductions',
    });
  }
  return { ...DEFAULT_CONFIG, ...(setting.value || {}) };
}

/**
 * Analyze calendar month for days, week-offs, and holidays
 */
function analyzeMonthCalendar(year, monthNum, config) {
  const totalCalendarDays = new Date(year, monthNum, 0).getDate();
  const weekOffDays = config.weekOffDays || [0];
  const configuredHolidays = config.holidays || [];

  let weekOffCount = 0;
  let holidayCount = 0;

  for (let day = 1; day <= totalCalendarDays; day++) {
    const d = new Date(year, monthNum - 1, day);
    const dayOfWeek = d.getDay();
    const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const isHoliday = configuredHolidays.some(h => h.date === dateStr);
    const isWeekOff = weekOffDays.includes(dayOfWeek);

    if (isWeekOff) {
      weekOffCount++;
    } else if (isHoliday) {
      holidayCount++;
    }
  }

  const workingDays = Math.max(1, totalCalendarDays - weekOffCount - holidayCount);

  return {
    totalCalendarDays,
    workingDays,
    weekOffs: weekOffCount,
    holidays: holidayCount,
  };
}

/**
 * Generate attendance snapshot signature to detect modifications post-approval
 */
function generateAttendanceSignature(attendances) {
  const sorted = [...attendances].sort((a, b) => (a.date > b.date ? 1 : -1));
  const summaryStr = sorted
    .map(a => `${a.date}:${a.status}:${a.totalHours || 0}:${a.checkInTime ? 1 : 0}`)
    .join('|');
  return crypto.createHash('sha1').update(summaryStr).digest('hex');
}

/**
 * Calculate full payroll breakdown for an individual employee
 */
async function calculateEmployeePayroll(emp, month, config) {
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  const calendar = analyzeMonthCalendar(year, monthNum, config);
  const totalCalendarDays = calendar.totalCalendarDays;
  const standardWorkingHours = emp.workingHours || config.standardWorkingHours || 8;

  // ── Pro-Rata Handling (Mid-month Joining) ──────────────────────────────────
  let isProRata = false;
  let eligibleDays = totalCalendarDays;
  let proRataNotes = '';

  if (emp.joiningDate) {
    const jDate = new Date(emp.joiningDate);
    const jYear = jDate.getFullYear();
    const jMonth = jDate.getMonth() + 1;
    const jDay = jDate.getDate();

    if (jYear === year && jMonth === monthNum && jDay > 1) {
      isProRata = true;
      eligibleDays = totalCalendarDays - jDay + 1;
      proRataNotes = `Joined on ${jDay}/${monthNum}/${year} (eligible for ${eligibleDays} of ${totalCalendarDays} days)`;
    } else if (jYear > year || (jYear === year && jMonth > monthNum)) {
      // Not yet joined in this month
      eligibleDays = 0;
      isProRata = true;
      proRataNotes = `Not yet joined in ${month}`;
    }
  }

  const proRataFactor = totalCalendarDays > 0 ? eligibleDays / totalCalendarDays : 1;

  // ── Attendance Records Fetching ───────────────────────────────────────────
  const startDate = `${month}-01`;
  const endDate = `${month}-${String(totalCalendarDays).padStart(2, '0')}`;

  const attendances = await Attendance.find({
    userId: emp._id,
    date: { $gte: startDate, $lte: endDate },
  }).lean();

  const snapshotHash = generateAttendanceSignature(attendances);

  // ── Attendance Metrics Aggregation ────────────────────────────────────────
  let presentDays = 0;
  let lateDays = 0;
  let halfDays = 0;
  let paidLeave = 0;
  let unpaidLeave = 0;
  let absentDays = 0;
  let totalActualWorkingHours = 0;
  let totalOvertimeHours = 0;

  attendances.forEach(att => {
    // Overtime from check-in/out
    let workedHours = att.totalHours || 0;
    if (!workedHours && att.checkInTime && att.checkOutTime) {
      const ms = new Date(att.checkOutTime).getTime() - new Date(att.checkInTime).getTime();
      workedHours = Math.round((ms / (1000 * 60 * 60)) * 10) / 10;
    }
    totalActualWorkingHours += workedHours;

    if (workedHours > standardWorkingHours) {
      totalOvertimeHours += Math.round((workedHours - standardWorkingHours) * 10) / 10;
    }

    switch (att.status) {
      case 'PRESENT':
        presentDays++;
        break;
      case 'LATE':
        lateDays++;
        presentDays++; // Count late arrival as present
        break;
      case 'HALF_DAY':
        halfDays++;
        break;
      case 'LEAVE':
        if (att.leaveType === 'UNPAID') {
          unpaidLeave++;
        } else {
          paidLeave++;
        }
        break;
      case 'ABSENT':
        absentDays++;
        unpaidLeave++; // Unapproved absence counts as unpaid
        break;
      default:
        break;
    }
  });

  // ── Salary Components Resolution ──────────────────────────────────────────
  const monthlySalary = emp.salary || 0;
  const struct = emp.salaryStructure || {};

  let basic = struct.basic || Math.round(monthlySalary * 0.5);
  let hra = struct.hra || Math.round(monthlySalary * 0.25);
  let allowances = struct.allowances || Math.round(monthlySalary * 0.25);
  let bonus = struct.bonus || 0;
  let otherEarnings = struct.otherEarnings || 0;
  let overtimeRate = struct.overtimeRate || config.defaultOvertimeRatePerHour || 200;

  // Apply pro-rata scaling to fixed monthly base earnings if mid-month joining
  if (isProRata && eligibleDays < totalCalendarDays) {
    basic = Math.round(basic * proRataFactor);
    hra = Math.round(hra * proRataFactor);
    allowances = Math.round(allowances * proRataFactor);
  }

  // ── Per-Day Salary & Attendance Deductions ─────────────────────────────────
  const baseMonthlyPay = basic + hra + allowances;
  const divisor =
    config.calculationMethod === 'WORKING_DAYS'
      ? calendar.workingDays
      : calendar.totalCalendarDays;
  const perDaySalary = divisor > 0 ? baseMonthlyPay / divisor : 0;

  const unpaidLeaveDeduction = Math.round(unpaidLeave * perDaySalary);
  const halfDayDeduction = Math.round(halfDays * (config.halfDaySalaryRatio || 0.5) * perDaySalary);

  // ── Overtime Earnings ─────────────────────────────────────────────────────
  const overtimeAmount = Math.round(totalOvertimeHours * overtimeRate);

  // ── Gross Salary ──────────────────────────────────────────────────────────
  const grossSalary = Math.max(
    0,
    basic + hra + allowances + bonus + overtimeAmount + otherEarnings
  );

  // ── Statutory Deductions ──────────────────────────────────────────────────
  const deductionRules = config.deductionRules || DEFAULT_CONFIG.deductionRules;
  const pf = struct.pfDeduction
    ? struct.pfDeduction
    : Math.round(basic * ((deductionRules.pfPercentage || 0) / 100));

  // ESI standard threshold check (applicable if gross <= ₹21,000 in India)
  const esi = struct.esiDeduction
    ? struct.esiDeduction
    : grossSalary <= 21000
    ? Math.round(grossSalary * ((deductionRules.esiPercentage || 0) / 100))
    : 0;

  const profTax = struct.profTax !== undefined ? struct.profTax : (deductionRules.profTaxFixed || 0);
  const tds = struct.tds || 0;
  const otherDeductions = struct.otherDeductions || 0;

  const totalDeductions =
    unpaidLeaveDeduction +
    halfDayDeduction +
    pf +
    esi +
    profTax +
    tds +
    otherDeductions;

  // ── Net Salary ────────────────────────────────────────────────────────────
  const netSalary = Math.max(0, grossSalary - totalDeductions);

  return {
    userId: emp._id,
    month,
    salaryType: emp.salaryType || 'MONTHLY',
    perDaySalary: Math.round(perDaySalary),
    attendanceSummary: {
      totalCalendarDays,
      workingDays: calendar.workingDays,
      presentDays,
      absentDays,
      halfDays,
      paidLeave,
      unpaidLeave,
      holidays: calendar.holidays,
      weekOffs: calendar.weekOffs,
      lateDays,
      regularWorkingHours: standardWorkingHours,
      actualWorkingHours: Math.round(totalActualWorkingHours * 10) / 10,
      overtimeHours: Math.round(totalOvertimeHours * 10) / 10,
    },
    earnings: {
      basic,
      hra,
      allowances,
      bonus,
      overtimeRate,
      overtimeAmount,
      otherEarnings,
      grossSalary,
    },
    deductions: {
      unpaidLeaveDeduction,
      halfDayDeduction,
      pf,
      esi,
      profTax,
      tds,
      otherDeductions,
      totalDeductions,
    },
    netSalary,
    proRata: {
      isProRata,
      joiningDate: emp.joiningDate,
      eligibleDays,
      notes: proRataNotes,
    },
    attendanceSnapshotHash: snapshotHash,
  };
}

module.exports = {
  getPayrollConfig,
  analyzeMonthCalendar,
  calculateEmployeePayroll,
  generateAttendanceSignature,
  DEFAULT_CONFIG,
};

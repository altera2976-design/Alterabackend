const Project = require('../models/Project');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Client = require('../models/Client');
const Trip = require('../models/Trip');
const Payroll = require('../models/Payroll');
const Lead = require('../models/Lead');
const Quotation = require('../models/Quotation');
const Invoice = require('../models/Invoice');
const Expense = require('../models/Expense');
const VendorPayment = require('../models/VendorPayment');
const { sendReportEmail } = require('../services/emailService');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Helper to compute date boundaries for query
 */
function resolveDateRange(query) {
  const { startDate, endDate, month, year } = query;

  let start, end;
  let periodLabel = '';

  if (month && year) {
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    end = new Date(y, m, 0, 23, 59, 59, 999);
    periodLabel = `${MONTH_NAMES[m - 1]} ${y}`;
  } else if (startDate && endDate) {
    start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    periodLabel = `${start.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })} - ${end.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } else {
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    periodLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  }

  // Previous period of equal duration for comparison
  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);

  return { start, end, prevStart, prevEnd, periodLabel };
}

/**
 * GET /api/reports
 * Summary dashboard metrics with period comparison and trend bars
 */
exports.getReportData = async (req, res, next) => {
  try {
    const { start, end, prevStart, prevEnd, periodLabel } = resolveDateRange(req.query);

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    const prevStartStr = prevStart.toISOString().split('T')[0];
    const prevEndStr = prevEnd.toISOString().split('T')[0];

    // Current period projects
    const currentProjects = await Project.find({
      $or: [
        { createdAt: { $gte: start, $lte: end } },
        { startDate: new RegExp(periodLabel, 'i') }
      ]
    });
    const totalRevenue = currentProjects.reduce((acc, p) => acc + (p.value || 0), 0);

    // Previous period projects for comparison
    const prevProjects = await Project.find({
      $or: [
        { createdAt: { $gte: prevStart, $lte: prevEnd } }
      ]
    });
    const previousRevenue = prevProjects.reduce((acc, p) => acc + (p.value || 0), 0);

    // Percentage comparison calculation
    let revenueChangePercent = 0;
    let revenueChangeText = 'Same as last period';
    if (previousRevenue > 0) {
      revenueChangePercent = Math.round(((totalRevenue - previousRevenue) / previousRevenue) * 100);
      revenueChangeText = revenueChangePercent >= 0
        ? `+${revenueChangePercent}% from last period`
        : `${revenueChangePercent}% from last period`;
    } else if (totalRevenue > 0) {
      revenueChangePercent = 100;
      revenueChangeText = `+100% (New period revenue)`;
    }

    // Counts
    const projectsCount = await Project.countDocuments({
      $or: [
        { createdAt: { $gte: start, $lte: end } },
        { startDate: new RegExp(periodLabel, 'i') }
      ]
    });

    const salesCount = await Client.countDocuments({
      createdAt: { $gte: start, $lte: end },
      type: 'Client'
    });

    const totalEmployeesCount = await User.countDocuments({ role: 'EMPLOYEE', status: 'ACTIVE' });

    const attendanceCount = await Attendance.countDocuments({
      $or: [
        { date: { $gte: startStr, $lte: endStr } },
        { createdAt: { $gte: start, $lte: end } }
      ],
      status: 'PRESENT'
    });

    // Expenses and Payments
    const tripsInPeriod = await Trip.find({
      $or: [
        { date: { $gte: start, $lte: end } },
        { createdAt: { $gte: start, $lte: end } }
      ],
      status: 'COMPLETED'
    });
    const totalBikeExpense = tripsInPeriod.reduce((acc, t) => acc + (t.totalExpense || 0), 0);
    const paymentsCount = projectsCount + tripsInPeriod.length;

    // Mini chart distribution bars (4 weekly blocks)
    const quarterMs = (end.getTime() - start.getTime()) / 4;
    const trendBars = [];
    for (let i = 0; i < 4; i++) {
      const qStart = new Date(start.getTime() + i * quarterMs);
      const qEnd = new Date(start.getTime() + (i + 1) * quarterMs);
      const qProjects = currentProjects.filter(p => {
        const d = new Date(p.createdAt);
        return d >= qStart && d <= qEnd;
      });
      const qVal = qProjects.reduce((sum, p) => sum + (p.value || 0), 0);
      trendBars.push(qVal);
    }

    // Normalize trend bar heights between 15 and 50 px
    const maxBarVal = Math.max(...trendBars, 1);
    const normalizedBars = trendBars.map(val => {
      if (totalRevenue === 0) return 20;
      return Math.max(15, Math.round((val / maxBarVal) * 50));
    });

    res.status(200).json({
      success: true,
      period: {
        label: periodLabel,
        start,
        end,
      },
      data: {
        totalRevenue,
        previousRevenue,
        revenueChangePercent,
        revenueChangeText,
        trendBars: normalizedBars,
        projects: projectsCount,
        sales: salesCount,
        employees: totalEmployeesCount,
        attendance: attendanceCount,
        payments: paymentsCount,
        totalBikeExpense,
        netIncome: totalRevenue - totalBikeExpense,
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reports/details
 * Detailed records and KPI summaries for each report type
 */
exports.getDetailedReport = async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    const { type = 'project', search, status } = req.query;
    const { start, end, periodLabel } = resolveDateRange(req.query);

    // Reject non-admin access to company-wide sales and payment reports
    if (!isAdmin && ['sales', 'payment'].includes(type.toLowerCase())) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Admins can view financial and sales reports.',
      });
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    let data = [];
    let summary = {};

    switch (type.toLowerCase()) {
      // ─────────────────────────────────────────────────────────────
      // 1. PROJECT REPORT
      // ─────────────────────────────────────────────────────────────
      case 'project': {
        const query = {
          $or: [
            { createdAt: { $gte: start, $lte: end } },
            { startDate: new RegExp(periodLabel, 'i') }
          ]
        };

        if (!isAdmin) {
          query.$and = [
            {
              $or: [
                { 'assignedTeam.userId': req.user._id },
                { 'projectManager.userId': req.user._id },
              ],
            },
          ];
        }

        if (status && status !== 'All') {
          query.status = status;
        }

        if (search && search.trim()) {
          const sRegex = new RegExp(search.trim(), 'i');
          query.$and = query.$and || [];
          query.$and.push({
            $or: [{ name: sRegex }, { client: sRegex }, { assignedTeam: sRegex }]
          });
        }

        // If no records in specific period, fallback to all projects for user utility
        const fallbackQuery = !isAdmin
          ? {
              $or: [
                { 'assignedTeam.userId': req.user._id },
                { 'projectManager.userId': req.user._id },
              ],
            }
          : {};
        let projects = await Project.find(query).sort({ createdAt: -1 });
        if (projects.length === 0 && !search && (!status || status === 'All')) {
          projects = await Project.find(fallbackQuery).sort({ createdAt: -1 });
        }

        const totalBudget = projects.reduce((acc, p) => acc + (p.value || 0), 0);
        const completedCount = projects.filter(p => p.status === 'Completed').length;
        const inProgressCount = projects.filter(p => p.status === 'In Progress').length;
        const planningCount = projects.filter(p => p.status === 'Planning').length;
        const avgProgress = projects.length > 0
          ? Math.round(projects.reduce((acc, p) => acc + (p.progress || 0), 0) / projects.length)
          : 0;

        summary = {
          totalProjects: projects.length,
          totalBudget: isAdmin ? totalBudget : 0,
          completedCount,
          inProgressCount,
          planningCount,
          avgProgress,
        };

        data = projects.map(p => ({
          _id: p._id,
          id: p.projectId || p._id,
          name: p.name,
          client: p.client,
          status: p.status,
          startDate: p.startDate || p.createdAt.toLocaleDateString('en-IN'),
          deadline: p.deadline || 'Ongoing',
          budget: isAdmin ? (p.value || 0) : 0,
          revenue: isAdmin ? (p.value || 0) : 0,
          expenses: isAdmin ? Math.round((p.value || 0) * 0.35) : 0,
          profit: isAdmin ? Math.round((p.value || 0) * 0.65) : 0,
          progress: p.progress || 0,
          tasks: p.tasks || 0,
          assignedTeam: p.assignedTeam || 'Unassigned',
        }));
        break;
      }

      // ─────────────────────────────────────────────────────────────
      // 2. SALES REPORT
      // ─────────────────────────────────────────────────────────────
      case 'sales': {
        const query = {
          createdAt: { $gte: start, $lte: end }
        };

        if (status && status !== 'All') {
          query.status = status;
        }

        if (search && search.trim()) {
          const sRegex = new RegExp(search.trim(), 'i');
          query.$and = [{
            $or: [{ name: sRegex }, { company: sRegex }, { email: sRegex }, { phone: sRegex }]
          }];
        }

        let clients = await Client.find(query).sort({ createdAt: -1 });
        if (clients.length === 0 && !search && (!status || status === 'All')) {
          clients = await Client.find().sort({ createdAt: -1 });
        }

        const clientsCount = clients.filter(c => c.type === 'Client').length;
        const leadsCount = clients.filter(c => c.type === 'Lead').length;
        const convertedRate = clients.length > 0
          ? Math.round((clientsCount / clients.length) * 100)
          : 0;

        // Associate with project values if client name matches
        const allProjects = await Project.find();
        const clientValuesMap = {};
        allProjects.forEach(p => {
          clientValuesMap[p.client] = (clientValuesMap[p.client] || 0) + (p.value || 0);
        });

        const totalPipelineValue = clients.reduce((acc, c) => acc + (clientValuesMap[c.name] || 0), 0);

        summary = {
          totalEntries: clients.length,
          clientsCount,
          leadsCount,
          conversionRate: `${convertedRate}%`,
          totalPipelineValue,
        };

        data = clients.map(c => ({
          _id: c._id,
          name: c.name,
          company: c.company || 'Individual',
          phone: c.phone || '—',
          email: c.email || '—',
          type: c.type || 'Lead',
          status: c.status || 'New',
          latestActivity: c.latestActivity || 'Contacted',
          date: c.createdAt ? c.createdAt.toLocaleDateString('en-IN') : '—',
          orderValue: clientValuesMap[c.name] || 0,
        }));
        break;
      }

      // ─────────────────────────────────────────────────────────────
      // 3. EMPLOYEE REPORT
      // ─────────────────────────────────────────────────────────────
      case 'employee': {
        const query = { role: 'EMPLOYEE' };

        if (!isAdmin) {
          query._id = req.user._id;
        }

        if (status && status !== 'All') {
          query.status = status.toUpperCase();
        }

        if (search && search.trim()) {
          const sRegex = new RegExp(search.trim(), 'i');
          query.$and = [{
            $or: [
              { name: sRegex },
              { email: sRegex },
              { employeeId: sRegex },
              { department: sRegex },
              { designation: sRegex }
            ]
          }];
        }

        const employees = await User.find(query).select('-password').sort({ createdAt: -1 });

        // Retrieve attendance records for all employees in period
        const periodAttendance = await Attendance.find({
          $or: [
            { date: { $gte: startStr, $lte: endStr } },
            { createdAt: { $gte: start, $lte: end } }
          ]
        });

        const attByEmployee = {};
        periodAttendance.forEach(a => {
          const uId = a.userId ? a.userId.toString() : '';
          if (!attByEmployee[uId]) {
            attByEmployee[uId] = { present: 0, late: 0, leave: 0, absent: 0 };
          }
          const s = (a.status || 'PRESENT').toUpperCase();
          if (s === 'PRESENT') attByEmployee[uId].present += 1;
          else if (s === 'LATE') attByEmployee[uId].late += 1;
          else if (s === 'LEAVE' || s === 'HALF_DAY') attByEmployee[uId].leave += 1;
          else attByEmployee[uId].absent += 1;
        });

        const departmentsSet = new Set(employees.map(e => e.department).filter(Boolean));
        const totalSalary = employees.reduce((acc, e) => acc + (e.salary || 0), 0);
        const activeCount = employees.filter(e => e.status === 'ACTIVE').length;

        summary = {
          totalEmployees: employees.length,
          activeEmployees: activeCount,
          departmentsCount: departmentsSet.size || 1,
          totalMonthlySalary: totalSalary,
        };

        data = employees.map(e => {
          const stats = attByEmployee[e._id.toString()] || { present: 0, late: 0, leave: 0, absent: 0 };
          return {
            _id: e._id,
            name: e.name,
            employeeId: e.employeeId || '—',
            email: e.email,
            phone: e.phone || '—',
            department: e.department || 'General',
            designation: e.designation || 'Staff',
            status: e.status || 'ACTIVE',
            salary: e.salary || 0,
            workingHours: e.workingHours || 8,
            joiningDate: e.joiningDate ? new Date(e.joiningDate).toLocaleDateString('en-IN') : '—',
            presentDays: stats.present,
            lateDays: stats.late,
            leaveDays: stats.leave,
            absentDays: stats.absent,
          };
        });
        break;
      }

      // ─────────────────────────────────────────────────────────────
      // 4. ATTENDANCE REPORT
      // ─────────────────────────────────────────────────────────────
      case 'attendance': {
        const query = {
          $or: [
            { date: { $gte: startStr, $lte: endStr } },
            { createdAt: { $gte: start, $lte: end } }
          ]
        };

        if (!isAdmin) {
          query.userId = req.user._id;
        }

        if (status && status !== 'All') {
          query.status = status.toUpperCase();
        }

        let attendanceRecords = await Attendance.find(query)
          .populate('userId', 'name employeeId department designation')
          .sort({ date: -1, createdAt: -1 });

        // Fallback to all recent if empty
        const fallbackAttQuery = !isAdmin ? { userId: req.user._id } : {};
        if (attendanceRecords.length === 0 && (!status || status === 'All')) {
          attendanceRecords = await Attendance.find(fallbackAttQuery)
            .populate('userId', 'name employeeId department designation')
            .sort({ date: -1 })
            .limit(30);
        }

        // Search filter
        if (search && search.trim()) {
          const s = search.toLowerCase();
          attendanceRecords = attendanceRecords.filter(r => {
            const userName = (r.userId?.name || '').toLowerCase();
            const empId = (r.userId?.employeeId || '').toLowerCase();
            const dateStr = (r.date || '').toLowerCase();
            return userName.includes(s) || empId.includes(s) || dateStr.includes(s);
          });
        }

        const presentCount = attendanceRecords.filter(r => r.status === 'PRESENT').length;
        const lateCount = attendanceRecords.filter(r => r.status === 'LATE').length;
        const leaveCount = attendanceRecords.filter(r => ['LEAVE', 'HALF_DAY'].includes(r.status)).length;
        const absentCount = attendanceRecords.filter(r => r.status === 'ABSENT').length;
        const totalRecords = attendanceRecords.length;
        const attendanceRate = totalRecords > 0
          ? Math.round(((presentCount + lateCount) / totalRecords) * 100)
          : 0;

        summary = {
          totalRecords,
          presentCount,
          lateCount,
          leaveCount,
          absentCount,
          attendanceRate: `${attendanceRate}%`,
        };

        data = attendanceRecords.map(r => ({
          _id: r._id,
          date: r.date || (r.createdAt ? r.createdAt.toLocaleDateString('en-IN') : '—'),
          employeeName: r.userId?.name || 'Employee',
          employeeId: r.userId?.employeeId || '—',
          department: r.userId?.department || '—',
          status: r.status || 'PRESENT',
          checkIn: r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—',
          checkOut: r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—',
          location: r.checkInLocation?.address || r.userLocation?.address || (r.distance ? `${r.distance}m from office` : 'Office'),
          verificationStatus: r.verificationStatus || 'REVIEW_REQUIRED',
          livenessStatus: r.livenessStatus || 'NOT_AVAILABLE',
          geofenceStatus: r.geofenceStatus || 'INSIDE',
          checkInSelfie: r.checkInSelfie || null,
          checkOutSelfie: r.checkOutSelfie || null,
          totalHours: r.totalHours || (r.checkInTime && r.checkOutTime ? Math.round(((new Date(r.checkOutTime) - new Date(r.checkInTime)) / 3600000) * 10) / 10 : 0),
        }));
        break;
      }

      // ─────────────────────────────────────────────────────────────
      // 5. PAYMENT & EXPENSE REPORT
      // ─────────────────────────────────────────────────────────────
      case 'payment': {
        const trips = await Trip.find({
          $or: [
            { date: { $gte: start, $lte: end } },
            { createdAt: { $gte: start, $lte: end } }
          ],
          status: 'COMPLETED'
        }).populate('employee', 'name employeeId').sort({ createdAt: -1 });

        const projects = await Project.find({
          $or: [
            { createdAt: { $gte: start, $lte: end } },
            { startDate: new RegExp(periodLabel, 'i') }
          ]
        }).sort({ createdAt: -1 });

        let projList = projects;
        let tripList = trips;

        if (projects.length === 0 && trips.length === 0) {
          projList = await Project.find().sort({ createdAt: -1 }).limit(10);
          tripList = await Trip.find().populate('employee', 'name employeeId').sort({ createdAt: -1 }).limit(10);
        }

        const projPayments = projList.map(p => ({
          _id: p._id,
          referenceId: `PAY-${p.projectId || String(p._id).slice(-5).toUpperCase()}`,
          title: `${p.name} - Advance / Milestone`,
          party: p.client || 'Client',
          type: 'Income',
          amount: p.value || 0,
          date: p.createdAt ? p.createdAt.toLocaleDateString('en-IN') : (p.startDate || '—'),
          status: 'Paid',
          paymentMethod: 'Bank Transfer / NEFT',
        }));

        const tripExpenses = tripList.map(t => ({
          _id: t._id,
          referenceId: `EXP-TRIP-${String(t._id).slice(-5).toUpperCase()}`,
          title: `Bike Travel Reimbursement (${(t.totalKm || 0).toFixed(1)} KM)`,
          party: t.employee?.name || 'Employee',
          type: 'Expense',
          amount: -(t.totalExpense || 0),
          date: t.date ? new Date(t.date).toLocaleDateString('en-IN') : '—',
          status: 'Settled',
          paymentMethod: 'Direct Reimbursement',
        }));

        let combined = [...projPayments, ...tripExpenses];

        if (status && status !== 'All') {
          combined = combined.filter(item => item.type === status || item.status === status);
        }

        if (search && search.trim()) {
          const s = search.toLowerCase();
          combined = combined.filter(item =>
            item.title.toLowerCase().includes(s) ||
            item.party.toLowerCase().includes(s) ||
            item.referenceId.toLowerCase().includes(s)
          );
        }

        const totalInflow = projPayments.reduce((sum, p) => sum + p.amount, 0);
        const totalOutflow = Math.abs(tripExpenses.reduce((sum, e) => sum + e.amount, 0));
        const netCashFlow = totalInflow - totalOutflow;

        summary = {
          totalTransactions: combined.length,
          totalInflow,
          totalOutflow,
          netCashFlow,
          inflowCount: projPayments.length,
          outflowCount: tripExpenses.length,
        };

        data = combined;
        break;
      }

      // ─────────────────────────────────────────────────────────────
      // 6. PAYROLL / SALARY REPORT
      // ─────────────────────────────────────────────────────────────
      case 'payroll':
      case 'salary': {
        const monthQuery = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
        const payrollRecords = await Payroll.find({ month: monthQuery })
          .populate('userId', 'name employeeId department designation email')
          .sort({ 'earnings.grossSalary': -1 });

        let filtered = payrollRecords;
        if (status && status !== 'All') {
          filtered = filtered.filter(p => p.status === status.toUpperCase() || p.payment?.paymentStatus === status.toUpperCase());
        }

        if (search && search.trim()) {
          const s = search.toLowerCase();
          filtered = filtered.filter(p => {
            const name = (p.userId?.name || '').toLowerCase();
            const empId = (p.userId?.employeeId || '').toLowerCase();
            const dept = (p.userId?.department || '').toLowerCase();
            return name.includes(s) || empId.includes(s) || dept.includes(s);
          });
        }

        const totalEmployees = filtered.length;
        const totalGrossSalary = filtered.reduce((acc, p) => acc + (p.earnings?.grossSalary || 0), 0);
        const totalDeductions = filtered.reduce((acc, p) => acc + (p.deductions?.totalDeductions || 0), 0);
        const totalNetSalary = filtered.reduce((acc, p) => acc + (p.netSalary || 0), 0);
        const paidCount = filtered.filter(p => p.status === 'PAID').length;
        const pendingCount = filtered.filter(p => p.status !== 'PAID').length;

        summary = {
          totalEmployees,
          totalGrossSalary,
          totalDeductions,
          totalNetSalary,
          paidCount,
          pendingCount,
        };

        data = filtered.map(p => ({
          _id: p._id,
          employeeName: p.userId?.name || 'Employee',
          employeeId: p.userId?.employeeId || '—',
          department: p.userId?.department || 'General',
          designation: p.userId?.designation || 'Staff',
          basic: p.earnings?.basic || 0,
          grossSalary: p.earnings?.grossSalary || 0,
          deductions: p.deductions?.totalDeductions || 0,
          netSalary: p.netSalary || 0,
          status: p.status || 'CALCULATED',
          paymentStatus: p.payment?.paymentStatus || 'PENDING',
          paymentDate: p.payment?.paymentDate ? new Date(p.payment.paymentDate).toLocaleDateString('en-IN') : '—',
          paymentMethod: p.payment?.paymentMethod || '—',
          month: p.month,
        }));
        break;
      }

      // ─────────────────────────────────────────────────────────────
      // 7. BUSINESS REPORT
      // ─────────────────────────────────────────────────────────────
      case 'business': {
        const [projects, leads, clients, invoices, expenses] = await Promise.all([
          Project.find(),
          Lead.find(),
          Client.find(),
          Invoice.find(),
          Expense.find(),
        ]);

        const totalRevenue = invoices.reduce((acc, i) => acc + (i.paidAmount || 0), 0);
        const totalExpenses = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
        const netProfit = totalRevenue - totalExpenses;
        const profitMargin = totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(1)) : 0;

        summary = {
          totalRevenue,
          totalExpenses,
          netProfit,
          profitMargin,
          totalProjects: projects.length,
          activeProjects: projects.filter(p => p.status === 'In Progress' || p.status === 'Planning').length,
          totalLeads: leads.length,
          totalClients: clients.length,
        };

        data = projects.map(p => ({
          _id: p._id,
          project: p.name,
          client: p.client,
          status: p.status,
          budget: p.budget?.estimatedBudget || p.value || 0,
          revenue: p.budget?.revenue || 0,
          cost: p.budget?.actualCost || 0,
          profit: (p.budget?.revenue || 0) - (p.budget?.actualCost || 0),
        }));
        break;
      }

      // ─────────────────────────────────────────────────────────────
      // 8. LEAD REPORT
      // ─────────────────────────────────────────────────────────────
      case 'lead': {
        const query = {};
        if (status && status !== 'All') query.status = status;
        if (search && search.trim()) {
          const s = search.trim();
          query.$or = [
            { name: { $regex: s, $options: 'i' } },
            { phone: { $regex: s, $options: 'i' } },
            { leadNumber: { $regex: s, $options: 'i' } },
            { location: { $regex: s, $options: 'i' } },
          ];
        }

        let leads = await Lead.find(query).sort({ createdAt: -1 });
        const totalLeads = leads.length;
        const converted = leads.filter(l => l.status === 'Converted').length;
        const totalBudget = leads.reduce((acc, l) => acc + (l.budget || 0), 0);

        summary = {
          totalLeads,
          converted,
          conversionRate: totalLeads > 0 ? Number(((converted / totalLeads) * 100).toFixed(1)) : 0,
          pipelineValue: totalBudget,
        };

        data = leads.map(l => ({
          _id: l._id,
          leadNumber: l.leadNumber,
          name: l.name,
          phone: l.phone,
          source: l.leadSource,
          requirement: `${l.propertyType} - ${l.requirement}`,
          budget: l.budget,
          status: l.status,
          location: l.location || '—',
          createdAt: new Date(l.createdAt).toLocaleDateString('en-IN'),
        }));
        break;
      }

      // ─────────────────────────────────────────────────────────────
      // 9. CLIENT REPORT
      // ─────────────────────────────────────────────────────────────
      case 'client': {
        const query = {};
        if (status && status !== 'All') query.status = status;
        if (search && search.trim()) {
          const s = search.trim();
          query.$or = [
            { name: { $regex: s, $options: 'i' } },
            { phone: { $regex: s, $options: 'i' } },
            { email: { $regex: s, $options: 'i' } },
          ];
        }

        const clients = await Client.find(query).sort({ createdAt: -1 });
        summary = {
          totalClients: clients.length,
          activeClients: clients.filter(c => c.status === 'Active').length,
          totalRevenue: clients.reduce((acc, c) => acc + (c.financialSummary?.totalPaid || 0), 0),
          totalOutstanding: clients.reduce((acc, c) => acc + (c.financialSummary?.totalOutstanding || 0), 0),
        };

        data = clients.map(c => ({
          _id: c._id,
          name: c.name,
          company: c.company || 'Individual',
          phone: c.phone || '—',
          email: c.email || '—',
          status: c.status,
          totalQuoted: c.financialSummary?.totalQuoted || 0,
          totalPaid: c.financialSummary?.totalPaid || 0,
          outstanding: c.financialSummary?.totalOutstanding || 0,
        }));
        break;
      }

      // ─────────────────────────────────────────────────────────────
      // 10. QUOTATION REPORT
      // ─────────────────────────────────────────────────────────────
      case 'quotation': {
        const query = {};
        if (status && status !== 'All') query.status = status;
        if (search && search.trim()) {
          const s = search.trim();
          query.$or = [
            { quotationNumber: { $regex: s, $options: 'i' } },
            { 'client.name': { $regex: s, $options: 'i' } },
          ];
        }

        const quotations = await Quotation.find(query).sort({ createdAt: -1 });
        const totalQuoted = quotations.reduce((acc, q) => acc + (q.grandTotal || 0), 0);
        const approved = quotations.filter(q => q.status === 'Approved' || q.status === 'Converted to Project');

        summary = {
          totalQuotations: quotations.length,
          approvedCount: approved.length,
          totalQuotedValue: totalQuoted,
          approvedValue: approved.reduce((acc, q) => acc + (q.grandTotal || 0), 0),
        };

        data = quotations.map(q => ({
          _id: q._id,
          quotationNumber: q.quotationNumber,
          client: q.client?.name || '—',
          totalAmount: q.grandTotal || 0,
          revision: `v${q.revision || 0}`,
          status: q.status,
          date: new Date(q.createdAt).toLocaleDateString('en-IN'),
        }));
        break;
      }

      // ─────────────────────────────────────────────────────────────
      // 11. EXPENSE REPORT
      // ─────────────────────────────────────────────────────────────
      case 'expense': {
        const query = {};
        if (status && status !== 'All') query.approvalStatus = status;
        if (search && search.trim()) {
          const s = search.trim();
          query.$or = [
            { vendorOrEmployee: { $regex: s, $options: 'i' } },
            { projectName: { $regex: s, $options: 'i' } },
            { category: { $regex: s, $options: 'i' } },
          ];
        }

        const expenses = await Expense.find(query).sort({ date: -1 });
        const totalAmount = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);

        summary = {
          totalExpenses: expenses.length,
          totalAmount,
          approvedAmount: expenses.filter(e => e.approvalStatus === 'Approved').reduce((acc, e) => acc + e.amount, 0),
          pendingAmount: expenses.filter(e => e.approvalStatus === 'Pending').reduce((acc, e) => acc + e.amount, 0),
        };

        data = expenses.map(e => ({
          _id: e._id,
          category: e.category,
          vendor: e.vendorOrEmployee,
          project: e.projectName || 'Studio / General',
          amount: e.amount,
          method: e.paymentMethod,
          status: e.approvalStatus,
          date: new Date(e.date).toLocaleDateString('en-IN'),
        }));
        break;
      }

      // ─────────────────────────────────────────────────────────────
      // 12. REVENUE REPORT
      // ─────────────────────────────────────────────────────────────
      case 'revenue': {
        const query = {};
        if (status && status !== 'All') query.paymentStatus = status;
        if (search && search.trim()) {
          const s = search.trim();
          query.$or = [
            { invoiceNumber: { $regex: s, $options: 'i' } },
            { clientName: { $regex: s, $options: 'i' } },
            { projectName: { $regex: s, $options: 'i' } },
          ];
        }

        const invoices = await Invoice.find(query).sort({ issueDate: -1 });
        const totalBilled = invoices.reduce((acc, i) => acc + (i.totalAmount || 0), 0);
        const totalCollected = invoices.reduce((acc, i) => acc + (i.paidAmount || 0), 0);
        const totalOutstanding = invoices.reduce((acc, i) => acc + (i.balanceAmount || 0), 0);

        summary = {
          totalInvoices: invoices.length,
          totalBilled,
          totalCollected,
          totalOutstanding,
          collectionRate: totalBilled > 0 ? Number(((totalCollected / totalBilled) * 100).toFixed(1)) : 0,
        };

        data = invoices.map(i => ({
          _id: i._id,
          invoiceNumber: i.invoiceNumber,
          client: i.clientName,
          project: i.projectName || '—',
          total: i.totalAmount,
          received: i.paidAmount,
          outstanding: i.balanceAmount,
          status: i.paymentStatus,
          dueDate: new Date(i.dueDate).toLocaleDateString('en-IN'),
        }));
        break;
      }

      // ─────────────────────────────────────────────────────────────
      // 13. PROFIT & LOSS REPORT
      // ─────────────────────────────────────────────────────────────
      case 'profit-loss':
      case 'profit_loss': {
        const [projects, expenses, invoices] = await Promise.all([
          Project.find(),
          Expense.find(),
          Invoice.find(),
        ]);

        const projectRows = projects.map(p => {
          const pInvoices = invoices.filter(i => i.projectId && i.projectId.toString() === p._id.toString());
          const rev = pInvoices.reduce((acc, i) => acc + (i.paidAmount || i.totalAmount || 0), 0) || p.budget?.revenue || p.value || 0;

          const pExpenses = expenses.filter(e => e.projectId && e.projectId.toString() === p._id.toString());
          const mat = pExpenses.filter(e => e.category === 'Material Cost').reduce((acc, e) => acc + e.amount, 0);
          const lab = pExpenses.filter(e => e.category === 'Labour / Contractor').reduce((acc, e) => acc + e.amount, 0);
          const oth = pExpenses.filter(e => e.category !== 'Material Cost' && e.category !== 'Labour / Contractor').reduce((acc, e) => acc + e.amount, 0);
          const cost = mat + lab + oth || p.budget?.actualCost || 0;
          const profit = rev - cost;
          const margin = rev > 0 ? Number(((profit / rev) * 100).toFixed(1)) : 0;

          return {
            _id: p._id,
            project: p.name,
            client: p.client,
            revenue: rev,
            materialCost: mat,
            labourCost: lab,
            otherCost: oth,
            totalCost: cost,
            profit,
            margin,
          };
        });

        const totalRev = projectRows.reduce((acc, r) => acc + r.revenue, 0);
        const totalCost = projectRows.reduce((acc, r) => acc + r.totalCost, 0);
        const netProfit = totalRev - totalCost;

        summary = {
          totalRevenue: totalRev,
          totalCost,
          netProfit,
          overallMargin: totalRev > 0 ? Number(((netProfit / totalRev) * 100).toFixed(1)) : 0,
        };

        data = projectRows;
        break;
      }

      default:
        data = [];
        summary = {};
    }

    res.status(200).json({
      success: true,
      type,
      period: periodLabel,
      summary,
      count: data.length,
      data,
    });

  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/reports/send-email
 * Dispatch a generated report to recipient email(s) with attachment
 */
exports.sendReportByEmail = async (req, res, next) => {
  try {
    const {
      recipients,
      subject,
      message,
      reportType = 'Project',
      period,
      filename,
      attachmentBase64,
      mimeType = 'application/pdf',
    } = req.body;

    if (!recipients) {
      return res.status(400).json({ success: false, message: 'Please provide at least one recipient email address.' });
    }

    if (!attachmentBase64) {
      return res.status(400).json({ success: false, message: 'Report attachment content is required.' });
    }

    const attachments = [{
      filename: filename || `${reportType}_Report.pdf`,
      content: attachmentBase64,
      encoding: 'base64',
      contentType: mimeType,
    }];

    const result = await sendReportEmail({
      to: recipients,
      subject: subject || `[Altera Interior] ${reportType} Report - ${period || 'Current'}`,
      message,
      reportType,
      period,
      attachments,
    });

    res.status(200).json({
      success: true,
      message: `Report successfully dispatched to ${Array.isArray(recipients) ? recipients.join(', ') : recipients}.`,
      previewUrl: result.previewUrl,
    });

  } catch (error) {
    next(error);
  }
};

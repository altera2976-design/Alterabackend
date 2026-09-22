const Project = require('../models/Project');
const Client = require('../models/Client');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Quotation = require('../models/Quotation');
const Task = require('../models/Task');
const Payroll = require('../models/Payroll');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const Lead = require('../models/Lead');
const Invoice = require('../models/Invoice');
const Expense = require('../models/Expense');
const LeaveRequest = require('../models/LeaveRequest');
const BikeTracking = require('../models/BikeTracking');
const OfferLetter = require('../models/OfferLetter');

exports.getDashboardStats = async (req, res, next) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || (user.role && user.role.toUpperCase().includes('ADMIN'));
    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();

    // ==========================================
    // 1. ADMIN DASHBOARD STATS (OPTIMIZED AGGREGATIONS)
    // ==========================================
    if (isAdmin) {
      const [
        totalEmployees,
        activeEmployees,
        projectStats,
        totalClients,
        quotationStats,
        todayAttendanceStats,
        pendingLeaves,
        leadStats,
        taskStats,
        pendingOfferLetters,
        recentLeadsList,
        upcomingTasksList,
        activeBikeSessionsList,
        recentBikeHistoryList,
        payrollStats,
        invoiceStats,
        expenseStats,
        bikeDistStats,
        recentAudit,
      ] = await Promise.all([
        User.countDocuments({ role: 'EMPLOYEE' }),
        User.countDocuments({ role: 'EMPLOYEE', status: 'ACTIVE' }),

        // 1. Project status breakdown in 1 query
        Project.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),

        Client.countDocuments(),

        // 2. Quotation value & status totals in 1 query
        Quotation.aggregate([
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              totalValue: { $sum: '$grandTotal' },
            },
          },
        ]),

        // 3. Today's attendance status counts in 1 query
        Attendance.aggregate([
          { $match: { date: todayStr } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),

        LeaveRequest.countDocuments({ status: 'Pending' }),

        // 4. Lead pipeline counts in 1 query
        Lead.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),

        // 5. Task count & overdue status in 1 query
        Task.aggregate([
          {
            $facet: {
              pending: [{ $match: { status: { $ne: 'Completed' } } }, { $count: 'c' }],
              overdue: [
                { $match: { status: { $ne: 'Completed' }, dueDate: { $lt: now } } },
                { $count: 'c' },
              ],
            },
          },
        ]),

        OfferLetter.countDocuments({ status: { $in: ['DRAFT', 'GENERATED', 'SENT'] } }),

        Lead.find().sort({ createdAt: -1 }).limit(5).lean(),
        Task.find({ status: { $ne: 'Completed' } }).sort({ dueDate: 1 }).limit(5).lean(),
        BikeTracking.find({ status: 'ACTIVE' }).sort({ startTime: -1 }).lean(),
        BikeTracking.find({ status: 'COMPLETED' }).sort({ stopTime: -1 }).limit(20).lean(),

        // 6. Payroll total aggregation
        Payroll.aggregate([
          {
            $group: {
              _id: null,
              totalPayroll: {
                $sum: { $ifNull: ['$netSalary', '$totalSalary'] },
              },
            },
          },
        ]),

        // 7. Invoice totals aggregation
        Invoice.aggregate([
          {
            $group: {
              _id: null,
              totalSales: { $sum: '$totalAmount' },
              receivedPayments: { $sum: '$paidAmount' },
              outstandingPayments: { $sum: '$balanceAmount' },
            },
          },
        ]),

        // 8. Expense totals aggregation
        Expense.aggregate([
          { $group: { _id: null, totalExpenses: { $sum: '$amount' } } },
        ]),

        // 9. Bike tracking totals aggregation
        BikeTracking.aggregate([
          {
            $facet: {
              allDist: [{ $group: { _id: null, totalDist: { $sum: '$distanceKm' }, count: { $sum: 1 } } }],
              todayDist: [
                { $match: { date: todayStr } },
                { $group: { _id: null, todayDist: { $sum: '$distanceKm' } } },
              ],
              completedTrips: [{ $match: { status: 'COMPLETED' } }, { $count: 'c' }],
            },
          },
        ]),

        AuditLog.find().sort({ createdAt: -1 }).limit(8).lean(),
      ]);

      // Process Project Counts
      let inProgressProjects = 0;
      let completedProjects = 0;
      let planningProjects = 0;
      let onHoldProjects = 0;
      let notStartedProjects = 0;
      let totalProjects = 0;

      (projectStats || []).forEach((p) => {
        totalProjects += p.count;
        if (p._id === 'In Progress') inProgressProjects = p.count;
        else if (p._id === 'Completed') completedProjects = p.count;
        else if (p._id === 'Planning') planningProjects = p.count;
        else if (p._id === 'On Hold') onHoldProjects = p.count;
        else if (p._id === 'Not Started') notStartedProjects = p.count;
      });

      // Process Quotation Stats
      let pendingQuotations = 0;
      let approvedQuotations = 0;
      let quotationValue = 0;
      let approvedQuotationValue = 0;

      (quotationStats || []).forEach((q) => {
        quotationValue += q.totalValue || 0;
        const st = q._id;
        if (['Draft', 'Sent', 'Viewed', 'Under Discussion', 'Pending Approval', 'Negotiation'].includes(st)) {
          pendingQuotations += q.count;
        } else if (['Approved', 'Converted to Project'].includes(st)) {
          approvedQuotations += q.count;
          approvedQuotationValue += q.totalValue || 0;
        }
      });

      // Process Attendance Stats
      let todayPresent = 0;
      let todayLate = 0;
      let todayLeave = 0;
      let todayAbsent = 0;

      (todayAttendanceStats || []).forEach((a) => {
        if (a._id === 'PRESENT') todayPresent = a.count;
        else if (a._id === 'LATE') todayLate = a.count;
        else if (a._id === 'LEAVE') todayLeave = a.count;
        else if (a._id === 'ABSENT') todayAbsent = a.count;
      });

      if (todayAbsent === 0 && totalEmployees > 0) {
        todayAbsent = Math.max(0, totalEmployees - (todayPresent + todayLate + todayLeave));
      }
      const todayAttendanceCount = todayPresent + todayLate;

      // Process Lead Stats
      let totalLeads = 0;
      let newLeads = 0;
      let convertedLeads = 0;
      let contactedLeads = 0;
      let qualifiedLeads = 0;
      let consultationLeads = 0;
      let siteVisitLeads = 0;
      let designLeads = 0;

      (leadStats || []).forEach((l) => {
        totalLeads += l.count;
        const st = l._id;
        if (st === 'New Lead') newLeads = l.count;
        else if (st === 'Converted') convertedLeads = l.count;
        else if (st === 'Contacted') contactedLeads = l.count;
        else if (st === 'Qualified') qualifiedLeads = l.count;
        else if (st === 'Consultation') consultationLeads = l.count;
        else if (st === 'Site Visit') siteVisitLeads = l.count;
        else if (st === 'Design') designLeads = l.count;
      });

      const conversionRate = totalLeads > 0 ? Number(((convertedLeads / totalLeads) * 100).toFixed(1)) : 0;

      // Process Task & Financial Totals
      const pendingTasksCount = taskStats?.[0]?.pending?.[0]?.c || 0;
      const overdueTasksCount = taskStats?.[0]?.overdue?.[0]?.c || 0;
      const totalPayrollAmount = payrollStats?.[0]?.totalPayroll || 0;
      const totalSales = invoiceStats?.[0]?.totalSales || 0;
      const receivedPayments = invoiceStats?.[0]?.receivedPayments || 0;
      const outstandingPayments = invoiceStats?.[0]?.outstandingPayments || 0;
      const totalRevenue = receivedPayments || approvedQuotationValue;
      const totalExpenses = expenseStats?.[0]?.totalExpenses || 0;
      const projectProfit = totalRevenue - totalExpenses;

      // Bike Tracking Stats
      const bikeFacet = bikeDistStats?.[0] || {};
      const totalBikeDistance = Number((bikeFacet.allDist?.[0]?.totalDist || 0).toFixed(2));
      const todayBikeDistance = Number((bikeFacet.todayDist?.[0]?.todayDist || 0).toFixed(2));
      const totalBikeTrips = bikeFacet.allDist?.[0]?.count || 0;
      const completedBikeTrips = bikeFacet.completedTrips?.[0]?.c || 0;

      // 6-Month Revenue Trend Calculation
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const revenueData = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        revenueData.push({
          monthIndex: d.getMonth(),
          year: d.getFullYear(),
          label: monthNames[d.getMonth()],
          total: 0,
        });
      }

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);

      const recentProjects = await Project.find({ createdAt: { $gte: sixMonthsAgo } }).select('value createdAt').lean();
      recentProjects.forEach((p) => {
        const d = new Date(p.createdAt);
        const mIdx = d.getMonth();
        const y = d.getFullYear();
        const target = revenueData.find((r) => r.monthIndex === mIdx && r.year === y);
        if (target) target.total += p.value || 0;
      });

      const recentActivities = (recentAudit || []).map((log) => ({
        id: log._id.toString(),
        title: log.details || log.description || log.action,
        date: log.createdAt,
        user: log.actor || log.userName || 'Admin',
        icon: (log.action || '').includes('PROJECT')
          ? 'briefcase'
          : (log.action || '').includes('TASK')
          ? 'checkbox'
          : (log.action || '').includes('PAYMENT') || (log.action || '').includes('INVOICE')
          ? 'card'
          : 'sync',
      }));

      const pipelineStages = [
        { stage: 'New Lead', count: newLeads },
        { stage: 'Contacted', count: contactedLeads },
        { stage: 'Qualified', count: qualifiedLeads },
        { stage: 'Consultation', count: consultationLeads },
        { stage: 'Site Visit', count: siteVisitLeads },
        { stage: 'Design', count: designLeads },
        { stage: 'Quotation', count: pendingQuotations },
        { stage: 'Approved', count: approvedQuotations },
        { stage: 'Converted', count: convertedLeads },
      ];

      return res.status(200).json({
        success: true,
        role: 'ADMIN',
        data: {
          totalLeads,
          newLeads,
          conversionRate,
          totalClients,
          activeProjects: inProgressProjects,
          completedProjects,
          pendingQuotations,
          approvedQuotations,
          pendingOfferLetters,
          quotationValue,
          totalSales,
          totalRevenue,
          receivedPayments,
          outstandingPayments,
          totalExpenses,
          projectProfit,
          employees: totalEmployees,
          todayAttendance: todayAttendanceCount,
          todayPresent,
          todayLate,
          todayAbsent,
          attendancePercentage: totalEmployees > 0 ? Number(((todayAttendanceCount / totalEmployees) * 100).toFixed(1)) : 0,
          totalPayrollAmount,
          pendingLeave: pendingLeaves,
          pendingTasks: pendingTasksCount,
          overdueTasks: overdueTasksCount,

          totalBikeDistance,
          todayBikeDistance,
          totalBikeTrips,
          completedBikeTrips,
          activeBikeCount: activeBikeSessionsList.length,
          activeBikeSessions: activeBikeSessionsList,
          recentBikeHistory: recentBikeHistoryList,

          projectSummary: {
            total: totalProjects,
            inProgress: inProgressProjects,
            notStarted: notStartedProjects,
            onHold: onHoldProjects,
            completed: completedProjects,
            planning: planningProjects,
          },
          revenueOverview: {
            totalSales,
            totalRevenue,
            receivedPayments,
            outstandingPayments,
            totalExpenses,
            projectProfit,
            labels: revenueData.map((r) => r.label),
            values: revenueData.map((r) => r.total),
          },
          pipelineStages,
          recentLeads: recentLeadsList,
          upcomingTasks: upcomingTasksList,
          recentActivities,
        },
      });
    }

    // ==========================================
    // 2. EMPLOYEE DASHBOARD STATS (OPTIMIZED)
    // ==========================================
    const [
      assignedProjects,
      assignedTasks,
      todayAttendanceRecord,
      myPayslips,
      unreadNotifsCount,
      myAuditLogs,
    ] = await Promise.all([
      Project.find({ 'members.user': user._id }).sort({ updatedAt: -1 }).limit(5).lean(),
      Task.find({ assignedTo: user._id, status: { $ne: 'Completed' } }).sort({ dueDate: 1 }).limit(10).lean(),
      Attendance.findOne({ user: user._id, date: todayStr }).lean(),
      Payroll.find({ user: user._id }).sort({ year: -1, month: -1 }).limit(6).lean(),
      Notification.countDocuments({ user: user._id, isRead: false }),
      AuditLog.find({ actor: user.name }).sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    return res.status(200).json({
      success: true,
      role: 'EMPLOYEE',
      data: {
        myProjects: assignedProjects,
        myTasks: assignedTasks,
        todayAttendance: todayAttendanceRecord,
        myPayslips,
        unreadNotifications: unreadNotifsCount,
        recentActivities: myAuditLogs,
      },
    });
  } catch (error) {
    next(error);
  }
};

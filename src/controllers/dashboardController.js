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

    // ==========================================
    // 1. ADMIN DASHBOARD STATS (20 KPIs + CRM ECOSYSTEM)
    // ==========================================
    if (isAdmin) {
      const now = new Date();
      const [
        totalEmployees,
        activeEmployees,
        totalProjects,
        inProgressProjects,
        completedProjects,
        planningProjects,
        onHoldProjects,
        notStartedProjects,
        totalClients,
        pendingQuotations,
        approvedQuotations,
        todayPresent,
        todayLate,
        todayLeave,
        todayAbsent,
        pendingLeaves,
        totalLeads,
        newLeads,
        convertedLeads,
        pendingTasksCount,
        overdueTasksCount,
        pendingOfferLetters,
        recentLeadsList,
        upcomingTasksList,
        activeBikeSessionsList,
        recentBikeHistoryList,
        allPayrolls,
      ] = await Promise.all([
        User.countDocuments({ role: 'EMPLOYEE' }),
        User.countDocuments({ role: 'EMPLOYEE', status: 'ACTIVE' }),
        Project.countDocuments(),
        Project.countDocuments({ status: 'In Progress' }),
        Project.countDocuments({ status: 'Completed' }),
        Project.countDocuments({ status: 'Planning' }),
        Project.countDocuments({ status: 'On Hold' }),
        Project.countDocuments({ status: 'Not Started' }),
        Client.countDocuments(),
        Quotation.countDocuments({ status: { $in: ['Draft', 'Sent', 'Viewed', 'Under Discussion', 'Pending Approval', 'Negotiation'] } }),
        Quotation.countDocuments({ status: { $in: ['Approved', 'Converted to Project'] } }),
        Attendance.countDocuments({ date: todayStr, status: 'PRESENT' }),
        Attendance.countDocuments({ date: todayStr, status: 'LATE' }),
        Attendance.countDocuments({ date: todayStr, status: 'LEAVE' }),
        Attendance.countDocuments({ date: todayStr, status: 'ABSENT' }),
        LeaveRequest.countDocuments({ status: 'Pending' }),
        Lead.countDocuments(),
        Lead.countDocuments({ status: 'New Lead' }),
        Lead.countDocuments({ status: 'Converted' }),
        Task.countDocuments({ status: { $ne: 'Completed' } }),
        Task.countDocuments({ status: { $ne: 'Completed' }, dueDate: { $lt: now } }),
        OfferLetter.countDocuments({ status: { $in: ['DRAFT', 'GENERATED', 'SENT'] } }),
        Lead.find().sort({ createdAt: -1 }).limit(5),
        Task.find({ status: { $ne: 'Completed' } }).sort({ dueDate: 1 }).limit(5),
        BikeTracking.find({ status: 'ACTIVE' }).sort({ startTime: -1 }),
        BikeTracking.find({ status: 'COMPLETED' }).sort({ stopTime: -1 }).limit(20),
        Payroll.find().select('netSalary totalSalary status'),
      ]);


      const conversionRate = totalLeads > 0 ? Number(((convertedLeads / totalLeads) * 100).toFixed(1)) : 0;
      const todayAttendanceCount = todayPresent + todayLate;

      // Real Finance Aggregation (Quotations, Invoices, Expenses)
      const [allQuotations, allInvoices, allExpenses] = await Promise.all([
        Quotation.find().select('grandTotal status'),
        Invoice.find().select('totalAmount paidAmount balanceAmount paymentStatus'),
        Expense.find().select('amount category approvalStatus'),
      ]);

      const quotationValue = allQuotations.reduce((acc, q) => acc + (q.grandTotal || 0), 0);
      const totalSales = allInvoices.reduce((acc, i) => acc + (i.totalAmount || 0), 0);
      const receivedPayments = allInvoices.reduce((acc, i) => acc + (i.paidAmount || 0), 0);
      const outstandingPayments = allInvoices.reduce((acc, i) => acc + (i.balanceAmount || 0), 0);
      const totalRevenue = receivedPayments || allQuotations.filter(q => q.status === 'Approved').reduce((acc, q) => acc + q.grandTotal, 0);
      const totalExpenses = allExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);
      const projectProfit = totalRevenue - totalExpenses;

      // 6-Month Revenue Trend
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

      const recentProjects = await Project.find({ createdAt: { $gte: sixMonthsAgo } });
      recentProjects.forEach((p) => {
        const d = new Date(p.createdAt);
        const mIdx = d.getMonth();
        const y = d.getFullYear();
        const target = revenueData.find((r) => r.monthIndex === mIdx && r.year === y);
        if (target) target.total += p.value || 0;
      });

      const revenueLabels = revenueData.map((r) => r.label);
      const revenueValues = revenueData.map((r) => r.total);

      // Recent activities from AuditLog
      const recentAudit = await AuditLog.find().sort({ createdAt: -1 }).limit(8);
      const recentActivities = recentAudit.map((log) => ({
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

      // Sales Pipeline Stage Breakdown
      const pipelineStages = [
        { stage: 'New Lead', count: newLeads },
        { stage: 'Contacted', count: await Lead.countDocuments({ status: 'Contacted' }) },
        { stage: 'Qualified', count: await Lead.countDocuments({ status: 'Qualified' }) },
        { stage: 'Consultation', count: await Lead.countDocuments({ status: 'Consultation' }) },
        { stage: 'Site Visit', count: await Lead.countDocuments({ status: 'Site Visit' }) },
        { stage: 'Design', count: await Lead.countDocuments({ status: 'Design' }) },
        { stage: 'Quotation', count: pendingQuotations },
        { stage: 'Approved', count: approvedQuotations },
        { stage: 'Converted', count: convertedLeads },
      ];

      // Bike Tracking Metrics Aggregation
      const allBikeSessions = await BikeTracking.find();
      const totalBikeDistance = Number(allBikeSessions.reduce((acc, s) => acc + (s.distanceKm || 0), 0).toFixed(2));
      const todayBikeSessions = allBikeSessions.filter(s => s.date === todayStr);
      const todayBikeDistance = Number(todayBikeSessions.reduce((acc, s) => acc + (s.distanceKm || 0), 0).toFixed(2));
      const totalBikeTrips = allBikeSessions.length;
      const completedBikeTrips = allBikeSessions.filter(s => s.status === 'COMPLETED').length;

      return res.status(200).json({
        success: true,
        role: 'ADMIN',
        data: {
          // 20 Core Admin KPIs
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
          totalPayrollAmount: allPayrolls.reduce((acc, p) => acc + (p.netSalary || p.totalSalary || 0), 0),
          pendingLeave: pendingLeaves,
          pendingTasks: pendingTasksCount,
          overdueTasks: overdueTasksCount,

          // Bike Tracking Live & Totals
          totalBikeDistance,
          todayBikeDistance,
          totalBikeTrips,
          completedBikeTrips,
          activeBikeCount: activeBikeSessionsList.length,
          activeBikeSessions: activeBikeSessionsList,
          recentBikeHistory: recentBikeHistoryList,

          // Detailed breakdowns for clean dashboard layout
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
            labels: revenueLabels,
            values: revenueValues,
          },
          pipelineStages,
          recentLeads: recentLeadsList,
          upcomingTasks: upcomingTasksList,
          recentActivities,
        },
      });
    }

    // ==========================================
    // 2. EMPLOYEE DASHBOARD STATS
    // ==========================================
    const [
      assignedProjects,
      assignedTasks,
      todayAttendanceRecord,
      myPayslips,
      unreadNotifsCount,
      myAuditLogs,
    ] = await Promise.all([
      Project.find({
        $or: [{ 'assignedTeam.userId': user._id }, { 'projectManager.userId': user._id }],
      }).sort({ updatedAt: -1 }),
      Task.find({ assignedTo: user._id }).sort({ dueDate: 1 }),
      Attendance.findOne({ userId: user._id, date: todayStr }),
      Payroll.find({ employeeId: user._id }).sort({ createdAt: -1 }),
      Notification.countDocuments({ recipientId: user._id, isRead: false }),
      AuditLog.find({ userId: user._id }).sort({ createdAt: -1 }).limit(6),
    ]);

    // My Projects Summary
    const totalAssignedProjects = assignedProjects.length;
    const activeAssignedProjects = assignedProjects.filter((p) => p.status === 'In Progress').length;
    const completedAssignedProjects = assignedProjects.filter((p) => p.status === 'Completed').length;

    // My Tasks Summary
    let pendingTasks = 0;
    let inProgressTasks = 0;
    let completedTasks = 0;
    let blockedTasks = 0;

    assignedTasks.forEach((t) => {
      if (t.status === 'Completed') completedTasks++;
      else if (t.status === 'In Progress') inProgressTasks++;
      else if (t.status === 'Blocked') blockedTasks++;
      else pendingTasks++;
    });

    // Sanitized project cards for employee view
    const myProjectsList = assignedProjects.slice(0, 5).map((p) => {
      const myMemberRecord = p.assignedTeam.find((m) => m.userId.toString() === user._id.toString());
      const isPM = p.projectManager?.userId?.toString() === user._id.toString();
      return {
        _id: p._id,
        projectId: p.projectId,
        name: p.name,
        client: p.client,
        projectAddress: p.projectAddress,
        status: p.status,
        progress: p.progress,
        startDate: p.startDate,
        expectedCompletionDate: p.expectedCompletionDate,
        myRole: isPM ? 'Project Manager' : myMemberRecord?.role || 'Team Member',
      };
    });

    // Format top urgent tasks
    const topPendingTasks = assignedTasks
      .filter((t) => t.status !== 'Completed')
      .slice(0, 5)
      .map((t) => ({
        _id: t._id,
        taskId: t.taskId,
        name: t.name,
        projectName: t.projectName,
        priority: t.priority,
        dueDate: t.dueDate,
        status: t.status,
        progress: t.progress,
      }));

    // Leave metrics (assuming 18 total yearly leaves)
    const leavesTaken = await Attendance.countDocuments({ userId: user._id, status: 'LEAVE' });
    const pendingLeaveReqs = await Attendance.countDocuments({
      userId: user._id,
      status: 'LEAVE',
      verificationStatus: 'REVIEW_REQUIRED',
    });

    // Recent activity list
    const personalActivities = myAuditLogs.map((log) => ({
      id: log._id.toString(),
      title: log.description || log.action,
      date: log.createdAt,
      icon: log.action.includes('TASK') ? 'checkbox' : log.action.includes('PHOTO') ? 'camera' : 'time',
    }));

    res.status(200).json({
      success: true,
      role: 'EMPLOYEE',
      data: {
        welcomeName: user.name,
        designation: user.designation || 'Employee',
        employeeId: user.employeeId || '',
        todayAttendance: {
          isCheckedIn: !!todayAttendanceRecord?.checkInTime,
          isCheckedOut: !!todayAttendanceRecord?.checkOutTime,
          checkInTime: todayAttendanceRecord?.checkInTime || null,
          checkOutTime: todayAttendanceRecord?.checkOutTime || null,
          status: todayAttendanceRecord?.status || 'NOT_MARKED',
          projectId: todayAttendanceRecord?.projectId || null,
          projectName: todayAttendanceRecord?.projectName || '',
        },
        myProjects: {
          total: totalAssignedProjects,
          active: activeAssignedProjects,
          completed: completedAssignedProjects,
          pendingTasks: pendingTasks + inProgressTasks,
          list: myProjectsList,
        },
        myTasks: {
          total: assignedTasks.length,
          pending: pendingTasks,
          inProgress: inProgressTasks,
          completed: completedTasks,
          blocked: blockedTasks,
          topTasks: topPendingTasks,
        },
        myLeave: {
          available: Math.max(0, 18 - leavesTaken),
          pending: pendingLeaveReqs,
          approved: leavesTaken - pendingLeaveReqs,
        },
        myPayroll: {
          salary: user.salary || 0,
          latestPayslip: myPayslips[0]
            ? {
                month: myPayslips[0].month,
                netSalary: myPayslips[0].netSalary,
                status: myPayslips[0].status,
              }
            : null,
          payslipsCount: myPayslips.length,
        },
        notificationsCount: unreadNotifsCount,
        recentActivity: personalActivities,
      },
    });
  } catch (error) {
    next(error);
  }
};

const ProjectIssue = require('../models/ProjectIssue');
const Project = require('../models/Project');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const User = require('../models/User');

const emitSocket = (req, event, data) => {
  try {
    const io = req.app.get('io');
    if (io) io.emit(event, data);
  } catch (err) {
    console.error('Socket emit error:', err.message);
  }
};

/**
 * GET /api/issues
 * Query by projectId, status, priority, reportedBy
 */
exports.getIssues = async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    const { projectId, status, priority } = req.query;

    const filter = {};
    if (projectId) filter.projectId = projectId;
    if (status && status !== 'All') filter.status = status;
    if (priority && priority !== 'All') filter.priority = priority;

    if (!isAdmin && !projectId) {
      // If employee doesn't specify project, show issues they reported or assigned to them
      filter.$or = [{ reportedBy: req.user._id }, { assignedTo: req.user._id }];
    }

    const issues = await ProjectIssue.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: issues.length, data: issues });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/issues
 * Employee or Admin reports site issue
 */
exports.reportIssue = async (req, res, next) => {
  try {
    const { projectId, taskId, title, description, priority, photo } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const count = await ProjectIssue.countDocuments({ projectId });
    const issueId = `ISS-${project.projectId.replace('PR-', '')}-${String(count + 1).padStart(3, '0')}`;

    const issue = await ProjectIssue.create({
      issueId,
      projectId: project._id,
      projectName: project.name,
      taskId: taskId || null,
      title,
      description,
      priority: priority || 'High',
      status: 'Open',
      reportedBy: req.user._id,
      reportedByName: req.user.name,
      photo: photo || '',
    });

    // Audit log
    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'ISSUE_REPORTED',
      projectId: project._id,
      projectName: project.name,
      description: `${req.user.name} reported issue "${title}" (${issue.priority}) on project "${project.name}"`,
      attachment: photo || '',
    });

    // Notify all admins
    const admins = await User.find({ role: 'ADMIN' });
    for (const admin of admins) {
      await Notification.create({
        recipientId: admin._id,
        senderId: req.user._id,
        senderName: req.user.name,
        title: `Site Issue Reported: ${title}`,
        message: `${req.user.name} reported [${issue.priority}] issue on "${project.name}": ${description}`,
        type: 'ISSUE',
        linkId: issue._id.toString(),
      });
    }

    emitSocket(req, 'issue:reported', issue);

    res.status(201).json({ success: true, data: issue });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/issues/:id
 * Admin updates status, assigns, or resolves
 */
exports.updateIssue = async (req, res, next) => {
  try {
    const issue = await ProjectIssue.findById(req.params.id);
    if (!issue) {
      return res.status(404).json({ success: false, message: 'Issue not found' });
    }

    const isAdmin = req.user.role === 'ADMIN';
    const isReporter = issue.reportedBy.toString() === req.user._id.toString();

    const { status, priority, assignedTo, resolutionNotes, comment } = req.body;

    if (status) {
      issue.status = status;
      if (status === 'Resolved' || status === 'Closed') {
        issue.resolvedAt = new Date();
      }
    }

    if (priority && isAdmin) {
      issue.priority = priority;
    }

    if (assignedTo && isAdmin) {
      const assignee = await User.findById(assignedTo);
      if (assignee) {
        issue.assignedTo = assignee._id;
        issue.assignedToName = assignee.name;
      }
    }

    if (resolutionNotes) {
      issue.resolutionNotes = resolutionNotes;
    }

    if (comment) {
      issue.comments.push({
        authorId: req.user._id,
        authorName: req.user.name,
        text: comment,
        createdAt: new Date(),
      });
    }

    await issue.save();

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'ISSUE_UPDATED',
      projectId: issue.projectId,
      projectName: issue.projectName,
      description: `Issue "${issue.title}" status changed to ${issue.status}`,
    });

    emitSocket(req, 'issue:updated', issue);

    res.status(200).json({ success: true, data: issue });
  } catch (error) {
    next(error);
  }
};

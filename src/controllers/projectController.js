const Project = require('../models/Project');
const Task = require('../models/Task');
const ProjectPhoto = require('../models/ProjectPhoto');
const ProjectIssue = require('../models/ProjectIssue');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const Attendance = require('../models/Attendance');
const Quotation = require('../models/Quotation');
const User = require('../models/User');

// Helper: emit socket event if io available
const emitSocket = (req, event, data) => {
  try {
    const io = req.app.get('io');
    if (io) {
      io.emit(event, data);
    }
  } catch (err) {
    console.error('Socket emit error:', err.message);
  }
};

// Helper: create audit log entry
const logAudit = async ({ req, action, project, description, oldValue, newValue, attachment }) => {
  try {
    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action,
      projectId: project?._id,
      projectName: project?.name,
      description,
      attachment,
      oldValue,
      newValue,
    });
  } catch (err) {
    console.error('AuditLog creation error:', err.message);
  }
};

/**
 * GET /api/projects
 * Admin: all projects (search & filter)
 * Employee: ONLY assigned projects (financials stripped)
 */
exports.getProjects = async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    const { search, status, priority, type, employeeId } = req.query;

    const filter = {};

    if (!isAdmin) {
      // Employee sees ONLY projects where they are assigned or project manager
      filter.$or = [
        { 'assignedTeam.userId': req.user._id },
        { 'projectManager.userId': req.user._id },
      ];
    } else if (employeeId) {
      filter.$or = [
        { 'assignedTeam.userId': employeeId },
        { 'projectManager.userId': employeeId },
      ];
    }

    if (status && status !== 'All') {
      filter.status = status;
    }

    if (priority && priority !== 'All') {
      filter.priority = priority;
    }

    if (type && type !== 'All') {
      filter.projectType = type;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { name: searchRegex },
          { projectId: searchRegex },
          { client: searchRegex },
          { projectAddress: searchRegex },
          { 'assignedTeam.name': searchRegex },
        ],
      });
    }

    const projects = await Project.find(filter).sort({ createdAt: -1 });

    // Sanitize for employees
    const formatted = projects.map((p) => {
      if (!isAdmin) {
        return p.toEmployeeJSON();
      }
      return p;
    });

    res.status(200).json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/projects/:id
 * Admin: full project
 * Employee: assigned only, financials stripped
 */
exports.getProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const isAdmin = req.user.role === 'ADMIN';
    if (!isAdmin) {
      const isAssigned =
        project.assignedTeam.some((member) => member.userId.toString() === req.user._id.toString()) ||
        (project.projectManager && project.projectManager.userId?.toString() === req.user._id.toString());

      if (!isAssigned) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You are not assigned to this project.',
        });
      }

      return res.status(200).json({
        success: true,
        data: project.toEmployeeJSON(),
      });
    }

    res.status(200).json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/projects
 * Admin only
 */
exports.createProject = async (req, res, next) => {
  try {
    const count = await Project.countDocuments();
    const projectId = req.body.projectId || `PR-${String(count + 1).padStart(5, '0')}`;

    const projectData = {
      ...req.body,
      projectId,
      createdBy: req.user._id,
    };

    // Calculate initial tasks count if tasks provided
    projectData.tasks = 0;
    projectData.tasksCount = { total: 0, pending: 0, inProgress: 0, completed: 0, blocked: 0 };

    const project = await Project.create(projectData);

    // Audit log
    await logAudit({
      req,
      action: 'PROJECT_CREATED',
      project,
      description: `Project "${project.name}" created by Admin`,
      newValue: project.toObject(),
    });

    // Notify assigned team members
    if (project.assignedTeam && project.assignedTeam.length > 0) {
      for (const member of project.assignedTeam) {
        await Notification.create({
          recipientId: member.userId,
          senderId: req.user._id,
          senderName: req.user.name,
          title: 'Assigned to New Project',
          message: `You have been assigned as ${member.role} on project "${project.name}"`,
          type: 'PROJECT',
          linkId: project._id.toString(),
        });
      }
    }

    emitSocket(req, 'project:created', project);

    res.status(201).json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/projects/:id
 * Admin or Project Manager
 */
exports.updateProject = async (req, res, next) => {
  try {
    let project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const isAdmin = req.user.role === 'ADMIN';
    const isPM = project.projectManager?.userId?.toString() === req.user._id.toString();

    if (!isAdmin && !isPM) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Admins or Project Managers can update project details.',
      });
    }

    const oldStatus = project.status;
    const oldProgress = project.progress;
    const updates = { ...req.body };

    // Disallow non-admins from modifying financial budgets
    if (!isAdmin && updates.budget) {
      delete updates.budget;
    }
    if (!isAdmin && updates.value) {
      delete updates.value;
    }

    // Auto-update status if progress is 100
    if (updates.progress !== undefined) {
      if (Number(updates.progress) === 100) {
        updates.status = 'Completed';
        updates.actualCompletionDate = new Date().toISOString().split('T')[0];
      } else if (Number(updates.progress) > 0 && updates.progress < 100 && project.status === 'Planning') {
        updates.status = 'In Progress';
      }
    }

    project = await Project.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    // Audit log
    await logAudit({
      req,
      action: 'PROJECT_EDITED',
      project,
      description: `Project "${project.name}" updated. Status: ${project.status}, Progress: ${project.progress}%`,
      oldValue: { status: oldStatus, progress: oldProgress },
      newValue: { status: project.status, progress: project.progress },
    });

    emitSocket(req, 'project:updated', project);

    res.status(200).json({
      success: true,
      data: isAdmin ? project : project.toEmployeeJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/projects/:id
 * Admin only
 */
exports.deleteProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    await Project.findByIdAndDelete(req.params.id);
    await Task.deleteMany({ projectId: req.params.id });
    await ProjectPhoto.deleteMany({ projectId: req.params.id });
    await ProjectIssue.deleteMany({ projectId: req.params.id });

    await logAudit({
      req,
      action: 'PROJECT_DELETED',
      project,
      description: `Project "${project.name}" was deleted.`,
    });

    emitSocket(req, 'project:deleted', { id: req.params.id });

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/projects/:id/team
 * Admin only: Assign or update team member role
 */
exports.assignTeamMember = async (req, res, next) => {
  try {
    const { userId, role } = req.body;
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const employee = await User.findById(userId);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const existingIndex = project.assignedTeam.findIndex(
      (m) => m.userId.toString() === userId.toString()
    );

    if (existingIndex >= 0) {
      project.assignedTeam[existingIndex].role = role || project.assignedTeam[existingIndex].role;
    } else {
      project.assignedTeam.push({
        userId: employee._id,
        name: employee.name,
        email: employee.email,
        phone: employee.phone || '',
        role: role || 'Site Engineer',
        assignedAt: new Date(),
      });
    }

    await project.save();

    await logAudit({
      req,
      action: 'EMPLOYEE_ASSIGNED',
      project,
      description: `Assigned ${employee.name} as ${role || 'Team Member'} to project "${project.name}"`,
    });

    await Notification.create({
      recipientId: employee._id,
      senderId: req.user._id,
      senderName: req.user.name,
      title: 'Project Assignment',
      message: `You were assigned as ${role || 'Team Member'} to "${project.name}"`,
      type: 'PROJECT',
      linkId: project._id.toString(),
    });

    emitSocket(req, 'project:updated', project);

    res.status(200).json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/projects/:id/team/:userId
 * Admin only: Remove team member
 */
exports.removeTeamMember = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    project.assignedTeam = project.assignedTeam.filter(
      (m) => m.userId.toString() !== req.params.userId.toString()
    );
    await project.save();

    await logAudit({
      req,
      action: 'EMPLOYEE_REMOVED',
      project,
      description: `Removed team member from project "${project.name}"`,
    });

    emitSocket(req, 'project:updated', project);

    res.status(200).json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/projects/:id/files
 * Upload a document or file with category
 */
exports.uploadProjectFile = async (req, res, next) => {
  try {
    const { name, url, category, size } = req.body;
    if (!name || !url) {
      return res.status(400).json({ success: false, message: 'Name and URL are required' });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const newAttachment = {
      name,
      url,
      category: category || 'Other',
      size: size || 0,
      uploadedBy: req.user._id,
      uploadedByName: req.user.name,
      uploadedAt: new Date(),
    };

    project.attachments.push(newAttachment);
    await project.save();

    await logAudit({
      req,
      action: 'FILE_UPLOADED',
      project,
      description: `Uploaded document "${name}" (${category})`,
      attachment: url,
    });

    emitSocket(req, 'project:updated', project);

    res.status(201).json({ success: true, data: project.attachments });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/projects/:id/files/:fileId
 * Delete project file: Admin or original uploader
 */
exports.deleteProjectFile = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const file = project.attachments.id(req.params.fileId);
    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const isAdmin = req.user.role === 'ADMIN';
    const isOwner = file.uploadedBy?.toString() === req.user._id.toString();

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied. Employees cannot delete admin or company files.',
      });
    }

    file.deleteOne();
    await project.save();

    await logAudit({
      req,
      action: 'FILE_DELETED',
      project,
      description: `Deleted document "${file.name}"`,
    });

    emitSocket(req, 'project:updated', project);

    res.status(200).json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/projects/:id/photos
 * Upload a progress / site photo
 */
exports.uploadProgressPhoto = async (req, res, next) => {
  try {
    const { photoUrl, description, location, category, taskId } = req.body;
    if (!photoUrl) {
      return res.status(400).json({ success: false, message: 'photoUrl is required' });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const photo = await ProjectPhoto.create({
      projectId: project._id,
      projectName: project.name,
      taskId: taskId || null,
      uploadedBy: req.user._id,
      uploadedByName: req.user.name,
      photoUrl,
      description: description || '',
      location: location || null,
      category: category || 'Progress',
      capturedAt: new Date(),
    });

    await logAudit({
      req,
      action: 'PHOTO_UPLOADED',
      project,
      description: `${req.user.name} uploaded site photo: ${description || 'Progress update'}`,
      attachment: photoUrl,
    });

    emitSocket(req, 'project:photo', photo);
    emitSocket(req, 'project:updated', project);

    res.status(201).json({ success: true, data: photo });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/projects/:id/photos
 * Filter by employee, date, category
 */
exports.getProjectPhotos = async (req, res, next) => {
  try {
    const { employeeId, category, date } = req.query;
    const filter = { projectId: req.params.id };

    if (employeeId) filter.uploadedBy = employeeId;
    if (category) filter.category = category;
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      filter.capturedAt = { $gte: start, $lte: end };
    }

    const photos = await ProjectPhoto.find(filter).sort({ capturedAt: -1 });
    res.status(200).json({ success: true, count: photos.length, data: photos });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/projects/:id/timeline
 * Aggregated activity timeline
 */
exports.getProjectTimeline = async (req, res, next) => {
  try {
    const logs = await AuditLog.find({ projectId: req.params.id }).sort({ createdAt: -1 }).limit(50);
    res.status(200).json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/projects/:id/attendance
 * Site check-ins for this project
 */
exports.getProjectAttendance = async (req, res, next) => {
  try {
    const checkIns = await Attendance.find({ projectId: req.params.id })
      .populate('userId', 'name employeeId designation phone')
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({ success: true, data: checkIns });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/projects/convert-quotation/:quotationId
 * Admin only: Convert approved quotation into project
 */
exports.convertQuotationToProject = async (req, res, next) => {
  try {
    const quotation = await Quotation.findById(req.params.quotationId);
    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Quotation not found' });
    }

    // Check if project already created from this quotation
    const existing = await Project.findOne({ quotationId: quotation._id });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Project already created for this quotation (${existing.projectId})`,
        data: existing,
      });
    }

    const count = await Project.countDocuments();
    const projectId = `PR-${String(count + 1).padStart(5, '0')}`;

    const project = await Project.create({
      projectId,
      name: quotation.projectTitle || `${quotation.client.name} - ${quotation.projectType}`,
      client: quotation.client.name,
      clientContact: {
        phone: quotation.client.phone || '',
        email: quotation.client.email || '',
      },
      projectAddress: quotation.siteLocation || quotation.client.address || '',
      projectType: quotation.projectType || 'Interior',
      quotationId: quotation._id,
      quotationNumber: quotation.quotationNumber,
      value: quotation.grandTotal || 0,
      budget: {
        estimatedBudget: quotation.taxableAmount || 0,
        approvedBudget: quotation.grandTotal || 0,
        actualCost: 0,
        revenue: quotation.grandTotal || 0,
        expenses: 0,
        profit: (quotation.grandTotal || 0) - (quotation.taxableAmount || 0),
      },
      paymentSummary: {
        quotationValue: quotation.grandTotal || 0,
        paymentsReceived: 0,
        pendingPayments: quotation.grandTotal || 0,
      },
      status: 'In Progress',
      progress: 0,
      description: quotation.scopeOfWork || `Converted from quotation ${quotation.quotationNumber}`,
      createdBy: req.user._id,
      startDate: new Date().toISOString().split('T')[0],
      expectedCompletionDate: quotation.validUntil
        ? new Date(quotation.validUntil).toISOString().split('T')[0]
        : '',
    });

    // Update quotation status
    quotation.status = 'Converted to Project';
    await quotation.save();

    // Automatically create initial tasks from Quotation items if available
    if (quotation.items && quotation.items.length > 0) {
      let taskCounter = 1;
      for (const item of quotation.items) {
        const taskId = `TSK-${projectId.replace('PR-', '')}-${String(taskCounter++).padStart(3, '0')}`;
        await Task.create({
          taskId,
          projectId: project._id,
          projectName: project.name,
          name: `${item.room}: ${item.name}`,
          description: item.description || `Scope: ${item.quantity} ${item.unit}`,
          assignedTo: req.user._id, // default to creator until re-assigned
          assignedToName: req.user.name,
          status: 'To Do',
          progress: 0,
          createdBy: req.user._id,
        });
      }
      const totalTasks = quotation.items.length;
      project.tasks = totalTasks;
      project.tasksCount = { total: totalTasks, pending: totalTasks, inProgress: 0, completed: 0, blocked: 0 };
      await project.save();
    }

    await logAudit({
      req,
      action: 'QUOTATION_CONVERTED',
      project,
      description: `Converted quotation ${quotation.quotationNumber} into project "${project.name}" (Value: ₹${quotation.grandTotal})`,
    });

    emitSocket(req, 'project:created', project);

    res.status(201).json({
      success: true,
      message: 'Quotation successfully converted to project',
      data: project,
    });
  } catch (error) {
    next(error);
  }
};

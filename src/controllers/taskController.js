const Task = require('../models/Task');
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

// Helper: Recalculate project progress & task counts
const recalculateProjectProgress = async (projectId) => {
  try {
    const tasks = await Task.find({ projectId });
    if (!tasks || tasks.length === 0) return;

    const total = tasks.length;
    let sumProgress = 0;
    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    let blocked = 0;

    tasks.forEach((t) => {
      sumProgress += t.progress || 0;
      if (t.status === 'Completed') completed++;
      else if (t.status === 'In Progress') inProgress++;
      else if (t.status === 'Blocked') blocked++;
      else pending++;
    });

    const averageProgress = Math.round(sumProgress / total);

    const projectUpdates = {
      tasks: total,
      tasksCount: { total, pending, inProgress, completed, blocked },
      progress: averageProgress,
    };

    if (averageProgress === 100) {
      projectUpdates.status = 'Completed';
    } else if (averageProgress > 0 && averageProgress < 100) {
      projectUpdates.status = 'In Progress';
    }

    const updatedProject = await Project.findByIdAndUpdate(projectId, projectUpdates, { new: true });
    return updatedProject;
  } catch (err) {
    console.error('Error recalculating project progress:', err.message);
  }
};

/**
 * GET /api/tasks
 * Filter by projectId, assignedTo, status
 */
exports.getTasks = async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    const { projectId, assignedTo, status } = req.query;

    const filter = {};
    if (projectId) filter.projectId = projectId;
    if (status && status !== 'All') filter.status = status;

    if (!isAdmin) {
      // If employee specifies projectId, check if they are part of that project
      if (projectId) {
        const project = await Project.findById(projectId);
        const isAssignedToProject =
          project &&
          (project.assignedTeam.some((m) => m.userId.toString() === req.user._id.toString()) ||
            project.projectManager?.userId?.toString() === req.user._id.toString());
        if (!isAssignedToProject) {
          return res.status(403).json({ success: false, message: 'Access denied to this project tasks.' });
        }
      } else {
        // If no projectId, employee only sees their own assigned tasks
        filter.assignedTo = req.user._id;
      }
    } else if (assignedTo) {
      filter.assignedTo = assignedTo;
    }

    const tasks = await Task.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: tasks.length, data: tasks });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tasks/:id
 */
exports.getTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const isAdmin = req.user.role === 'ADMIN';
    if (!isAdmin && task.assignedTo.toString() !== req.user._id.toString()) {
      // Also allow if user is on the project team
      const project = await Project.findById(task.projectId);
      const isAssigned =
        project &&
        (project.assignedTeam.some((m) => m.userId.toString() === req.user._id.toString()) ||
          project.projectManager?.userId?.toString() === req.user._id.toString());
      if (!isAssigned) {
        return res.status(403).json({ success: false, message: 'Access denied to this task.' });
      }
    }

    res.status(200).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/tasks
 * Admin or Project Manager
 */
exports.createTask = async (req, res, next) => {
  try {
    const { projectId, name, description, assignedTo, priority, startDate, dueDate } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const isAdmin = req.user.role === 'ADMIN';
    const isPM = project.projectManager?.userId?.toString() === req.user._id.toString();

    if (!isAdmin && !isPM) {
      return res.status(403).json({ success: false, message: 'Only Admins or Project Managers can create tasks.' });
    }

    const assignee = await User.findById(assignedTo);
    if (!assignee) {
      return res.status(404).json({ success: false, message: 'Assigned employee not found' });
    }

    const count = await Task.countDocuments({ projectId });
    const taskId = `TSK-${project.projectId.replace('PR-', '')}-${String(count + 1).padStart(3, '0')}`;

    const task = await Task.create({
      taskId,
      projectId: project._id,
      projectName: project.name,
      name,
      description,
      assignedTo: assignee._id,
      assignedToName: assignee.name,
      priority: priority || 'Medium',
      startDate: startDate || '',
      dueDate: dueDate || '',
      status: 'To Do',
      progress: 0,
      createdBy: req.user._id,
    });

    // Recalculate project stats
    const updatedProject = await recalculateProjectProgress(project._id);

    // Audit log
    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'TASK_CREATED',
      projectId: project._id,
      projectName: project.name,
      description: `Task "${task.name}" created and assigned to ${assignee.name}`,
    });

    // Notify assignee
    await Notification.create({
      recipientId: assignee._id,
      senderId: req.user._id,
      senderName: req.user.name,
      title: 'New Task Assigned',
      message: `You were assigned task "${task.name}" in project "${project.name}"`,
      type: 'TASK',
      linkId: task._id.toString(),
    });

    emitSocket(req, 'task:created', task);
    emitSocket(req, 'project:updated', updatedProject || project);

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/tasks/:id/progress
 * Employee (assigned) or Admin can update progress, status, comment, attachment
 */
exports.updateTaskProgress = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const isAdmin = req.user.role === 'ADMIN';
    const isAssignee = task.assignedTo.toString() === req.user._id.toString();

    if (!isAdmin && !isAssignee) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied. You can only update tasks assigned to you.',
      });
    }

    const { progress, status, comment, attachment } = req.body;
    const oldProgress = task.progress;
    const oldStatus = task.status;

    if (progress !== undefined) {
      task.progress = Number(progress);
      if (Number(progress) === 100) {
        task.status = 'Completed';
      } else if (Number(progress) > 0 && task.status === 'To Do') {
        task.status = 'In Progress';
      }
    }

    if (status !== undefined) {
      task.status = status;
      if (status === 'Completed' && task.progress < 100) {
        task.progress = 100;
      }
    }

    if (comment) {
      task.comments.push({
        authorId: req.user._id,
        authorName: req.user.name,
        text: comment,
        createdAt: new Date(),
      });
    }

    if (attachment && attachment.url) {
      task.attachments.push({
        name: attachment.name || 'Attachment',
        url: attachment.url,
        uploadedBy: req.user._id,
        uploadedByName: req.user.name,
        uploadedAt: new Date(),
      });
    }

    await task.save();

    // Recalculate parent project's overall progress
    const updatedProject = await recalculateProjectProgress(task.projectId);

    // Audit log
    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'TASK_UPDATED',
      projectId: task.projectId,
      projectName: task.projectName,
      description: `${req.user.name} updated "${task.name}": Progress ${task.progress}%, Status: ${task.status}${comment ? ` - "${comment}"` : ''}`,
      oldValue: { progress: oldProgress, status: oldStatus },
      newValue: { progress: task.progress, status: task.status },
    });

    // Notify admins if an employee made the update
    if (!isAdmin) {
      const admins = await User.find({ role: 'ADMIN' });
      for (const admin of admins) {
        await Notification.create({
          recipientId: admin._id,
          senderId: req.user._id,
          senderName: req.user.name,
          title: `Task Progress: ${task.name}`,
          message: `${req.user.name} updated task progress to ${task.progress}% (${task.status}) on ${task.projectName}`,
          type: 'TASK',
          linkId: task._id.toString(),
        });
      }
    }

    emitSocket(req, 'task:updated', task);
    emitSocket(req, 'project:updated', updatedProject);

    res.status(200).json({
      success: true,
      data: task,
      project: updatedProject,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/tasks/:id/comments
 */
exports.addTaskComment = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }

    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    task.comments.push({
      authorId: req.user._id,
      authorName: req.user.name,
      text,
      createdAt: new Date(),
    });
    await task.save();

    emitSocket(req, 'task:updated', task);

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/tasks/:id
 * Admin only
 */
exports.deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const projectId = task.projectId;
    await Task.findByIdAndDelete(req.params.id);

    const updatedProject = await recalculateProjectProgress(projectId);

    emitSocket(req, 'task:deleted', { id: req.params.id });
    emitSocket(req, 'project:updated', updatedProject);

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};

const Task = require('../models/Task');
const Project = require('../models/Project');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const User = require('../models/User');

const fs = require('fs');
const path = require('path');

const emitSocket = (req, event, data) => {
  try {
    const io = req.app.get('io');
    if (io) io.emit(event, data);
  } catch (err) {
    console.error('Socket emit error:', err.message);
  }
};

const googleDriveService = require('../services/googleDrive.service');

// Helper: Save attachment file to Google Drive (Tasks folder)
const saveAttachmentFile = async (att, userId, userName) => {
  if (!att) return null;
  const fileName = att.fileName || att.name || att.originalName || `task_file_${Date.now()}`;
  let fileUrl = att.fileUrl || att.url || att.driveUrl || '';
  let driveFileId = att.driveFileId || '';
  let driveUrl = att.driveUrl || '';
  const fileType = att.fileType || att.mimeType || 'application/octet-stream';
  let fileSize = att.fileSize || 0;

  // If already uploaded to Google Drive
  if (driveFileId && driveUrl) {
    return {
      fileName: fileName,
      originalName: att.originalName || fileName,
      name: fileName,
      driveFileId: driveFileId,
      driveUrl: driveUrl,
      fileUrl: fileUrl || `/api/files/drive/${driveFileId}`,
      url: fileUrl || `/api/files/drive/${driveFileId}`,
      fileType: fileType,
      mimeType: fileType,
      fileSize: fileSize,
      folderType: 'Tasks',
      uploadedBy: userId,
      uploadedByName: userName,
      uploadedAt: att.uploadedAt || new Date(),
    };
  }

  // If base64 or buffer provided, upload to Google Drive
  if (att.base64Data || att.base64 || att.buffer) {
    try {
      let buffer;
      if (att.buffer) {
        buffer = Buffer.from(att.buffer);
      } else {
        const rawData = att.base64Data || att.base64;
        const cleanBase64 = rawData.replace(/^data:[^;]+;base64,/, '');
        buffer = Buffer.from(cleanBase64, 'base64');
      }

      fileSize = buffer.length;

      const driveRes = await googleDriveService.uploadFileToDrive({
        buffer,
        fileName,
        mimeType: fileType,
        folderType: 'Tasks',
      });

      driveFileId = driveRes.driveFileId;
      driveUrl = driveRes.driveUrl;
      fileUrl = `/api/files/drive/${driveFileId}`;
    } catch (err) {
      console.error('[taskController] Drive upload error, using local fallback:', err.message);
      // Fallback local file write if Drive API fails
      try {
        const uploadsDir = path.join(__dirname, '../../uploads/tasks');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        const ext = path.extname(fileName) || '';
        const safeName = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;
        const filePath = path.join(uploadsDir, safeName);
        const rawData = att.base64Data || att.base64;
        const cleanBase64 = rawData.replace(/^data:[^;]+;base64,/, '');
        fs.writeFileSync(filePath, Buffer.from(cleanBase64, 'base64'));
        fileUrl = `uploads/tasks/${safeName}`;
      } catch (localErr) {
        console.error('Failed to write local task attachment fallback:', localErr);
      }
    }
  }

  return {
    fileName: fileName,
    originalName: att.originalName || fileName,
    name: fileName,
    driveFileId: driveFileId,
    driveUrl: driveUrl,
    fileUrl: fileUrl,
    url: fileUrl,
    fileType: fileType,
    mimeType: fileType,
    fileSize: fileSize,
    folderType: 'Tasks',
    uploadedBy: userId,
    uploadedByName: userName,
    uploadedAt: new Date(),
  };
};

// Helper: Recalculate project progress & task counts
const recalculateProjectProgress = async (projectId) => {
  if (!projectId) return null;
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
    if (status && status !== 'All') {
      if (status === 'Pending') filter.status = 'To Do';
      else filter.status = status;
    }

    if (!isAdmin) {
      // Employees ONLY see their own assigned tasks
      filter.assignedTo = req.user._id;
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
      return res.status(403).json({ success: false, message: 'Access denied to this task.' });
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
    console.log('[createTask] req.body:', req.body, 'req.files:', req.files ? req.files.length : 0);
    const { projectId, name, title, description, assignedTo, priority, startDate, dueDate, attachments } = req.body;

    const taskTitle = name || title;
    if (!taskTitle || !assignedTo) {
      return res.status(400).json({ success: false, message: 'Task title and assigned employee are required.' });
    }

    let project = null;
    if (projectId) {
      project = await Project.findById(projectId);
    }

    const isAdmin = req.user.role === 'ADMIN';
    const isPM = project && project.projectManager?.userId?.toString() === req.user._id.toString();

    if (!isAdmin && project && !isPM) {
      return res.status(403).json({ success: false, message: 'Only Admins or Project Managers can create tasks for this project.' });
    }

    const assignee = await User.findById(assignedTo);
    if (!assignee) {
      return res.status(404).json({ success: false, message: 'Assigned employee not found' });
    }

    let taskId = '';
    if (project) {
      const count = await Task.countDocuments({ projectId: project._id });
      taskId = `TSK-${(project.projectId || 'PRJ').replace('PR-', '')}-${String(count + 1).padStart(3, '0')}`;
    } else {
      const count = await Task.countDocuments({ projectId: null });
      taskId = `TSK-GEN-${String(count + 1).padStart(3, '0')}`;
    }

    // Process attachment files (from req.files multipart upload or req.body.attachments)
    const processedAttachments = [];

    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files) {
        const saved = await saveAttachmentFile(
          {
            fileName: file.originalname,
            originalName: file.originalname,
            buffer: file.buffer,
            fileType: file.mimetype,
            fileSize: file.size,
          },
          req.user._id,
          req.user.name
        );
        if (saved) processedAttachments.push(saved);
      }
    }

    if (Array.isArray(attachments)) {
      for (const att of attachments) {
        const saved = await saveAttachmentFile(att, req.user._id, req.user.name);
        if (saved) processedAttachments.push(saved);
      }
    }

    const task = await Task.create({
      taskId,
      projectId: project ? project._id : null,
      projectName: project ? project.name : 'General Operations',
      name: taskTitle,
      description: description || '',
      assignedTo: assignee._id,
      assignedToName: assignee.name,
      priority: priority || 'Medium',
      startDate: startDate || '',
      dueDate: dueDate || '',
      status: 'To Do',
      progress: 0,
      attachments: processedAttachments,
      createdBy: req.user._id,
    });

    // Recalculate project stats if associated with a project
    let updatedProject = null;
    if (project) {
      updatedProject = await recalculateProjectProgress(project._id);
    }

    // Audit log
    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'TASK_CREATED',
      projectId: project ? project._id : null,
      projectName: project ? project.name : 'General Operations',
      description: `Task "${task.name}" created and assigned to ${assignee.name}`,
    });

    // Notify assignee
    await Notification.create({
      recipientId: assignee._id,
      senderId: req.user._id,
      senderName: req.user.name,
      title: 'New Task Assigned',
      message: `You were assigned task "${task.name}" ${project ? `in project "${project.name}"` : ''}`,
      type: 'TASK',
      linkId: task._id.toString(),
    });

    emitSocket(req, 'task:created', task);
    if (updatedProject) {
      emitSocket(req, 'project:updated', updatedProject);
    }

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

    const { progress, status, comment, attachment, attachments } = req.body;
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
      let mappedStatus = status;
      if (status === 'Pending') mappedStatus = 'To Do';
      task.status = mappedStatus;
      if (mappedStatus === 'Completed' && task.progress < 100) {
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

    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files) {
        const saved = await saveAttachmentFile(
          {
            fileName: file.originalname,
            originalName: file.originalname,
            buffer: file.buffer,
            fileType: file.mimetype,
            fileSize: file.size,
          },
          req.user._id,
          req.user.name
        );
        if (saved) task.attachments.push(saved);
      }
    }

    if (attachment) {
      const saved = await saveAttachmentFile(attachment, req.user._id, req.user.name);
      if (saved) task.attachments.push(saved);
    }

    if (Array.isArray(attachments)) {
      for (const att of attachments) {
        const saved = await saveAttachmentFile(att, req.user._id, req.user.name);
        if (saved) task.attachments.push(saved);
      }
    }

    await task.save();

    // Recalculate parent project's overall progress if linked
    let updatedProject = null;
    if (task.projectId) {
      updatedProject = await recalculateProjectProgress(task.projectId);
    }

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

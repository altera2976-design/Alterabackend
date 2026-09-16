const ProjectRoom = require('../models/ProjectRoom');
const BOQItem = require('../models/BOQItem');
const Measurement = require('../models/Measurement');
const Design = require('../models/Design');
const Material = require('../models/Material');
const Procurement = require('../models/Procurement');
const SiteVisit = require('../models/SiteVisit');
const Team = require('../models/Team');
const LeaveRequest = require('../models/LeaveRequest');
const Project = require('../models/Project');
const Task = require('../models/Task');
const AuditLog = require('../models/AuditLog');

// ==========================================
// 1. PROJECT ROOMS / AREAS
// ==========================================

exports.getProjectRooms = async (req, res, next) => {
  try {
    const rooms = await ProjectRoom.find({ projectId: req.params.projectId }).sort({ createdAt: 1 });
    res.status(200).json({ success: true, count: rooms.length, data: rooms });
  } catch (error) {
    next(error);
  }
};

exports.createProjectRoom = async (req, res, next) => {
  try {
    const room = await ProjectRoom.create({
      ...req.body,
      projectId: req.params.projectId,
    });
    res.status(201).json({ success: true, data: room });
  } catch (error) {
    next(error);
  }
};

exports.updateProjectRoom = async (req, res, next) => {
  try {
    const room = await ProjectRoom.findByIdAndUpdate(req.params.roomId, req.body, {
      new: true,
      runValidators: true,
    });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    res.status(200).json({ success: true, data: room });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2. BOQ / SCOPE OF WORK
// ==========================================

exports.getBOQItems = async (req, res, next) => {
  try {
    const items = await BOQItem.find({ projectId: req.params.projectId }).sort({ createdAt: 1 });
    const totalAmount = items.reduce((acc, it) => acc + (it.amount || 0), 0);
    res.status(200).json({ success: true, count: items.length, totalAmount, data: items });
  } catch (error) {
    next(error);
  }
};

exports.createBOQItem = async (req, res, next) => {
  try {
    const amount = (req.body.quantity || 1) * (req.body.rate || 0);
    const item = await BOQItem.create({
      ...req.body,
      amount,
      projectId: req.params.projectId,
    });
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

exports.updateBOQItem = async (req, res, next) => {
  try {
    if (req.body.quantity || req.body.rate) {
      const q = req.body.quantity || 1;
      const r = req.body.rate || 0;
      req.body.amount = q * r;
    }
    const item = await BOQItem.findByIdAndUpdate(req.params.boqId, req.body, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'BOQ item not found' });
    res.status(200).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

exports.deleteBOQItem = async (req, res, next) => {
  try {
    const item = await BOQItem.findByIdAndDelete(req.params.boqId);
    if (!item) return res.status(404).json({ success: false, message: 'BOQ item not found' });
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 3. MEASUREMENTS
// ==========================================

exports.getMeasurements = async (req, res, next) => {
  try {
    const measurements = await Measurement.find({ projectId: req.params.projectId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: measurements.length, data: measurements });
  } catch (error) {
    next(error);
  }
};

exports.createMeasurement = async (req, res, next) => {
  try {
    const length = Number(req.body.length) || 0;
    const width = Number(req.body.width) || 0;
    const area = Number((length * width).toFixed(2));

    const measurement = await Measurement.create({
      ...req.body,
      area,
      projectId: req.params.projectId,
      measuredBy: req.user?._id,
      measuredByName: req.user?.name || 'Site Supervisor',
    });
    res.status(201).json({ success: true, data: measurement });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 4. DESIGNS (FLOOR PLANS, 3D, ELEVATIONS)
// ==========================================

exports.getDesigns = async (req, res, next) => {
  try {
    const designs = await Design.find({ projectId: req.params.projectId }).sort({ version: -1 });
    res.status(200).json({ success: true, count: designs.length, data: designs });
  } catch (error) {
    next(error);
  }
};

exports.createDesign = async (req, res, next) => {
  try {
    const design = await Design.create({
      ...req.body,
      projectId: req.params.projectId,
      designerId: req.user?._id,
      designerName: req.user?.name || 'Architect',
    });

    await AuditLog.create({
      action: 'DESIGN_UPLOADED',
      actor: req.user?.name || 'Admin',
      details: `Uploaded ${design.type}: ${design.title}`,
      targetId: design._id,
      targetModel: 'Design',
    }).catch(() => {});

    res.status(201).json({ success: true, data: design });
  } catch (error) {
    next(error);
  }
};

exports.updateDesignApproval = async (req, res, next) => {
  try {
    const { clientApprovalStatus, clientFeedback } = req.body;
    const design = await Design.findByIdAndUpdate(
      req.params.designId,
      {
        clientApprovalStatus,
        clientFeedback: clientFeedback || '',
        approvalDate: clientApprovalStatus === 'Client Approved' ? new Date() : undefined,
      },
      { new: true }
    );
    if (!design) return res.status(404).json({ success: false, message: 'Design not found' });
    res.status(200).json({ success: true, data: design });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 5. MATERIALS CATALOG
// ==========================================

exports.getMaterials = async (req, res, next) => {
  try {
    const { category, search } = req.query;
    const filter = {};
    if (category && category !== 'All') filter.category = category;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { supplier: { $regex: search, $options: 'i' } },
      ];
    }
    const materials = await Material.find(filter).sort({ name: 1 });
    res.status(200).json({ success: true, count: materials.length, data: materials });
  } catch (error) {
    next(error);
  }
};

exports.createMaterial = async (req, res, next) => {
  try {
    const material = await Material.create(req.body);
    res.status(201).json({ success: true, data: material });
  } catch (error) {
    next(error);
  }
};

exports.updateMaterial = async (req, res, next) => {
  try {
    const material = await Material.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!material) return res.status(404).json({ success: false, message: 'Material not found' });
    res.status(200).json({ success: true, data: material });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 6. PROCUREMENT / PURCHASE ORDERS
// ==========================================

exports.getProcurements = async (req, res, next) => {
  try {
    const { projectId, deliveryStatus } = req.query;
    const filter = {};
    if (projectId) filter.projectId = projectId;
    if (deliveryStatus && deliveryStatus !== 'All') filter.deliveryStatus = deliveryStatus;

    const procurements = await Procurement.find(filter).sort({ orderDate: -1 });
    const totalProcurementCost = procurements.reduce((acc, p) => acc + (p.totalCost || 0), 0);

    res.status(200).json({ success: true, count: procurements.length, totalProcurementCost, data: procurements });
  } catch (error) {
    next(error);
  }
};

exports.createProcurement = async (req, res, next) => {
  try {
    const totalCost = (req.body.quantity || 1) * (req.body.purchasePrice || 0);
    const po = await Procurement.create({
      ...req.body,
      totalCost,
    });
    res.status(201).json({ success: true, data: po });
  } catch (error) {
    next(error);
  }
};

exports.updateProcurementStatus = async (req, res, next) => {
  try {
    const { deliveryStatus, actualDeliveryDate, paymentStatus } = req.body;
    const po = await Procurement.findByIdAndUpdate(
      req.params.id,
      {
        ...(deliveryStatus ? { deliveryStatus } : {}),
        ...(actualDeliveryDate ? { actualDeliveryDate } : {}),
        ...(paymentStatus ? { paymentStatus } : {}),
      },
      { new: true }
    );
    if (!po) return res.status(404).json({ success: false, message: 'Procurement order not found' });
    res.status(200).json({ success: true, data: po });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 7. SITE VISITS & GPS
// ==========================================

exports.getSiteVisits = async (req, res, next) => {
  try {
    const visits = await SiteVisit.find({ projectId: req.params.projectId }).sort({ visitDate: -1 });
    res.status(200).json({ success: true, count: visits.length, data: visits });
  } catch (error) {
    next(error);
  }
};

exports.createSiteVisit = async (req, res, next) => {
  try {
    const visit = await SiteVisit.create({
      ...req.body,
      projectId: req.params.projectId,
      employeeId: req.user?._id,
      employeeName: req.user?.name || 'Site Supervisor',
    });

    await AuditLog.create({
      action: 'SITE_VISIT_LOGGED',
      actor: req.user?.name || 'Site Supervisor',
      details: `Logged site visit with ${visit.sitePhotos?.length || 0} photos`,
      targetId: visit._id,
      targetModel: 'SiteVisit',
    }).catch(() => {});

    res.status(201).json({ success: true, data: visit });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 8. TEAMS & EMPLOYEE ASSIGNMENTS
// ==========================================

exports.getTeams = async (req, res, next) => {
  try {
    const teams = await Team.find()
      .populate('teamLeader', 'name email phone role')
      .populate('members', 'name email phone role department designation')
      .populate('activeProjects', 'name projectId client status');
    res.status(200).json({ success: true, count: teams.length, data: teams });
  } catch (error) {
    next(error);
  }
};

exports.createTeam = async (req, res, next) => {
  try {
    const team = await Team.create(req.body);
    res.status(201).json({ success: true, data: team });
  } catch (error) {
    next(error);
  }
};

// Employee Assignment: Employee -> Project -> Room -> Task
exports.assignEmployeeHierarchy = async (req, res, next) => {
  try {
    const { employeeId, employeeName, projectId, roomId, taskTitle, priority, dueDate } = req.body;

    // 1. Assign to Project teamMembers if not already added
    if (projectId) {
      const project = await Project.findById(projectId);
      if (project) {
        const alreadyInTeam = project.teamMembers?.some((m) => m.user?.toString() === employeeId.toString());
        if (!alreadyInTeam) {
          project.teamMembers.push({
            user: employeeId,
            name: employeeName,
            role: req.body.role || 'Site Supervisor',
          });
          await project.save();
        }
      }
    }

    // 2. Assign to Room if provided
    if (roomId) {
      await ProjectRoom.findByIdAndUpdate(roomId, {
        assignedEmployee: employeeId,
        assignedEmployeeName: employeeName,
      });
    }

    // 3. Create Task if task details provided
    let task = null;
    if (taskTitle && projectId) {
      task = await Task.create({
        title: taskTitle,
        description: req.body.description || `Assigned to work on room / project`,
        projectId,
        assignedTo: employeeId,
        assignedToName: employeeName,
        priority: priority || 'Medium',
        dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'PENDING',
      });
    }

    // Audit Log
    await AuditLog.create({
      action: 'EMPLOYEE_ASSIGNED',
      actor: req.user?.name || 'Admin',
      details: `Assigned ${employeeName} to Project ID ${projectId}`,
      targetId: employeeId,
      targetModel: 'User',
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Employee successfully assigned across Project, Room, and Task!',
      task,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 9. LEAVE MANAGEMENT
// ==========================================

exports.getLeaves = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && status !== 'All') filter.status = status;

    const leaves = await LeaveRequest.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: leaves.length, data: leaves });
  } catch (error) {
    next(error);
  }
};

exports.createLeave = async (req, res, next) => {
  try {
    const leave = await LeaveRequest.create({
      ...req.body,
      userId: req.user?._id,
      employeeName: req.user?.name || 'Employee',
    });
    res.status(201).json({ success: true, data: leave });
  } catch (error) {
    next(error);
  }
};

exports.updateLeaveStatus = async (req, res, next) => {
  try {
    const { status, rejectionReason } = req.body;
    const leave = await LeaveRequest.findByIdAndUpdate(
      req.params.id,
      {
        status,
        approvedBy: req.user?._id,
        approvedByName: req.user?.name || 'Admin',
        approvalDate: new Date(),
        ...(rejectionReason ? { rejectionReason } : {}),
      },
      { new: true }
    );
    if (!leave) return res.status(404).json({ success: false, message: 'Leave request not found' });
    res.status(200).json({ success: true, data: leave });
  } catch (error) {
    next(error);
  }
};

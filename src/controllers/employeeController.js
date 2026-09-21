const User = require('../models/User');
const { generateEmployeeId } = require('../services/employeeIdService');
const { AppError } = require('../middleware/errorHandler');
const { isPasswordCompromised } = require('../utils/hibp');

const ALLOWED_ROLES = ["SUPER_ADMIN", "ADMIN", "SALES", "MANAGER", "DESIGNER", "PROJECT_MANAGER", "EMPLOYEE"];

/**
 * GET /api/employees
 * Admin only — get all employees with optional role, search + status filter
 */
exports.getAllEmployees = async (req, res, next) => {
  try {
    const { search, status, role } = req.query;

    const filter = {};

    if (role && role.toUpperCase() !== 'ALL') {
      filter.role = role.toUpperCase();
    }

    if (status && ['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
      filter.status = status.toUpperCase();
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { employeeId: searchRegex },
        { department: searchRegex },
        { designation: searchRegex },
      ];
    }

    const employees = await User.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: employees.length,
      employees,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/employees
 * Admin only — create a new user/employee/admin
 */
exports.createEmployee = async (req, res, next) => {
  try {
    const { name, email, password, phone, role, department, designation, joiningDate, salary, workingHours, isAdminPanelEnabled, permissions } = req.body;

    const targetEmail = (email || '').toLowerCase().trim();
    const existingUser = await User.findOne({ email: targetEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: `An account with email '${targetEmail}' already exists (Current Role: ${existingUser.role}). You can update their role from the table.`
      });
    }

    const isCompromised = await isPasswordCompromised(password);
    const requesterIsSuper = req.user?.role === 'SUPER_ADMIN' || req.user?.email === 'admin@alterainterior.com' || req.user?.email === 'admin@company.com';

    if (isCompromised && !requesterIsSuper) {
      return res.status(400).json({
        success: false,
        message: 'This password has appeared in a data breach. Please choose a stronger password.'
      });
    }


    // Auto-generate unique employee ID
    const employeeId = await generateEmployeeId();

    const userRole = role && ALLOWED_ROLES.includes(role.toUpperCase()) ? role.toUpperCase() : 'EMPLOYEE';

    const defaultPermissions = {
      dashboard: true,
      tasks: true,
      crm: true,
      projects: true,
      salary: true,
      attendance: true,
      quotation: true,
      reports: true,
      administration: true,
    };

    const employee = await User.create({
      name: (name || '').trim(),
      email: targetEmail,
      password,
      phone: phone || '',
      role: userRole,
      employeeId,
      department: department || '',
      designation: designation || '',
      joiningDate: joiningDate || new Date(),
      salary: salary || 0,
      workingHours: workingHours || 8,
      status: 'ACTIVE',
      isAdminPanelEnabled: isAdminPanelEnabled !== undefined ? Boolean(isAdminPanelEnabled) : (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN'),
      permissions: permissions ? { ...defaultPermissions, ...permissions } : defaultPermissions,
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('employee_updated', { type: 'CREATED', employee });
      io.emit('dashboard_updated', { type: 'EMPLOYEE_CREATED' });
    }

    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      employee,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/employees/:id
 * Admin only — get a single employee by ID
 */
exports.getEmployee = async (req, res, next) => {
  try {
    const employee = await User.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.status(200).json({
      success: true,
      employee,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/employees/:id
 * Admin only — update user details (including role, panel access, permissions)
 */
exports.updateEmployee = async (req, res, next) => {
  try {
    const { name, email, phone, role, department, designation, joiningDate, salary, workingHours, status, isAdminPanelEnabled, permissions, password } = req.body;

    const user = await User.findById(req.params.id).select('+password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const requesterIsSuper = req.user?.role === 'SUPER_ADMIN' || req.user?.email === 'admin@alterainterior.com' || req.user?.email === 'admin@company.com';
    const targetIsSuper = user.role === 'SUPER_ADMIN' || user.email === 'admin@alterainterior.com' || user.email === 'admin@company.com';

    if (targetIsSuper && !requesterIsSuper) {
      return res.status(403).json({ success: false, message: 'Only Super Admin can modify a Super Admin account.' });
    }

    if (role && role.toUpperCase() === 'SUPER_ADMIN' && !requesterIsSuper) {
      return res.status(403).json({ success: false, message: 'Only Super Admin can assign the Super Admin role.' });
    }

    if (name !== undefined) user.name = name;
    if (email !== undefined && email.trim()) user.email = email.toLowerCase().trim();
    if (phone !== undefined) user.phone = phone;
    if (role !== undefined && ALLOWED_ROLES.includes(role.toUpperCase())) {
      user.role = role.toUpperCase();
    }
    if (department !== undefined) user.department = department;
    if (designation !== undefined) user.designation = designation;
    if (joiningDate !== undefined) user.joiningDate = joiningDate;
    if (salary !== undefined) user.salary = salary;
    if (workingHours !== undefined) user.workingHours = workingHours;
    if (status !== undefined && ['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
      user.status = status.toUpperCase();
    }
    if (isAdminPanelEnabled !== undefined) user.isAdminPanelEnabled = Boolean(isAdminPanelEnabled);
    if (permissions !== undefined) user.permissions = permissions;
    if (password && password.length >= 6) {
      user.password = password; // Pre-save hook will hash password automatically with bcryptjs
    }

    await user.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('employee_updated', { type: 'UPDATED', employee: user });
      io.emit('dashboard_updated', { type: 'EMPLOYEE_UPDATED' });
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully.',
      employee: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/employees/:id/status
 * Admin only — toggle user status between ACTIVE and INACTIVE
 */
exports.toggleStatus = async (req, res, next) => {
  try {
    const employee = await User.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (req.body && req.body.status && ['ACTIVE', 'INACTIVE'].includes(req.body.status.toUpperCase())) {
      employee.status = req.body.status.toUpperCase();
    } else {
      employee.status = employee.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    }
    await employee.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('employee_updated', { type: 'STATUS_TOGGLED', employee });
      io.emit('dashboard_updated', { type: 'EMPLOYEE_STATUS' });
    }

    res.status(200).json({
      success: true,
      message: `User account status set to ${employee.status} successfully.`,
      employee,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/employees/:id/reset-password
 * Super Admin only — reset password for user
 */
exports.resetPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const user = await User.findById(req.params.id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    user.password = password; // Pre-save hook will hash password automatically with bcryptjs
    await user.save();

    res.status(200).json({
      success: true,
      message: `Password reset successfully for ${user.name}.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/employees/:id/panel-access
 * Super Admin only — toggle Admin Panel access for user
 */
exports.togglePanelAccess = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (req.body.isAdminPanelEnabled !== undefined) {
      user.isAdminPanelEnabled = Boolean(req.body.isAdminPanelEnabled);
    } else {
      user.isAdminPanelEnabled = !user.isAdminPanelEnabled;
    }
    await user.save();

    res.status(200).json({
      success: true,
      message: `Admin Panel access ${user.isAdminPanelEnabled ? 'enabled' : 'disabled'} for ${user.name}.`,
      employee: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/employees/:id
 * Super Admin only — delete/remove user account permanently
 */
exports.deleteEmployee = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (user.role === 'SUPER_ADMIN' || user.email === 'admin@alterainterior.com' || user.email === 'admin@company.com') {
      return res.status(403).json({ success: false, message: 'Primary Super Admin account cannot be deleted.' });
    }

    await User.findByIdAndDelete(req.params.id);

    const io = req.app.get('io');
    if (io) {
      io.emit('employee_updated', { type: 'DELETED', userId: req.params.id });
      io.emit('dashboard_updated', { type: 'EMPLOYEE_DELETED' });
    }

    res.status(200).json({
      success: true,
      message: `User '${user.name}' has been deleted successfully.`,
    });
  } catch (error) {
    next(error);
  }
};


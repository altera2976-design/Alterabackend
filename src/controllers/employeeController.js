const User = require('../models/User');
const { generateEmployeeId } = require('../services/employeeIdService');
const { AppError } = require('../middleware/errorHandler');
const { isPasswordCompromised } = require('../utils/hibp');

/**
 * GET /api/employees
 * Admin only — get all employees with optional search + status filter
 */
exports.getAllEmployees = async (req, res, next) => {
  try {
    const { search, status } = req.query;

    // Build query filter — always exclude ADMINs
    const filter = { role: 'EMPLOYEE' };

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
 * Admin only — create a new employee
 */
exports.createEmployee = async (req, res, next) => {
  try {
    const { name, email, password, phone, department, designation, joiningDate, salary, workingHours } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }

    const isCompromised = await isPasswordCompromised(password);
    if (isCompromised) {
      return res.status(400).json({ 
        success: false, 
        message: 'This password has appeared in a data breach. Please choose a stronger password.' 
      });
    }

    // Auto-generate unique employee ID
    const employeeId = await generateEmployeeId();

    const employee = await User.create({
      name,
      email,
      password,
      phone: phone || '',
      role: 'EMPLOYEE',
      employeeId,
      department: department || '',
      designation: designation || '',
      joiningDate: joiningDate || new Date(),
      salary: salary || 0,
      workingHours: workingHours || 8,
      status: 'ACTIVE',
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('employee_updated', { type: 'CREATED', employee });
      io.emit('dashboard_updated', { type: 'EMPLOYEE_CREATED' });
    }

    res.status(201).json({
      success: true,
      message: 'Employee created successfully.',
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
    const employee = await User.findOne({ _id: req.params.id, role: 'EMPLOYEE' });

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
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
 * Admin only — update employee details (not role or password)
 */
exports.updateEmployee = async (req, res, next) => {
  try {
    // Whitelist allowed update fields
    const { name, phone, department, designation, joiningDate, salary, workingHours } = req.body;

    const allowedUpdates = {};
    if (name !== undefined) allowedUpdates.name = name;
    if (phone !== undefined) allowedUpdates.phone = phone;
    if (department !== undefined) allowedUpdates.department = department;
    if (designation !== undefined) allowedUpdates.designation = designation;
    if (joiningDate !== undefined) allowedUpdates.joiningDate = joiningDate;
    if (salary !== undefined) allowedUpdates.salary = salary;
    if (workingHours !== undefined) allowedUpdates.workingHours = workingHours;

    const employee = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'EMPLOYEE' },
      allowedUpdates,
      { new: true, runValidators: true }
    );

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('employee_updated', { type: 'UPDATED', employee });
      io.emit('dashboard_updated', { type: 'EMPLOYEE_UPDATED' });
    }

    res.status(200).json({
      success: true,
      message: 'Employee updated successfully.',
      employee,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/employees/:id/status
 * Admin only — toggle employee status between ACTIVE and INACTIVE
 */
exports.toggleStatus = async (req, res, next) => {
  try {
    const employee = await User.findOne({ _id: req.params.id, role: 'EMPLOYEE' });

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    employee.status = employee.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await employee.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('employee_updated', { type: 'STATUS_TOGGLED', employee });
      io.emit('dashboard_updated', { type: 'EMPLOYEE_STATUS' });
    }

    res.status(200).json({
      success: true,
      message: `Employee ${employee.status === 'ACTIVE' ? 'activated' : 'deactivated'} successfully.`,
      employee,
    });
  } catch (error) {
    next(error);
  }
};

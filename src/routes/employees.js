const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const employeeController = require('../controllers/employeeController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

const taskController = require('../controllers/taskController');

// All routes require authentication
router.use(protect);

// Employee App Permissions routes
router.get('/permissions', employeeController.getMyAppPermissions);
router.get('/my-permissions', employeeController.getMyAppPermissions);
router.get('/tasks', taskController.getEmployeeTasks);

// GET /api/employees & GET /api/users (Accessible for employee lists & dropdowns)
router.get('/', employeeController.getAllEmployees);
router.get('/:id/app-permissions', authorize('ADMIN'), employeeController.getEmployeeAppPermissions);
router.put('/:id/app-permissions', authorize('ADMIN'), employeeController.updateAppPermissions);
router.post('/:id/app-permissions', authorize('ADMIN'), employeeController.updateAppPermissions);
router.patch('/:id/app-permissions', authorize('ADMIN'), employeeController.updateAppPermissions);
router.put('/permissions/:employeeId', authorize('ADMIN'), employeeController.updateAppPermissions);
router.post('/permissions/:employeeId', authorize('ADMIN'), employeeController.updateAppPermissions);
router.patch('/permissions/:employeeId', authorize('ADMIN'), employeeController.updateAppPermissions);
router.get('/:id', employeeController.getEmployee);

// POST /api/employees
router.post(
  '/',
  authorize('ADMIN'),
  [
    body('name').notEmpty().trim().withMessage('Name is required'),
    body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail({ gmail_remove_dots: false }),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
  ],
  validate,
  employeeController.createEmployee
);

// PUT /api/employees/:id
router.put('/:id', authorize('ADMIN'), employeeController.updateEmployee);

// Account Status — support PUT, POST, PATCH
router.put('/:id/status', authorize('ADMIN'), employeeController.toggleStatus);
router.post('/:id/status', authorize('ADMIN'), employeeController.toggleStatus);
router.patch('/:id/status', authorize('ADMIN'), employeeController.toggleStatus);

// Reset Password — support PUT, POST, PATCH
router.put('/:id/reset-password', authorize('ADMIN'), employeeController.resetPassword);
router.post('/:id/reset-password', authorize('ADMIN'), employeeController.resetPassword);
router.patch('/:id/reset-password', authorize('ADMIN'), employeeController.resetPassword);

// Access Status — support PUT, POST, PATCH
router.put('/:id/access-status', authorize('ADMIN'), employeeController.updateAccessStatus);
router.post('/:id/access-status', authorize('ADMIN'), employeeController.updateAccessStatus);
router.patch('/:id/access-status', authorize('ADMIN'), employeeController.updateAccessStatus);

// Salary Setup — support PUT, POST, PATCH
router.put('/:id/salary-setup', authorize('ADMIN'), employeeController.updateSalarySetup);
router.post('/:id/salary-setup', authorize('ADMIN'), employeeController.updateSalarySetup);
router.patch('/:id/salary-setup', authorize('ADMIN'), employeeController.updateSalarySetup);

// Panel Access — support PUT, POST, PATCH
router.put('/:id/panel-access', authorize('ADMIN'), employeeController.togglePanelAccess);
router.post('/:id/panel-access', authorize('ADMIN'), employeeController.togglePanelAccess);
router.patch('/:id/panel-access', authorize('ADMIN'), employeeController.togglePanelAccess);

// Delete user account — support DELETE, POST, PUT
router.delete('/:id', authorize('ADMIN'), employeeController.deleteEmployee);
router.post('/:id/delete', authorize('ADMIN'), employeeController.deleteEmployee);
router.put('/:id/delete', authorize('ADMIN'), employeeController.deleteEmployee);

const upload = require('../middleware/upload');

// Employee Documents routes
router.get('/:id/documents', employeeController.getEmployeeDocuments);
router.post('/:id/documents', upload.array('files', 10), employeeController.uploadEmployeeDocument);

module.exports = router;

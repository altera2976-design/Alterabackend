const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const employeeController = require('../controllers/employeeController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

// All routes require authentication AND ADMIN role
router.use(protect, authorize('ADMIN'));

// GET /api/employees
router.get('/', employeeController.getAllEmployees);

// POST /api/employees
router.post(
  '/',
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

// GET /api/employees/:id
router.get('/:id', employeeController.getEmployee);

// PUT /api/employees/:id
router.put('/:id', employeeController.updateEmployee);

// Account Status — support PUT, POST, PATCH
router.put('/:id/status', employeeController.toggleStatus);
router.post('/:id/status', employeeController.toggleStatus);
router.patch('/:id/status', employeeController.toggleStatus);

// Reset Password — support PUT, POST, PATCH
router.put('/:id/reset-password', employeeController.resetPassword);
router.post('/:id/reset-password', employeeController.resetPassword);
router.patch('/:id/reset-password', employeeController.resetPassword);

// Panel Access — support PUT, POST, PATCH
router.put('/:id/panel-access', employeeController.togglePanelAccess);
router.post('/:id/panel-access', employeeController.togglePanelAccess);
// Delete user account — support DELETE, POST, PUT
router.delete('/:id', employeeController.deleteEmployee);
router.post('/:id/delete', employeeController.deleteEmployee);
router.put('/:id/delete', employeeController.deleteEmployee);

module.exports = router;

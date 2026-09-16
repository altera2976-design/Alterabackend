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

// PATCH /api/employees/:id/status
router.patch('/:id/status', employeeController.toggleStatus);

module.exports = router;

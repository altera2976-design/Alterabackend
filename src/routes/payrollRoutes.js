const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const payrollController = require('../controllers/payrollController');

// ── CALCULATION & QUERY ROUTES ─────────────────────────────────────────────
// Admins see all employees; Employees see only themselves (enforced in controller)
router.get('/calculate', protect, payrollController.calculatePayroll);
router.get('/', protect, payrollController.calculatePayroll);
router.get('/employee/:id', protect, payrollController.getEmployeeSalaryDetail);

// ── ADMIN PAYROLL ACTIONS ──────────────────────────────────────────────────
router.post('/approve', protect, authorize('ADMIN'), payrollController.approvePayroll);
router.post('/pay', protect, authorize('ADMIN'), payrollController.markPayrollPaid);
router.put('/employee-salary/:id', protect, authorize('ADMIN'), payrollController.updateEmployeeSalaryStructure);

// ── PAYSLIP DISPATCH ───────────────────────────────────────────────────────
router.post('/send-payslip', protect, payrollController.sendPayslip);

// ── PAYROLL CONFIGURATION (WORKING DAYS, HOLIDAYS, RULES) ──────────────────
router.get('/config', protect, payrollController.getPayrollConfigHandler);
router.put('/config', protect, authorize('ADMIN'), payrollController.updatePayrollConfigHandler);

module.exports = router;

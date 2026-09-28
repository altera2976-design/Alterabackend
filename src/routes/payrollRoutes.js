const express = require('express');
const router = express.Router();
const { protect, checkPermission } = require('../middleware/auth');
const payrollController = require('../controllers/payrollController');

// ── CALCULATION & QUERY ROUTES ─────────────────────────────────────────────
router.get('/calculate', protect, checkPermission('payroll', 'view'), payrollController.calculatePayroll);
router.get('/', protect, checkPermission('payroll', 'view'), payrollController.calculatePayroll);
router.get('/employee/:id', protect, checkPermission('payroll', 'view'), payrollController.getEmployeeSalaryDetail);

// ── ADMIN PAYROLL ACTIONS ──────────────────────────────────────────────────
router.post('/approve', protect, checkPermission('payroll', 'edit'), payrollController.approvePayroll);
router.post('/pay', protect, checkPermission('payroll', 'edit'), payrollController.markPayrollPaid);
router.put('/employee-salary/:id', protect, checkPermission('payroll', 'edit'), payrollController.updateEmployeeSalaryStructure);

// ── PAYSLIP DISPATCH ───────────────────────────────────────────────────────
router.post('/send-payslip', protect, checkPermission('payroll', 'edit'), payrollController.sendPayslip);

// ── PAYROLL CONFIGURATION (WORKING DAYS, HOLIDAYS, RULES) ──────────────────
router.get('/config', protect, checkPermission('payroll', 'view'), payrollController.getPayrollConfigHandler);
router.put('/config', protect, checkPermission('payroll', 'edit'), payrollController.updatePayrollConfigHandler);

module.exports = router;

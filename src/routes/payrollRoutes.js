const express = require('express');
const router = express.Router();
const { protect, checkPermission } = require('../middleware/auth');
const payrollController = require('../controllers/payrollController');

// ── CALCULATION & QUERY ROUTES ─────────────────────────────────────────────
router.get('/calculate', protect, checkPermission('payroll', 'view'), payrollController.calculatePayroll);
router.get('/', protect, checkPermission('payroll', 'view'), payrollController.calculatePayroll);
router.get('/salaries', protect, checkPermission('payroll', 'view'), payrollController.getAllSalaries);
router.get('/employee/:id', protect, checkPermission('payroll', 'view'), payrollController.getEmployeeSalaryDetail);

// ── ADMIN PAYROLL ACTIONS ──────────────────────────────────────────────────
router.post('/approve', protect, checkPermission('payroll', 'edit'), payrollController.approvePayroll);
router.post('/pay', protect, checkPermission('payroll', 'edit'), payrollController.markPayrollPaid);
router.put('/employee-salary/:id', protect, checkPermission('payroll', 'edit'), payrollController.updateEmployeeSalaryStructure);
router.delete('/employee-salary/:id', protect, checkPermission('payroll', 'edit'), payrollController.deleteEmployeeSalaryStructure);

// ── EDIT & DELETE PAYROLL RECORDS ───────────────────────────────────────────
router.put('/:id', protect, checkPermission('payroll', 'edit'), payrollController.updatePayrollRecord);
router.delete('/:id', protect, checkPermission('payroll', 'edit'), payrollController.deletePayrollRecord);

// ── PAYSLIP DISPATCH ───────────────────────────────────────────────────────
router.post('/send-payslip', protect, checkPermission('payroll', 'edit'), payrollController.sendPayslip);

// ── PAYROLL CONFIGURATION (WORKING DAYS, HOLIDAYS, RULES) ──────────────────
router.get('/config', protect, checkPermission('payroll', 'view'), payrollController.getPayrollConfigHandler);
router.put('/config', protect, checkPermission('payroll', 'edit'), payrollController.updatePayrollConfigHandler);

module.exports = router;

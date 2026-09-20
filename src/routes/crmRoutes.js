const express = require('express');
const router = express.Router();
const crmController = require('../controllers/crmController');
const { protect, checkPermission } = require('../middleware/auth');

router.use(protect);

// Leads
router.get('/leads', checkPermission('crm', 'view'), crmController.getLeads);
router.post('/leads', checkPermission('crm', 'create'), crmController.createLead);
router.put('/leads/:id', checkPermission('crm', 'edit'), crmController.updateLead);
router.delete('/leads/:id', checkPermission('crm', 'delete'), crmController.deleteLead);
router.post('/leads/:id/convert-to-client', checkPermission('crm', 'edit'), crmController.convertLeadToClient);

// Follow-ups
router.get('/follow-ups', checkPermission('crm', 'view'), crmController.getFollowUps);
router.post('/follow-ups', checkPermission('crm', 'create'), crmController.createFollowUp);
router.patch('/follow-ups/:id/status', checkPermission('crm', 'edit'), crmController.updateFollowUpStatus);

// Consultations / Appointments
router.get('/consultations', checkPermission('crm', 'view'), crmController.getConsultations);
router.post('/consultations', checkPermission('crm', 'create'), crmController.createConsultation);
router.patch('/consultations/:id/status', checkPermission('crm', 'edit'), crmController.updateConsultationStatus);

// Sales Pipeline & conversion rates
router.get('/sales-pipeline', checkPermission('crm', 'view'), crmController.getSalesPipeline);

module.exports = router;

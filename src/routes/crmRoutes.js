const express = require('express');
const router = express.Router();
const crmController = require('../controllers/crmController');
const { protect, checkPermission } = require('../middleware/auth');

router.use(protect);

// Leads
router.get('/leads', checkPermission('crm_leads', 'view'), crmController.getLeads);
router.post('/leads', checkPermission('crm_leads', 'create'), crmController.createLead);
router.put('/leads/:id', checkPermission('crm_leads', 'edit'), crmController.updateLead);
router.patch('/leads/:id', checkPermission('crm_leads', 'edit'), crmController.updateLead);
router.delete('/leads/:id', checkPermission('crm_leads', 'delete'), crmController.deleteLead);
router.post('/leads/:id/convert-to-client', checkPermission('crm_leads', 'edit'), crmController.convertLeadToClient);

// Follow-ups
router.get('/follow-ups', checkPermission('crm_followups', 'view'), crmController.getFollowUps);
router.post('/follow-ups', checkPermission('crm_followups', 'create'), crmController.createFollowUp);
router.patch('/follow-ups/:id/status', checkPermission('crm_followups', 'edit'), crmController.updateFollowUpStatus);

// Consultations / Appointments
router.get('/consultations', checkPermission('crm_consultations', 'view'), crmController.getConsultations);
router.post('/consultations', checkPermission('crm_consultations', 'create'), crmController.createConsultation);
router.patch('/consultations/:id/status', checkPermission('crm_consultations', 'edit'), crmController.updateConsultationStatus);

// Sales Pipeline & conversion rates
router.get('/sales-pipeline', checkPermission('crm_pipeline', 'view'), crmController.getSalesPipeline);

module.exports = router;

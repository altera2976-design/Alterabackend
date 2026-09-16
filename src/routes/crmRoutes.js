const express = require('express');
const router = express.Router();
const crmController = require('../controllers/crmController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// Leads
router.get('/leads', crmController.getLeads);
router.post('/leads', crmController.createLead);
router.put('/leads/:id', crmController.updateLead);
router.delete('/leads/:id', crmController.deleteLead);
router.post('/leads/:id/convert-to-client', crmController.convertLeadToClient);

// Follow-ups
router.get('/follow-ups', crmController.getFollowUps);
router.post('/follow-ups', crmController.createFollowUp);
router.patch('/follow-ups/:id/status', crmController.updateFollowUpStatus);

// Consultations / Appointments
router.get('/consultations', crmController.getConsultations);
router.post('/consultations', crmController.createConsultation);
router.patch('/consultations/:id/status', crmController.updateConsultationStatus);

// Sales Pipeline & conversion rates
router.get('/sales-pipeline', crmController.getSalesPipeline);

module.exports = router;

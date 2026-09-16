const express = require('express');
const router = express.Router();
const controller = require('../controllers/projectExecutionController');
const { protect } = require('../middleware/auth');

router.use(protect);

// Project Rooms
router.get('/projects/:projectId/rooms', controller.getProjectRooms);
router.post('/projects/:projectId/rooms', controller.createProjectRoom);
router.put('/projects/:projectId/rooms/:roomId', controller.updateProjectRoom);

// BOQ Items
router.get('/projects/:projectId/boq', controller.getBOQItems);
router.post('/projects/:projectId/boq', controller.createBOQItem);
router.put('/projects/:projectId/boq/:boqId', controller.updateBOQItem);
router.delete('/projects/:projectId/boq/:boqId', controller.deleteBOQItem);

// Measurements
router.get('/projects/:projectId/measurements', controller.getMeasurements);
router.post('/projects/:projectId/measurements', controller.createMeasurement);

// Designs
router.get('/projects/:projectId/designs', controller.getDesigns);
router.post('/projects/:projectId/designs', controller.createDesign);
router.patch('/projects/:projectId/designs/:designId/approval', controller.updateDesignApproval);

// Materials Catalog
router.get('/materials', controller.getMaterials);
router.post('/materials', controller.createMaterial);
router.put('/materials/:id', controller.updateMaterial);

// Procurement / POs
router.get('/procurement', controller.getProcurements);
router.post('/procurement', controller.createProcurement);
router.patch('/procurement/:id/status', controller.updateProcurementStatus);

// Site Visits
router.get('/projects/:projectId/site-visits', controller.getSiteVisits);
router.post('/projects/:projectId/site-visits', controller.createSiteVisit);

// Teams & Hierarchy Assignment
router.get('/teams', controller.getTeams);
router.post('/teams', controller.createTeam);
router.post('/teams/assign', controller.assignEmployeeHierarchy);

// Leaves
router.get('/leaves', controller.getLeaves);
router.post('/leaves', controller.createLeave);
router.patch('/leaves/:id/status', controller.updateLeaveStatus);

module.exports = router;

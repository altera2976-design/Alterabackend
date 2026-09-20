const express = require('express');
const router = express.Router();
const { protect, checkPermission } = require('../middleware/auth');
const projectController = require('../controllers/projectController');

router.use(protect); // All project routes require auth

// Projects list & create
router.route('/')
  .get(checkPermission('projects', 'view'), projectController.getProjects)
  .post(checkPermission('projects', 'create'), projectController.createProject);

// Convert Quotation to Project
router.post('/convert-quotation/:quotationId', checkPermission('projects', 'create'), projectController.convertQuotationToProject);

// Single project operations
router.route('/:id')
  .get(checkPermission('projects', 'view'), projectController.getProject)
  .put(checkPermission('projects', 'edit'), projectController.updateProject)
  .delete(checkPermission('projects', 'delete'), projectController.deleteProject);

// Team assignments
router.post('/:id/team', checkPermission('projects', 'assign'), projectController.assignTeamMember);
router.delete('/:id/team/:userId', checkPermission('projects', 'edit'), projectController.removeTeamMember);

// Project files & attachments
router.post('/:id/files', checkPermission('projects', 'edit'), projectController.uploadProjectFile);
router.delete('/:id/files/:fileId', checkPermission('projects', 'delete'), projectController.deleteProjectFile);

// Progress & site photos
router.post('/:id/photos', checkPermission('projects', 'edit'), projectController.uploadProgressPhoto);
router.get('/:id/photos', checkPermission('projects', 'view'), projectController.getProjectPhotos);

// Activity timeline & attendance
router.get('/:id/timeline', checkPermission('projects', 'view'), projectController.getProjectTimeline);
router.get('/:id/attendance', checkPermission('projects', 'view'), projectController.getProjectAttendance);

module.exports = router;

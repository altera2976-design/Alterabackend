const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const projectController = require('../controllers/projectController');

router.use(protect); // All project routes require auth

// Projects list & create
router.route('/')
  .get(projectController.getProjects)
  .post(authorize('ADMIN'), projectController.createProject);

// Convert Quotation to Project (Admin only)
router.post('/convert-quotation/:quotationId', authorize('ADMIN'), projectController.convertQuotationToProject);

// Single project operations
router.route('/:id')
  .get(projectController.getProject)
  .put(projectController.updateProject)
  .delete(authorize('ADMIN'), projectController.deleteProject);

// Team assignments (Admin only)
router.post('/:id/team', authorize('ADMIN'), projectController.assignTeamMember);
router.delete('/:id/team/:userId', authorize('ADMIN'), projectController.removeTeamMember);

// Project files & attachments
router.post('/:id/files', projectController.uploadProjectFile);
router.delete('/:id/files/:fileId', projectController.deleteProjectFile);

// Progress & site photos
router.post('/:id/photos', projectController.uploadProgressPhoto);
router.get('/:id/photos', projectController.getProjectPhotos);

// Activity timeline & attendance
router.get('/:id/timeline', projectController.getProjectTimeline);
router.get('/:id/attendance', projectController.getProjectAttendance);

module.exports = router;

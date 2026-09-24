const express = require('express');
const router = express.Router();
const { protect, checkPermission } = require('../middleware/auth');
const taskController = require('../controllers/taskController');

const { handleUpload } = require('../middleware/upload');

router.use(protect);

router.route('/')
  .get(checkPermission('tasks', 'view'), taskController.getTasks)
  .post(checkPermission('tasks', 'create'), handleUpload('attachments', 10), taskController.createTask);

router.route('/:id')
  .get(checkPermission('tasks', 'view'), taskController.getTask)
  .delete(checkPermission('tasks', 'delete'), taskController.deleteTask);

router.patch('/:id/progress', checkPermission('tasks', 'edit'), handleUpload('attachments', 10), taskController.updateTaskProgress);
router.post('/:id/comments', checkPermission('tasks', 'edit'), taskController.addTaskComment);

module.exports = router;

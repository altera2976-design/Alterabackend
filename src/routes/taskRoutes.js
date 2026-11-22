const express = require('express');
const router = express.Router();
const { protect, checkPermission } = require('../middleware/auth');
const taskController = require('../controllers/taskController');

const { handleUpload } = require('../middleware/upload');

router.use(protect);

router.get('/my-tasks', taskController.getEmployeeTasks);

router.route('/')
  .get(checkPermission('tasks', 'view'), taskController.getTasks)
  .post(checkPermission('tasks', 'create'), handleUpload('attachments', 10), taskController.createTask);

router.route('/:id')
  .get(taskController.getTask)
  .delete(checkPermission('tasks', 'delete'), taskController.deleteTask);

router.patch('/:id/progress', handleUpload('attachments', 10), taskController.updateTaskProgress);
router.post('/:id/comments', taskController.addTaskComment);

module.exports = router;

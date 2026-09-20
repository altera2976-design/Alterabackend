const express = require('express');
const router = express.Router();
const { protect, checkPermission } = require('../middleware/auth');
const taskController = require('../controllers/taskController');

router.use(protect);

router.route('/')
  .get(checkPermission('tasks', 'view'), taskController.getTasks)
  .post(checkPermission('tasks', 'create'), taskController.createTask);

router.route('/:id')
  .get(checkPermission('tasks', 'view'), taskController.getTask)
  .delete(checkPermission('tasks', 'delete'), taskController.deleteTask);

router.patch('/:id/progress', checkPermission('tasks', 'edit'), taskController.updateTaskProgress);
router.post('/:id/comments', checkPermission('tasks', 'edit'), taskController.addTaskComment);

module.exports = router;

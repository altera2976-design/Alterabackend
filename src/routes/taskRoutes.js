const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const taskController = require('../controllers/taskController');

router.use(protect);

router.route('/')
  .get(taskController.getTasks)
  .post(taskController.createTask); // Checks PM or Admin inside controller

router.route('/:id')
  .get(taskController.getTask)
  .delete(authorize('ADMIN'), taskController.deleteTask);

router.patch('/:id/progress', taskController.updateTaskProgress);
router.post('/:id/comments', taskController.addTaskComment);

module.exports = router;

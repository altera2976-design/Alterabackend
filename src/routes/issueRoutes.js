const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const issueController = require('../controllers/issueController');

router.use(protect);

router.route('/')
  .get(issueController.getIssues)
  .post(issueController.reportIssue);

router.route('/:id')
  .patch(issueController.updateIssue);

module.exports = router;

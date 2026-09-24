const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const fileController = require('../controllers/fileController');

// GET file stream from Google Drive (authenticated user)
router.get('/drive/:fileId', protect, fileController.getDriveFile);

// POST upload files to Google Drive
router.post('/upload', protect, upload.array('files', 10), fileController.uploadFiles);

// DELETE file from Google Drive
router.delete('/drive/:fileId', protect, fileController.deleteDriveFile);

module.exports = router;

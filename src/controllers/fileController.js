const googleDriveService = require('../services/googleDrive.service');

/**
 * Proxy stream Google Drive file safely to authorized users
 * GET /api/files/drive/:fileId
 */
exports.getDriveFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    if (!fileId) {
      return res.status(400).json({ success: false, message: 'Drive file ID is required' });
    }

    await googleDriveService.streamDriveFile(fileId, res);
  } catch (error) {
    next(error);
  }
};

/**
 * Upload single or multiple files directly to Google Drive
 * POST /api/files/upload
 */
exports.uploadFiles = async (req, res, next) => {
  try {
    const folderType = req.body.folderType || req.query.folderType || 'Tasks';
    const filesToUpload = [];

    // 1. Files uploaded via Multer (multipart/form-data)
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files) {
        filesToUpload.push({
          buffer: file.buffer,
          fileName: file.originalname,
          mimeType: file.mimetype,
        });
      }
    } else if (req.file) {
      filesToUpload.push({
        buffer: req.file.buffer,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
      });
    }

    // 2. Base64 payload support (if client sends JSON base64)
    if (req.body.attachments && Array.isArray(req.body.attachments)) {
      for (const att of req.body.attachments) {
        if (att.base64Data || att.base64 || att.buffer) {
          let buffer;
          if (att.buffer) {
            buffer = Buffer.from(att.buffer);
          } else {
            const rawData = att.base64Data || att.base64;
            const cleanBase64 = rawData.replace(/^data:[^;]+;base64,/, '');
            buffer = Buffer.from(cleanBase64, 'base64');
          }
          filesToUpload.push({
            buffer,
            fileName: att.fileName || att.name || `file_${Date.now()}`,
            mimeType: att.mimeType || att.fileType || 'application/octet-stream',
          });
        }
      }
    }

    if (filesToUpload.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid files provided for upload.' });
    }

    const uploadedResults = [];
    for (const item of filesToUpload) {
      const driveMeta = await googleDriveService.uploadFileToDrive({
        buffer: item.buffer,
        fileName: item.fileName,
        mimeType: item.mimeType,
        folderType,
      });

      uploadedResults.push({
        fileName: driveMeta.fileName,
        originalName: item.fileName,
        driveFileId: driveMeta.driveFileId,
        driveUrl: driveMeta.driveUrl,
        mimeType: driveMeta.mimeType,
        fileSize: driveMeta.fileSize,
        folderType,
        uploadedBy: req.user._id,
        uploadedByName: req.user.name,
        uploadedAt: new Date(),
      });
    }

    res.status(201).json({
      success: true,
      count: uploadedResults.length,
      data: uploadedResults,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete file from Google Drive
 * DELETE /api/files/drive/:fileId
 */
exports.deleteDriveFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    if (!fileId) {
      return res.status(400).json({ success: false, message: 'Drive file ID is required' });
    }

    const success = await googleDriveService.deleteFileFromDrive(fileId);
    res.status(200).json({
      success: true,
      message: success ? 'File deleted successfully from Drive' : 'File deletion completed with notice',
    });
  } catch (error) {
    next(error);
  }
};

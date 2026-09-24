const multer = require('multer');
const path = require('path');

// Allow images and business document types
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/octet-stream',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.csv',
  '.txt',
]);

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype.toLowerCase();

  if (ALLOWED_MIME_TYPES.has(mimeType) || ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    const err = new Error(
      `Unsupported file type (${ext || mimeType}). Only JPG, JPEG, PNG, WEBP, PDF, DOC, DOCX, XLS, and XLSX are allowed.`
    );
    err.statusCode = 400;
    cb(err, false);
  }
};

const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size per file
    files: 10, // Max 10 files per upload request
  },
});

/**
 * Middleware wrapper that catches Multer errors (e.g. LIMIT_FILE_SIZE, LIMIT_FILE_COUNT)
 * and returns explicit HTTP 413 for oversized payloads.
 */
const handleUpload = (fieldname = 'attachments', maxCount = 10) => {
  return (req, res, next) => {
    const uploadMiddleware = upload.array(fieldname, maxCount);

    uploadMiddleware(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
              success: false,
              message: 'File size exceeds maximum allowed limit of 50MB per file.',
            });
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(413).json({
              success: false,
              message: `Maximum ${maxCount} files allowed per upload request.`,
            });
          }
          return res.status(413).json({
            success: false,
            message: `Upload error: ${err.message}`,
          });
        }
        if (err.statusCode) {
          return res.status(err.statusCode).json({
            success: false,
            message: err.message,
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message || 'File upload failed.',
        });
      }
      next();
    });
  };
};

module.exports = upload;
module.exports.handleUpload = handleUpload;

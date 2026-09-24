/**
 * Centralized error handler middleware
 * Must be the last middleware registered in app.js
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // Log error internally
  console.error("❌ Server Error:", err.message || err);

  // Express body-parser or Multer 413 Payload Too Large Error
  if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413 || err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT') {
    statusCode = 413;
    message = err.code === 'LIMIT_FILE_COUNT'
      ? "Maximum 10 files allowed per task upload."
      : "Payload too large. Maximum file upload size is 50MB per file.";
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid request identifier.";
  }

  // Mongoose duplicate key error (E11000)
  if (err.code === 11000) {
    statusCode = 409;
    const field = err.keyValue ? Object.keys(err.keyValue)[0] : "field";
    const value = err.keyValue ? err.keyValue[field] : "";
    if (field === "employeeId") {
      message = `Employee ID ${value} is already registered.`;
    } else if (field === "email") {
      message = `Email '${value}' is already registered.`;
    } else {
      message = `${field.charAt(0).toUpperCase() + field.slice(1)} '${value}' is already in use.`;
    }
  }

  // Mongoose validation errors
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((val) => val.message)
      .join(", ");
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid authentication token.";
  }
  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Authentication token has expired.";
  }

  // Production error masking for unhandled server errors
  if (process.env.NODE_ENV === "production" && statusCode === 500) {
    message = "Something went wrong. Please try again later.";
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
};

/**
 * Custom AppError class for operational errors
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { errorHandler, AppError };

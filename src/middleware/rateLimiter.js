/**
 * Rate limiting middleware
 * Protects auth endpoints from brute-force / credential-stuffing attacks.
 *
 * NOTE: express-rate-limit must be installed:
 *   npm install express-rate-limit
 */
const rateLimit = require("express-rate-limit");

/**
 * authLimiter — applied to POST /api/auth/login and other sensitive auth flows.
 * Allows 5 attempts per 15-minute window per IP + Email combination.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // Disabled for testing (was 5)
  standardHeaders: true, // Return rate-limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  validate: {
    trustProxy: false,
    xForwardedForHeader: false,
    ip: false, // Disable the IPv6 check warning
    default: true,
  },
  keyGenerator: (req, res) => {
    // Avoid triggering express-rate-limit's built-in IPv6 validation warning
    // by using req.socket.remoteAddress
    const clientIp =
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress ||
      "unknown-ip";
    const email = req.body.email
      ? req.body.email.toLowerCase().trim()
      : "no-email";
    return `${clientIp}_${email}`;
  },
  handler: (req, res, next, options) => {
    // 429 Too Many Requests
    res.status(429).json({
      success: false,
      message:
        "Too many login attempts. Your account is temporarily locked. Please try again after 15 minutes.",
    });
  },
  skipSuccessfulRequests: true, // Only count failed attempts towards the limit
});

/**
 * forgotPasswordLimiter — applied to POST /api/auth/forgot-password.
 * Allows max 5 requests per 15-minute window per IP + Email combination.
 */
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    trustProxy: false,
    xForwardedForHeader: false,
    ip: false,
    default: true,
  },
  keyGenerator: (req) => {
    const clientIp =
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress ||
      "unknown-ip";
    const email =
      req.body && req.body.email
        ? String(req.body.email).toLowerCase().trim()
        : "no-email";
    return `forgot_${clientIp}_${email}`;
  },
  handler: (req, res) => {
    res.setHeader("Retry-After", "900");
    res.status(429).json({
      success: false,
      message:
        "Too many password reset requests. Please try again after 15 minutes.",
    });
  },
});

/**
 * resetPasswordLimiter — applied to POST /api/auth/reset-password.
 * Allows max 5 attempts per 15-minute window per IP + Email combination.
 */
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    trustProxy: false,
    xForwardedForHeader: false,
    ip: false,
    default: true,
  },
  keyGenerator: (req) => {
    const clientIp =
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress ||
      "unknown-ip";
    const email =
      req.body && req.body.email
        ? String(req.body.email).toLowerCase().trim()
        : "no-email";
    return `reset_${clientIp}_${email}`;
  },
  handler: (req, res) => {
    res.setHeader("Retry-After", "900");
    res.status(429).json({
      success: false,
      message:
        "Too many password reset attempts. Please try again after 15 minutes.",
    });
  },
});

/**
 * generalLimiter — applied globally to all API routes.
 * Allows 1000 requests per 15-minute window per IP.
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    trustProxy: false,
    xForwardedForHeader: false,
    ip: false, // Disable the IPv6 check warning
    default: true,
  },
  keyGenerator: (req, res) => {
    return (
      req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown-ip"
    );
  },
  message: {
    success: false,
    message: "Too many requests. Please slow down.",
  },
});

module.exports = {
  authLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  generalLimiter,
};

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const authController = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { authLimiter, forgotPasswordLimiter, resetPasswordLimiter, verifyOtpLimiter } = require('../middleware/rateLimiter');

// POST /api/auth/login  (public, rate-limited)
router.post(
  '/login',
  authLimiter,
  [
    body('email')
      .notEmpty()
      .withMessage('Please provide your email or mobile number')
      .trim(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  authController.login
);

// POST /api/auth/register
// Note: Made public as requested.
router.post(
  '/register',
  (req, res, next) => {
    if (!req.body.fullName && req.body.name) {
      req.body.fullName = req.body.name;
    }
    next();
  },
  [
    body('fullName').notEmpty().trim().withMessage('Full name is required'),
    body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail({ gmail_remove_dots: false }),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
  ],
  validate,
  authController.register
);

// POST /api/auth/google  (public, rate-limited)
router.post(
  '/google',
  authLimiter,
  [
    body('idToken')
      .notEmpty()
      .withMessage('Google ID token is required')
      .trim(),
  ],
  validate,
  authController.googleLogin
);

// GET /api/auth/me  (protected)
router.get('/me', protect, authController.getMe);

// PUT /api/auth/profile  (protected)
router.put('/profile', protect, authController.updateProfile);

// POST /api/auth/profile-image (protected)
router.post('/profile-image', protect, authController.uploadProfileImage);

// POST /api/auth/change-password (protected)
router.post('/change-password', protect, authController.changePassword);

// POST /api/auth/forgot-password (public, rate-limited)
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  [
    body().custom((value, { req }) => {
      const input = (req.body.email || req.body.employeeId || req.body.identifier || '').trim();
      if (!input) {
        throw new Error('Please provide your registered email or Employee ID.');
      }
      if (input.length > 255) {
        throw new Error('Input is too long.');
      }
      return true;
    }),
  ],
  validate,
  authController.forgotPassword
);

// POST /api/auth/verify-otp (public, rate-limited)
router.post(
  '/verify-otp',
  verifyOtpLimiter,
  [
    body().custom((value, { req }) => {
      const input = (req.body.email || req.body.employeeId || req.body.identifier || '').trim();
      if (!input) {
        throw new Error('Please provide your registered email or Employee ID.');
      }
      return true;
    }),
    body('otp')
      .notEmpty()
      .withMessage('Please provide the 6-digit OTP.')
      .isString()
      .trim()
      .isLength({ min: 6, max: 6 })
      .withMessage('OTP must be exactly 6 digits.')
      .isNumeric()
      .withMessage('OTP must contain numbers only.'),
  ],
  validate,
  authController.verifyOtp
);

// POST /api/auth/reset-password (public, rate-limited)
router.post(
  '/reset-password',
  resetPasswordLimiter,
  [
    body().custom((value, { req }) => {
      const input = (req.body.email || req.body.employeeId || req.body.identifier || '').trim();
      if (!input && !req.body.resetToken) {
        throw new Error('Please provide email/Employee ID or resetToken.');
      }
      if (!req.body.otp && !req.body.resetToken) {
        throw new Error('Please provide either verification code (OTP) or resetToken.');
      }
      return true;
    }),
    body('otp')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 6, max: 6 })
      .withMessage('OTP must be exactly 6 digits.')
      .isNumeric()
      .withMessage('OTP must contain numbers only.'),
    body('resetToken')
      .optional()
      .isString()
      .trim(),
    body('newPassword')
      .notEmpty()
      .withMessage('Please provide a new password.')
      .isLength({ min: 6, max: 128 })
      .withMessage('Password must be between 6 and 128 characters.'),
    body('confirmPassword')
      .optional()
      .custom((value, { req }) => {
        if (value && value !== req.body.newPassword) {
          throw new Error('New password and confirm password do not match.');
        }
        return true;
      }),
  ],
  validate,
  authController.resetPassword
);

module.exports = router;

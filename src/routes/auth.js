const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const authController = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');

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

// POST /api/auth/forgot-password (public)
router.post('/forgot-password', authLimiter, authController.forgotPassword);

// POST /api/auth/reset-password (public)
router.post('/reset-password', authLimiter, authController.resetPassword);

module.exports = router;

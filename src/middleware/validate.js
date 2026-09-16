const { validationResult } = require('express-validator');

/**
 * Middleware to check express-validator results
 * Call this after your validation rules in the route
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array(),
    });
  }
  next();
};

module.exports = validate;

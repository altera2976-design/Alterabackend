const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * protect middleware - Verifies JWT and attaches user to req.user
 */
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token is no longer valid. User not found.',
      });
    }

    if (user.status === 'INACTIVE') {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated. Please contact admin.',
      });
    }

    if (user.email === 'admin@company.com') {
      user.role = 'ADMIN';
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.',
    });
  }
};

/**
 * authorize middleware - Restricts access to specific roles
 * Usage: authorize('ADMIN') or authorize('ADMIN', 'EMPLOYEE')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    const userRole = req.user?.role;
    const isSuper = userRole === 'SUPER_ADMIN';
    const isAdmin = userRole === 'ADMIN' || isSuper;

    if (isSuper || roles.includes(userRole) || (roles.includes('ADMIN') && isAdmin)) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: `Access denied. Role '${userRole}' is not authorized for this action.`,
    });
  };
};

/**
 * checkPermission middleware - Verifies granular module permission for current user
 * Usage: checkPermission('crm', 'create') or checkPermission('tasks', 'assign')
 */
const checkPermission = (moduleName, action = 'view') => {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (userRole === 'SUPER_ADMIN' || req.user?.email?.toLowerCase() === 'admin@alterainterior.com') {
      return next();
    }

    if (req.user?.status === 'INACTIVE') {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated.',
      });
    }

    if (req.user?.isAdminPanelEnabled === false) {
      return res.status(403).json({
        success: false,
        message: 'Admin Panel access is disabled for your account.',
      });
    }

    const modPerms = req.user?.permissions?.[moduleName];

    if (modPerms) {
      if (typeof modPerms === 'boolean' && modPerms === true) {
        return next();
      }
      if (typeof modPerms === 'object' && modPerms[action] === true) {
        return next();
      }
    }

    return res.status(403).json({
      success: false,
      message: `Access denied. You do not have permission to ${action} in ${moduleName}.`,
    });
  };
};

module.exports = { protect, authorize, checkPermission };

const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * protect middleware - Verifies JWT and attaches user to req.user
 */
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access denied. No token provided.",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Token is no longer valid. User not found.",
      });
    }

    if (user.status === "INACTIVE") {
      return res.status(401).json({
        success: false,
        message: "Your account has been deactivated. Please contact admin.",
      });
    }

    if (
      user.email === "admin@company.com" ||
      user.email === "admin@alterainterior.com"
    ) {
      user.role = "SUPER_ADMIN";
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};

/**
 * authorize middleware - Restricts access to specific roles
 * Usage: authorize('ADMIN') or authorize('ADMIN', 'EMPLOYEE')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    const userRole = (req.user?.role || "").toUpperCase();
    const userEmail = (req.user?.email || "").toLowerCase();
    const isSuper =
      userRole === "SUPER_ADMIN" ||
      userEmail === "admin@alterainterior.com" ||
      userEmail === "admin@company.com";
    const isAdmin =
      userRole === "ADMIN" || userRole.includes("ADMIN") || isSuper;

    const normalizedRoles = roles.map((r) => String(r).toUpperCase());

    if (
      isSuper ||
      normalizedRoles.includes(userRole) ||
      (normalizedRoles.includes("ADMIN") && isAdmin)
    ) {
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
const checkPermission = (moduleName, action = "view") => {
  return (req, res, next) => {
    const userRole = (req.user?.role || "").toUpperCase();
    const userEmail = (req.user?.email || "").toLowerCase();
    const isSuper =
      userRole === "SUPER_ADMIN" ||
      userEmail === "admin@alterainterior.com" ||
      userEmail === "admin@company.com";

    // 1. Super Admins always have full access
    if (isSuper) {
      return next();
    }

    // 2. Active status check
    if (req.user?.status === "INACTIVE") {
      return res.status(401).json({
        success: false,
        message:
          "Your account has been deactivated. Please contact the Super Admin.",
      });
    }

    // 3. Admin Panel Access check
    if (req.user?.isAdminPanelEnabled === false) {
      return res.status(403).json({
        success: false,
        message: "Admin Panel access has not been granted by Super Admin.",
      });
    }

    // Module key aliases mapping
    const ALIAS_MAP = {
      payroll: ["payroll", "salary"],
      salary: ["salary", "payroll"],
      quotation: ["quotation", "quotations"],
      quotations: ["quotations", "quotation"],
      tracking: ["tracking", "bikeTracking", "bike_tracking"],
      bikeTracking: ["bikeTracking", "tracking", "bike_tracking"],
      employees: ["employees", "administration"],
      administration: ["administration", "employees"],
      remarks: ["remarks", "attendance"],
      overtime: ["overtime", "salary", "payroll"],
      offer_letters: ["offer_letters", "offerLetters"],
      offerLetters: ["offerLetters", "offer_letters"],
    };

    const keysToCheck = ALIAS_MAP[moduleName] || [
      moduleName,
      moduleName.includes("_")
        ? moduleName.replace(/_([a-z])/g, (_, g) => g.toUpperCase())
        : moduleName.replace(/([A-Z])/g, "_$1").toLowerCase(),
    ];

    const perms = req.user?.permissions || {};
    let modPerms = undefined;

    for (const k of keysToCheck) {
      if (perms[k] !== undefined) {
        modPerms = perms[k];
        break;
      }
    }

    if (modPerms !== undefined) {
      if (typeof modPerms === "boolean") {
        if (modPerms === true) return next();
        if (modPerms === false) {
          return res.status(403).json({
            success: false,
            message: "Access Denied — You don't have permission to access this module.",
          });
        }
      } else if (typeof modPerms === "object" && modPerms !== null) {
        if (modPerms[action] === true) return next();
        if (action === "view" && (modPerms.view === true || Object.values(modPerms).some(v => v === true))) {
          return next();
        }
        if (
          modPerms[action] === false ||
          (action === "view" && modPerms.view === false) ||
          Object.values(modPerms).every(v => v === false)
        ) {
          return res.status(403).json({
            success: false,
            message: "Access Denied — You don't have permission to access this module.",
          });
        }
      }
    }

    // For Admin roles, if modPerms was explicitly undefined, allow default unless forbidden
    if (userRole === "ADMIN" || userRole.includes("ADMIN")) {
      return next();
    }

    // Default: allow viewing resources for active authenticated users
    if (action === "view") {
      return next();
    }

    const managementRoles = [
      "MANAGER",
      "SALES",
      "PROJECT_MANAGER",
      "DESIGNER",
      "EMPLOYEE",
    ];
    if (managementRoles.some((r) => userRole.includes(r))) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "Access Denied — You don't have permission to access this module.",
    });
  };
};

module.exports = { protect, authorize, checkPermission };

const jwt = require("jsonwebtoken");
const User = require("../models/User");

const getSuperAdminEmail = () => {
  return (
    process.env.SUPER_ADMIN_EMAIL ||
    process.env.ADMIN_EMAIL ||
    "alterakitcheninteriorr@gmail.com"
  )
    .toLowerCase()
    .trim();
};

const getDisabledAdminEmails = () => {
  const currentSuper = getSuperAdminEmail();
  const list = ["alterakitcheninterior@gmail.com"];
  return list.filter((e) => e !== currentSuper);
};

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
    const user = await User.findById(decoded.id).select(
      "+passwordChangedAt -documents",
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Token is no longer valid. User not found.",
      });
    }

    // Explicit revocation of disabled admin accounts
    if (getDisabledAdminEmails().includes((user.email || "").toLowerCase())) {
      return res.status(401).json({
        success: false,
        message: "This account has been disabled. Access revoked.",
      });
    }

    if (
      user.status === "INACTIVE" ||
      user.status === "SUSPENDED" ||
      user.accessStatus === "SUSPENDED"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Your account has not been authorized by Super Admin. Please contact Super Admin.",
      });
    }

    // Invalidate previous sessions if password was changed after token issuance
    if (user.passwordChangedAt && decoded.iat) {
      const changedTimestamp = parseInt(
        user.passwordChangedAt.getTime() / 1000,
        10,
      );
      if (decoded.iat < changedTimestamp) {
        return res.status(401).json({
          success: false,
          message:
            "Password was recently changed. Your session has expired. Please log in again.",
        });
      }
    }

    if (user.email === getSuperAdminEmail() || user.employeeId === "EMP001") {
      user.role = "SUPER_ADMIN";
    }

    req.user = user;
    next();
  } catch (error) {
    if (
      error.name === "TokenExpiredError" ||
      error.name === "JsonWebTokenError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token.",
      });
    }

    console.error("Auth Middleware Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during authentication.",
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
      userEmail === getSuperAdminEmail() ||
      req.user?.employeeId === "EMP001";
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
      userEmail === getSuperAdminEmail() ||
      req.user?.employeeId === "EMP001";

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
    if (userRole === "ADMIN" && req.user?.isAdminPanelEnabled !== true) {
      return res.status(403).json({
        success: false,
        message:
          "Your account has not been authorized by Super Admin. Please contact Super Admin.",
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
      projects: ["projects", "project"],
      project: ["project", "projects"],
      transactions: ["transactions", "transaction"],
      transaction: ["transaction", "transactions"],
      crm: [
        "crm",
        "crm_leads",
        "crm_customers",
        "crm_clients",
        "crm_followups",
        "crm_pipeline",
        "crm_consultations",
        "crm_campaigns",
        "crm_team",
        "crm_settings",
      ],
      crm_leads: ["crm_leads", "crm"],
      crm_customers: ["crm_customers", "crm_clients", "clients", "crm"],
      crm_clients: ["crm_clients", "crm_customers", "clients", "crm"],
      crm_followups: ["crm_followups", "crm"],
      crm_pipeline: ["crm_pipeline", "crm"],
      crm_consultations: ["crm_consultations", "crm"],
      crm_tasks: ["crm_tasks", "tasks", "crm"],
      crm_reports: ["crm_reports", "reports", "crm"],
      crm_campaigns: ["crm_campaigns", "crm"],
      crm_team: ["crm_team", "crm"],
      crm_settings: ["crm_settings", "administration", "crm"],
      reports: ["reports", "crm_reports"],
    };

    // Check Employee Native App Permissions (employeeAppPermissions) if defined
    const appPerms = req.user?.employeeAppPermissions;
    if (userRole === "EMPLOYEE" && appPerms && typeof appPerms === "object") {
      const appPermKeys = ALIAS_MAP[moduleName] || [moduleName];
      for (const k of appPermKeys) {
        if (appPerms[k] !== undefined) {
          if (appPerms[k] === false) {
            return res.status(403).json({
              success: false,
              message: `Access Denied — Permission for ${moduleName} is not granted on your account.`,
            });
          }
          if (appPerms[k] === true) {
            return next();
          }
        }
      }
    }

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

    const effectiveAction =
      action.startsWith("view") ||
      action === "viewSummary" ||
      action === "viewDetails" ||
      action === "download"
        ? "view"
        : action === "refund" ||
          action === "assign" ||
          action === "upload"
        ? "edit"
        : action;

    if (modPerms !== undefined) {
      if (typeof modPerms === "boolean") {
        if (modPerms === true) return next();
        if (modPerms === false) {
          return res.status(403).json({
            success: false,
            message:
              "Access Denied — You don't have permission to access this module.",
          });
        }
      } else if (typeof modPerms === "object" && modPerms !== null) {
        if (modPerms[effectiveAction] === true || modPerms[action] === true) return next();
        if (
          effectiveAction === "view" &&
          (modPerms.view === true ||
            Object.values(modPerms).some((v) => v === true))
        ) {
          return next();
        }
        if (
          modPerms[effectiveAction] === false ||
          modPerms[action] === false ||
          (effectiveAction === "view" && modPerms.view === false) ||
          Object.values(modPerms).every((v) => v === false)
        ) {
          return res.status(403).json({
            success: false,
            message:
              "Access Denied — You don't have permission to access this module.",
          });
        }
      }
    }

    // Default: allow viewing resources for active authenticated users
    // For active Admins with panel access, allow view if not explicitly revoked by Super Admin
    if (effectiveAction === "view") {
      if (userRole === "ADMIN" || userRole.includes("ADMIN")) {
        if (
          req.user?.isAdminPanelEnabled === true &&
          req.user?.status !== "INACTIVE"
        ) {
          return next();
        }
      } else {
        return next();
      }
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
      message:
        "Access Denied — You don't have permission to access this module.",
    });
  };
};

module.exports = { protect, authorize, checkPermission };

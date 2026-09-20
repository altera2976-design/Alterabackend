const express = require("express");
const { protect, authorize } = require("../middleware/auth");
const {
  generateQr,
  scanQr,
  getTodayAttendance,
  getMyHistory,
  getAdminStats,
  getDailyAttendanceList,
  getMonthlyStats,
  markSelfieAttendance,
  getSelfieImage,
  reviewAttendanceRecord,
  getGeofenceConfig,
  updateGeofenceConfig,
} = require("../controllers/attendanceController");

const router = express.Router();

// ── SELFIE ATTENDANCE ROUTES ───────────────────────────────────────────────
router.post(
  "/selfie-mark",
  protect,
  authorize("EMPLOYEE", "ADMIN"),
  markSelfieAttendance,
);
router.get("/selfie/:id/:type", protect, getSelfieImage);
router.get("/geofence-config", protect, getGeofenceConfig);
router.put(
  "/geofence-config",
  protect,
  authorize("ADMIN"),
  updateGeofenceConfig,
);
router.patch(
  "/review/:id",
  protect,
  authorize("ADMIN"),
  reviewAttendanceRecord,
);

// ── EMPLOYEE ROUTES ────────────────────────────────────────────────────────
// protect ensures a valid JWT; employees only see their own data (enforced in controller)
router.post("/scan", protect, authorize("EMPLOYEE", "ADMIN"), scanQr);
router.get(
  "/today",
  protect,
  authorize("EMPLOYEE", "ADMIN"),
  getTodayAttendance,
);
router.get("/history", protect, authorize("EMPLOYEE", "ADMIN"), getMyHistory);

// ── SHARED ROUTE (Employee sees self, Admin can pass ?userId) ─────────────
// ⚠️  FIXED: was missing authorize — any authenticated user could theoretically
// enumerate other users' monthly stats by guessing ObjectIds.
// Now: employees are scoped to self server-side; admins can query any userId.
router.get(
  "/monthly",
  protect,
  authorize("EMPLOYEE", "ADMIN"),
  getMonthlyStats,
);

// ── ADMIN-ONLY ROUTES ──────────────────────────────────────────────────────
router.post("/generate-qr", protect, authorize("ADMIN"), generateQr);
router.get("/admin/stats", protect, authorize("ADMIN"), getAdminStats);
router.get(
  "/admin/daily-list",
  protect,
  authorize("ADMIN"),
  getDailyAttendanceList,
);

module.exports = router;

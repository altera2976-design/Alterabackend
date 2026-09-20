const express = require("express");
const { protect, authorize } = require("../middleware/auth");
const {
  startWorkSession,
  stopWorkSession,
  recordLocationPing,
  getActiveSession,
  getAllActiveSessions,
  getAllHistory,
  getHistory,
  getMonthlySummary,
  getLatestForBike,
  deleteSession,
  updateSession,
} = require("../controllers/bikeTrackingController");

const router = express.Router();

// All routes require authentication
router.use(protect);

// Start endpoints
router.post("/start", startWorkSession);
router.post("/start-session", startWorkSession);
router.post("/start-tracking", startWorkSession);

// Location ping endpoints
router.post("/location", recordLocationPing);
router.post("/ping", recordLocationPing);

// Stop endpoints (supports POST /stop, PATCH /stop, POST /:id/stop, PATCH /:id/stop)
router.post("/stop", stopWorkSession);
router.patch("/stop", stopWorkSession);
router.post("/stop-session", stopWorkSession);
router.post("/:id/stop", stopWorkSession);
router.patch("/:id/stop", stopWorkSession);

// Distance calculation endpoint
router.post("/calculate-distance", (req, res) => {
  const { lat1, lon1, lat2, lon2 } = req.body;
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
    return res.status(400).json({ success: false, message: "Missing coordinates for distance calculation." });
  }
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = Number((R * c).toFixed(2));
  res.json({ success: true, distanceKm });
});

// Admin live & history endpoints
router.get("/admin/active", authorize("ADMIN"), getAllActiveSessions);
router.get("/admin/history", authorize("ADMIN"), getAllHistory);

// Read endpoints
router.get("/active", getActiveSession);
router.get("/status", getActiveSession);
router.get("/history", getHistory);
router.get("/monthly", getMonthlySummary);
router.get("/latest/:bikeNumber", getLatestForBike);

// Admin routes for managing
router.delete("/:id", deleteSession);
router.patch("/:id", authorize("ADMIN"), updateSession);

module.exports = router;




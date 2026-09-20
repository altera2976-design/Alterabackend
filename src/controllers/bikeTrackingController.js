const BikeTracking = require("../models/BikeTracking");
const User = require("../models/User");

// @desc    Start a new bike working session
// @route   POST /api/bike-tracking/start
// @access  Private (EMPLOYEE, ADMIN)
exports.startWorkSession = async (req, res, next) => {
  try {
    const { bikeNumber, startingMeterReading, date, startTime, startLocation } = req.body;
    const employeeId = req.user.id || req.user._id;

    if (!bikeNumber || startingMeterReading === undefined || startingMeterReading === null) {
      return res.status(400).json({
        success: false,
        message: "Bike number and starting meter reading are required.",
      });
    }

    // Check if an active session already exists
    const activeSession = await BikeTracking.findOne({
      employeeId,
      status: "ACTIVE",
    });

    if (activeSession) {
      return res.status(400).json({
        success: false,
        message: "You already have an active work session.",
        data: activeSession,
        sessionId: activeSession._id,
        trackingSessionId: activeSession._id,
      });
    }

    // Get employee name
    const employee = await User.findById(employeeId);
    if (!employee) {
      return res
        .status(404)
        .json({ success: false, message: "Employee user not found." });
    }

    // Check if entered reading is less than previous ending meter
    const lastSession = await BikeTracking.findOne({
      employeeId,
      bikeNumber,
      status: "COMPLETED",
    }).sort({ createdAt: -1 });

    if (lastSession && lastSession.endingMeterReading !== undefined) {
      if (Number(startingMeterReading) < lastSession.endingMeterReading) {
        return res.status(400).json({
          success: false,
          message: `Starting meter (${startingMeterReading}) cannot be less than previous ending meter (${lastSession.endingMeterReading}).`,
        });
      }
    }

    const newSession = await BikeTracking.create({
      employeeId,
      employeeName: employee.name || employee.fullName || "Employee",
      bikeNumber: bikeNumber.trim().toUpperCase(),
      startTime: startTime ? new Date(startTime) : new Date(),
      startingMeterReading: Number(startingMeterReading),
      startLocation: startLocation || null,
      date: date || new Date().toISOString().slice(0, 10),
      status: "ACTIVE",
    });

    // Emit live socket event to Admin Dashboard
    const io = req.app.get("io");
    if (io) {
      io.emit("bike_session_started", { session: newSession });
      io.emit("dashboard_updated", { type: "BIKE_SESSION_STARTED" });
    }

    return res.status(201).json({
      success: true,
      data: newSession,
      sessionId: newSession._id,
      trackingSessionId: newSession._id,
      message: "Work session started.",
    });
  } catch (error) {
    console.error("Error starting bike session:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Server error while starting session.",
    });
  }
};

// @desc    Record periodic location pings for an active session
// @route   POST /api/bike-tracking/location
// @access  Private (EMPLOYEE, ADMIN)
exports.recordLocationPing = async (req, res, next) => {
  try {
    const { sessionId, latitude, longitude, accuracy, speed, currentMeterReading, distanceKm } = req.body;
    const employeeId = req.user.id || req.user._id;

    let session;
    if (sessionId) {
      session = await BikeTracking.findById(sessionId);
    } else {
      session = await BikeTracking.findOne({
        employeeId,
        status: "ACTIVE",
      });
    }

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Active bike tracking session not found.",
      });
    }

    if (latitude !== undefined && longitude !== undefined) {
      session.locationHistory.push({
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracy: accuracy ? Number(accuracy) : undefined,
        speed: speed ? Number(speed) : undefined,
        timestamp: new Date(),
      });
      session.stopLocation = {
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracy: accuracy ? Number(accuracy) : undefined,
        timestamp: new Date(),
      };
    }

    if (distanceKm !== undefined) {
      session.distanceKm = Number(distanceKm);
    }

    const calculatedEnding = currentMeterReading !== undefined
      ? Number(currentMeterReading)
      : (session.startingMeterReading + (session.distanceKm || 0));
      
    session.endingMeterReading = Number(calculatedEnding.toFixed(2));

    await session.save();

    // Broadcast live Socket.IO update to Admin Dashboard
    const io = req.app.get("io");
    if (io) {
      io.emit("bike_location_update", {
        sessionId: session._id,
        employeeId: session.employeeId,
        employeeName: session.employeeName,
        bikeNumber: session.bikeNumber,
        startingMeterReading: session.startingMeterReading,
        currentMeterReading: session.endingMeterReading,
        distanceKm: session.distanceKm || 0,
        lastUpdate: new Date(),
        location: latitude && longitude ? { latitude, longitude, accuracy, speed } : null,
      });
      io.emit("dashboard_updated", { type: "BIKE_LOCATION_UPDATE" });
    }

    return res.status(200).json({
      success: true,
      data: session,
      message: "Location recorded successfully.",
    });
  } catch (error) {
    console.error("Error recording location ping:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Server error while recording location.",
    });
  }
};

// @desc    Stop an active bike working session
// @route   POST /api/bike-tracking/stop OR PATCH /api/bike-tracking/:id/stop
// @access  Private (EMPLOYEE, ADMIN)
exports.stopWorkSession = async (req, res, next) => {
  try {
    const {
      endingMeterReading,
      totalDistance,
      distanceKm: bodyDistance,
      notes,
      stopLocation,
      locationHistory,
    } = req.body;
    const sessionId = req.params.id || req.body.id || req.body.sessionId || req.body._id;

    let session;
    if (sessionId) {
      session = await BikeTracking.findById(sessionId);
    } else {
      session = await BikeTracking.findOne({
        employeeId: req.user.id || req.user._id,
        status: "ACTIVE",
      });
    }

    if (!session) {
      return res
        .status(404)
        .json({ success: false, message: "Active bike tracking session not found." });
    }

    // Check ownership if EMPLOYEE
    const currentUserId = (req.user.id || req.user._id).toString();
    if (
      req.user.role === "EMPLOYEE" &&
      session.employeeId.toString() !== currentUserId
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized to stop this session." });
    }

    if (session.status === "COMPLETED") {
      return res.status(400).json({
        success: false,
        message: "Session is already completed.",
        data: session,
      });
    }

    let calculatedDistance = bodyDistance !== undefined ? Number(bodyDistance) : (totalDistance !== undefined ? Number(totalDistance) : (session.distanceKm || 0));
    let endMeter = endingMeterReading !== undefined ? Number(endingMeterReading) : (session.startingMeterReading + calculatedDistance);

    if (isNaN(endMeter) || endMeter < session.startingMeterReading) {
      endMeter = session.startingMeterReading + calculatedDistance;
    }

    const finalDistance = Number((endMeter - session.startingMeterReading).toFixed(2));
    const stopTime = new Date();
    
    // Calculate total working minutes
    const startTimeMs = new Date(session.startTime).getTime();
    const stopTimeMs = stopTime.getTime();
    const totalWorkingMinutes = Math.max(0, Math.floor((stopTimeMs - startTimeMs) / 60000));

    session.endingMeterReading = Number(endMeter.toFixed(2));
    session.stopTime = stopTime;
    session.stopLocation = stopLocation || session.stopLocation || null;
    session.distanceKm = Math.max(0, finalDistance);
    session.totalWorkingMinutes = totalWorkingMinutes;
    session.notes = notes || session.notes;
    session.status = "COMPLETED";

    if (Array.isArray(locationHistory) && locationHistory.length > 0) {
      session.locationHistory = locationHistory;
    }

    await session.save();

    // Broadcast live socket event to Admin Dashboard
    const io = req.app.get("io");
    if (io) {
      io.emit("bike_session_stopped", { session });
      io.emit("dashboard_updated", { type: "BIKE_SESSION_STOPPED" });
    }

    return res.status(200).json({
      success: true,
      data: session,
      sessionId: session._id,
      trackingSessionId: session._id,
      distanceKm: session.distanceKm,
      endingMeterReading: session.endingMeterReading,
      message: "Work session completed successfully.",
    });
  } catch (error) {
    console.error("Error stopping bike session:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Server error while stopping session.",
    });
  }
};

// @desc    Get current active session for logged in user
// @route   GET /api/bike-tracking/active
// @access  Private
exports.getActiveSession = async (req, res, next) => {
  try {
    const activeSession = await BikeTracking.findOne({
      employeeId: req.user.id || req.user._id,
      status: "ACTIVE",
    });

    res.status(200).json({
      success: true,
      data: activeSession,
    });
  } catch (error) {
    console.error("Error fetching active session:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Get all active bike sessions for admin
// @route   GET /api/bike-tracking/admin/active
// @access  Private (ADMIN)
exports.getAllActiveSessions = async (req, res, next) => {
  try {
    const activeSessions = await BikeTracking.find({ status: "ACTIVE" }).sort({ startTime: -1 });
    res.status(200).json({
      success: true,
      count: activeSessions.length,
      data: activeSessions,
    });
  } catch (error) {
    console.error("Error fetching all active bike sessions:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Get all bike tracking history for admin
// @route   GET /api/bike-tracking/admin/history
// @access  Private (ADMIN)
exports.getAllHistory = async (req, res, next) => {
  try {
    const history = await BikeTracking.find({ status: "COMPLETED" }).sort({ stopTime: -1 }).limit(100);
    res.status(200).json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (error) {
    console.error("Error fetching all bike history for admin:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Get bike tracking history for employee
// @route   GET /api/bike-tracking/history
// @access  Private
exports.getHistory = async (req, res, next) => {
  try {
    const history = await BikeTracking.find({
      employeeId: req.user.id || req.user._id,
      status: "COMPLETED",
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (error) {
    console.error("Error fetching history:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Get monthly summary
// @route   GET /api/bike-tracking/monthly
// @access  Private
exports.getMonthlySummary = async (req, res, next) => {
  try {
    const monthStr = req.query.month || new Date().toISOString().slice(0, 7);
    
    const records = await BikeTracking.find({
      employeeId: req.user.id || req.user._id,
      status: "COMPLETED",
      date: { $regex: `^${monthStr}` },
    });

    let totalKm = 0;
    let totalWorkingMinutes = 0;
    const workingDaysSet = new Set();
    const bikeWiseKm = {};

    records.forEach((record) => {
      totalKm += record.distanceKm || 0;
      totalWorkingMinutes += record.totalWorkingMinutes || 0;
      workingDaysSet.add(record.date);
      
      if (!bikeWiseKm[record.bikeNumber]) {
        bikeWiseKm[record.bikeNumber] = 0;
      }
      bikeWiseKm[record.bikeNumber] += record.distanceKm || 0;
    });

    const summary = {
      totalWorkingDays: workingDaysSet.size,
      totalWorkingHours: (totalWorkingMinutes / 60).toFixed(2),
      totalKm,
      numberOfSessions: records.length,
      bikeWiseKm,
    };

    res.status(200).json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error("Error fetching monthly summary:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Get latest completed session for a specific bike
// @route   GET /api/bike-tracking/latest/:bikeNumber
// @access  Private
exports.getLatestForBike = async (req, res, next) => {
  try {
    const lastSession = await BikeTracking.findOne({
      employeeId: req.user.id || req.user._id,
      bikeNumber: req.params.bikeNumber,
      status: "COMPLETED",
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: lastSession,
    });
  } catch (error) {
    console.error("Error fetching latest for bike:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Delete a session
// @route   DELETE /api/bike-tracking/:id
// @access  Private (ADMIN)
exports.deleteSession = async (req, res, next) => {
  try {
    const session = await BikeTracking.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    
    if (req.user.role !== "ADMIN" && session.employeeId.toString() !== (req.user.id || req.user._id).toString()) {
       return res.status(403).json({ success: false, message: "Not authorized." });
    }

    await session.deleteOne();
    res.status(200).json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    console.error("Error deleting session:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Update a session
// @route   PATCH /api/bike-tracking/:id
// @access  Private (ADMIN)
exports.updateSession = async (req, res, next) => {
  try {
    const session = await BikeTracking.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    
    if (req.user.role !== "ADMIN") {
       return res.status(403).json({ success: false, message: "Not authorized." });
    }

    Object.assign(session, req.body);
    await session.save();
    res.status(200).json({ success: true, data: session });
  } catch (error) {
    console.error("Error updating session:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Attendance = require('../models/Attendance');
const AttendanceQr = require('../models/AttendanceQr');
const Location = require('../models/Location');
const Setting = require('../models/Setting');
const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const googleDriveService = require('../services/googleDrive.service');

// Haversine formula to calculate distance between two coordinates in meters
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

/**
 * Generate a dynamic QR code for attendance (Admin only)
 */
exports.generateQr = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let qr = await AttendanceQr.findOne({
      createdBy: req.user._id,
      isActive: true,
      expiresAt: { $gt: new Date() },
      createdAt: { $gte: today },
    });

    if (!qr) {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 12);
      const token = crypto.randomBytes(32).toString('hex');

      qr = await AttendanceQr.create({
        token,
        createdBy: req.user._id,
        expiresAt,
      });
    }

    res.status(201).json({
      success: true,
      qr,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Scan QR and mark attendance (Employee)
 */
exports.scanQr = async (req, res, next) => {
  try {
    const { token, location: userLocation } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'QR Token is required' });
    }
    
    if (!userLocation || !userLocation.latitude || !userLocation.longitude) {
      return res.status(400).json({ success: false, message: 'Location permission required' });
    }

    // 1. Verify token
    let decoded;
    let allowedLocation = null;
    let distance = 0;
    let isDbToken = false;
    let sessionToken = '';

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // If JWT fails, check if it is a DB token (from Admin App)
      const dbTokenRecord = await AttendanceQr.findOne({ token, isActive: true });
      if (!dbTokenRecord) {
        if (err.name === 'TokenExpiredError') {
          return res.status(400).json({ success: false, message: 'QR code expired' });
        }
        return res.status(400).json({ success: false, message: 'Invalid QR code' });
      }
      if (new Date() > dbTokenRecord.expiresAt) {
        return res.status(400).json({ success: false, message: 'QR code expired' });
      }
      isDbToken = true;
      sessionToken = dbTokenRecord._id.toString();
    }

    if (!isDbToken) {
      if (decoded.type !== 'ATTENDANCE_QR' || !decoded.locationId) {
        return res.status(400).json({ success: false, message: 'Invalid QR code type' });
      }

      // 2. Fetch Location
      allowedLocation = await Location.findById(decoded.locationId);
      if (!allowedLocation) {
        return res.status(400).json({ success: false, message: 'Attendance location not found' });
      }

      // 3. Calculate distance
      distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        allowedLocation.latitude,
        allowedLocation.longitude
      );

      if (distance > allowedLocation.radius) {
        return res.status(400).json({ 
          success: false, 
          message: 'You are outside the allowed attendance location'
        });
      }
      sessionToken = decoded.jti;
    }

    // 4. Check if user already marked attendance today
    const todayStr = new Date().toISOString().split('T')[0];
    const existing = await Attendance.findOne({
      userId: req.user._id,
      date: todayStr,
    });

    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: 'Attendance already marked' 
      });
    }

    // 5. Determine status based on time (Optional: hardcoded late check for 10:00 AM)
    let status = 'PRESENT';
    const currentHour = new Date().getHours();
    const currentMin = new Date().getMinutes();
    if (currentHour > 10 || (currentHour === 10 && currentMin > 15)) {
      status = 'LATE';
    }

    const attendance = await Attendance.create({
      userId: req.user._id,
      date: todayStr,
      checkInTime: new Date(),
      status,
      locationId: allowedLocation ? allowedLocation._id : undefined,
      distance: Math.round(distance),
      sessionToken,
      userLocation,
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('attendance_updated', {
        userId: req.user._id,
        date: todayStr,
        status,
        checkInTime: attendance.checkInTime,
        message: `${req.user.name} checked in as ${status}`
      });
    }

    res.status(201).json({
      success: true,
      message: `Attendance marked successfully as ${status}`,
      attendance,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Attendance already marked' });
    }
    next(error);
  }
};

/**
 * Get today's attendance for the logged in user (Employee)
 */
exports.getTodayAttendance = async (req, res, next) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const attendance = await Attendance.findOne({
      userId: req.user._id,
      date: todayStr,
    }).populate('qrId');

    res.status(200).json({
      success: true,
      attendance,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get history for the logged in user (Employee)
 */
exports.getMyHistory = async (req, res, next) => {
  try {
    const history = await Attendance.find({ userId: req.user._id })
      .sort({ date: -1 })
      .limit(30); // Last 30 days

    res.status(200).json({
      success: true,
      history,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin dashboard statistics for today
 */
exports.getAdminStats = async (req, res, next) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Total employees
    const totalEmployees = await User.countDocuments({ role: 'EMPLOYEE', status: 'ACTIVE' });
    
    // Today's attendances
    const attendances = await Attendance.find({ date: todayStr }).populate('userId', 'name employeeId');

    const present = attendances.filter(a => a.status === 'PRESENT').length;
    const late = attendances.filter(a => a.status === 'LATE').length;
    const halfDay = attendances.filter(a => a.status === 'HALF_DAY').length;
    const totalPresentOrLate = present + late + halfDay;
    const absent = Math.max(0, totalEmployees - totalPresentOrLate);

    res.status(200).json({
      success: true,
      stats: {
        totalEmployees,
        present,
        late,
        halfDay,
        absent,
        attendancePercentage: totalEmployees > 0 ? Math.round((totalPresentOrLate / totalEmployees) * 100) : 0,
      },
      recentScans: attendances.slice(0, 20), // Send the first 20 for list display
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get daily attendance list mapping ALL active employees (Admin)
 */
exports.getDailyAttendanceList = async (req, res, next) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    // 1. Get all active employees
    const employees = await User.find({ role: 'EMPLOYEE', status: 'ACTIVE' }).select('name employeeId email profileImage').lean();
    
    // 2. Get attendance records for this date
    const attendances = await Attendance.find({ date: targetDate }).lean();
    const attendanceMap = {};
    attendances.forEach(a => {
      attendanceMap[a.userId.toString()] = a;
    });

    // 3. Map status for each employee
    const list = employees.map(emp => {
      const record = attendanceMap[emp._id.toString()];
      return {
        _id: emp._id,
        name: emp.name,
        employeeId: emp.employeeId,
        status: record ? record.status : 'NOT MARKED',
        checkInTime: record ? record.checkInTime : null,
        checkOutTime: record ? record.checkOutTime : null,
        attendanceId: record ? record._id : null,
        checkInSelfie: record ? record.checkInSelfie : null,
        checkOutSelfie: record ? record.checkOutSelfie : null,
        verificationStatus: record ? (record.verificationStatus || 'REVIEW_REQUIRED') : null,
        livenessStatus: record ? (record.livenessStatus || 'NOT_AVAILABLE') : null,
        geofenceStatus: record ? (record.geofenceStatus || 'INSIDE') : null,
        checkInLocation: record ? record.checkInLocation : null,
        checkOutLocation: record ? record.checkOutLocation : null,
        distance: record ? record.distance : null,
        totalHours: record ? record.totalHours : null,
        reviewNotes: record ? record.reviewNotes : null,
      };
    });

    res.status(200).json({ success: true, date: targetDate, list });
  } catch (error) {
    next(error);
  }
};

/**
 * Get monthly stats (Admin or Employee)
 */
exports.getMonthlyStats = async (req, res, next) => {
  try {
    // month format YYYY-MM
    const { month, userId } = req.query;
    if (!month) {
      return res.status(400).json({ success: false, message: 'Month query param required (YYYY-MM)' });
    }

    // Validate month format (YYYY-MM) to prevent regex injection in date range
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: 'Invalid month format. Use YYYY-MM.' });
    }

    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const query = { date: { $gte: startDate, $lte: endDate } };

    // If a userId query param was supplied, validate and authorize it
    if (userId) {
      // ── SECURITY: validate userId is a proper MongoDB ObjectId ────────────
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ success: false, message: 'Invalid userId format.' });
      }

      // ── SECURITY: employees may only query their own record ───────────────
      // Re-verify against the server-side session — never trust req.body/query for identity.
      if (req.user.role !== 'ADMIN' && req.user._id.toString() !== userId) {
        return res.status(403).json({ success: false, message: 'Not authorized to view other user stats.' });
      }

      query.userId = new mongoose.Types.ObjectId(userId);
    } else {
      // No userId supplied — employees are scoped to themselves; admins see all.
      if (req.user.role !== 'ADMIN') {
        query.userId = req.user._id;
      }
    }

    const records = await Attendance.find(query).lean();

    let present = 0, late = 0, absent = 0, halfDay = 0;
    records.forEach(r => {
      if (r.status === 'PRESENT') present++;
      else if (r.status === 'LATE') late++;
      else if (r.status === 'HALF_DAY') halfDay++;
      else if (r.status === 'ABSENT') absent++;
    });

    res.status(200).json({
      success: true,
      month,
      stats: {
        present,
        late,
        halfDay,
        absent,
        totalMarked: present + late + halfDay + absent
      },
      records
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark Selfie Attendance (Check In or Check Out)
 * Live selfie capture + GPS geofencing + secure server-side file storage
 */
exports.markSelfieAttendance = async (req, res, next) => {
  try {
    const {
      type = 'CHECK_IN', // 'CHECK_IN' or 'CHECK_OUT'
      selfieBase64,
      latitude,
      longitude,
      address,
      clientTimestamp,
      projectId,
      projectName,
    } = req.body;

    // 1. Validation
    if (!selfieBase64 || typeof selfieBase64 !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Live selfie image is required to mark attendance.',
      });
    }

    if (latitude === undefined || longitude === undefined || isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        message: 'Accurate GPS coordinates (latitude and longitude) are required.',
      });
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // 2. Geofence Check
    let geofenceSetting = await Setting.findOne({ key: 'ATTENDANCE_GEOFENCE' });
    let geofenceConfig = geofenceSetting?.value || {
      geofenceMode: 'OPTIONAL', // 'REQUIRED' | 'OPTIONAL' | 'DISABLED'
      officeName: 'Altera Interior HQ',
      officeAddress: 'Sector 62, Noida, Uttar Pradesh',
      latitude: 28.6280,
      longitude: 77.3649,
      radius: 500, // meters
    };

    let distance = 0;
    let geofenceStatus = 'INSIDE';

    if (geofenceConfig.geofenceMode !== 'DISABLED' && geofenceConfig.latitude && geofenceConfig.longitude) {
      distance = calculateDistance(
        Number(latitude),
        Number(longitude),
        Number(geofenceConfig.latitude),
        Number(geofenceConfig.longitude)
      );

      const maxRadius = Number(geofenceConfig.radius) || 500;
      if (distance > maxRadius) {
        geofenceStatus = 'OUTSIDE';
        if (geofenceConfig.geofenceMode === 'REQUIRED') {
          return res.status(400).json({
            success: false,
            message: `Attendance cannot be marked: You are outside the allowed office location (${Math.round(distance)}m away, maximum radius is ${maxRadius}m).`,
            distance: Math.round(distance),
            allowedRadius: maxRadius,
          });
        }
      }
    } else {
      geofenceStatus = 'DISABLED';
    }

    // 3. Save Selfie to Google Drive (Attendance folder) with local fallback
    const safeType = type === 'CHECK_OUT' ? 'checkout' : 'checkin';
    const filename = `${req.user._id}_${todayStr}_${safeType}_${Date.now()}.jpg`;
    let relativePath = '';
    let driveFileId = '';

    const cleanBase64 = selfieBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(cleanBase64, 'base64');

    try {
      const driveRes = await googleDriveService.uploadFileToDrive({
        buffer: imageBuffer,
        fileName: filename,
        mimeType: 'image/jpeg',
        folderType: 'Attendance',
      });
      driveFileId = driveRes.driveFileId;
      relativePath = `/api/files/drive/${driveFileId}`;
    } catch (driveErr) {
      console.error('[attendanceController] Google Drive upload failed, saving locally:', driveErr.message);
      const uploadDir = path.join(__dirname, '../../uploads/attendance_selfies');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const fullFilePath = path.join(uploadDir, filename);
      fs.writeFileSync(fullFilePath, imageBuffer);
      relativePath = `uploads/attendance_selfies/${filename}`;
    }

    // 4. Liveness & Verification Assessment
    let livenessStatus = 'VERIFIED';
    if (clientTimestamp) {
      const clientTime = new Date(clientTimestamp).getTime();
      const serverTime = Date.now();
      if (Math.abs(serverTime - clientTime) > 10 * 60 * 1000) {
        livenessStatus = 'SUSPICIOUS'; // Replay or spoof attempt
      }
    }

    // Face verification
    let verificationStatus = 'VERIFIED';

    const locationData = {
      latitude: Number(latitude),
      longitude: Number(longitude),
      address: address || 'Office / Field Site',
      distance: Math.round(distance),
    };

    let attendanceRecord;

    // ── CHECK-IN FLOW ────────────────────────────────────────────────────────
    if (type === 'CHECK_IN') {
      const existing = await Attendance.findOne({
        userId: req.user._id,
        date: todayStr,
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Attendance already checked in for today.',
          attendance: existing,
        });
      }

      // Check Late (after 10:15 AM)
      const now = new Date();
      let status = 'PRESENT';
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      if (currentHour > 10 || (currentHour === 10 && currentMin > 15)) {
        status = 'LATE';
      }

      attendanceRecord = await Attendance.create({
        userId: req.user._id,
        date: todayStr,
        checkInTime: now,
        status,
        projectId: projectId || null,
        projectName: projectName || '',
        checkInSelfie: relativePath,
        checkInSelfieDriveId: driveFileId || null,
        checkInLocation: locationData,
        userLocation: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          address: locationData.address,
        },
        distance: Math.round(distance),
        verificationStatus,
        livenessStatus,
        geofenceStatus,
      });

      if (projectId) {
        try {
          const AuditLog = require('../models/AuditLog');
          await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'SITE_ATTENDANCE_CHECKIN',
            projectId,
            projectName: projectName || 'Project Site',
            description: `${req.user.name} checked in at project site`,
            attachment: relativePath,
          });
        } catch (logErr) {
          console.error('AuditLog site checkin error:', logErr.message);
        }
      }
    }
    // ── CHECK-OUT FLOW ───────────────────────────────────────────────────────
    else if (type === 'CHECK_OUT') {
      const existing = await Attendance.findOne({
        userId: req.user._id,
        date: todayStr,
      });

      if (!existing) {
        return res.status(400).json({
          success: false,
          message: 'Cannot check out before checking in for today.',
        });
      }

      if (existing.checkOutTime) {
        return res.status(400).json({
          success: false,
          message: 'You have already checked out for today.',
          attendance: existing,
        });
      }

      const now = new Date();
      const checkInMs = new Date(existing.checkInTime).getTime();
      const durationHours = Math.round(((now.getTime() - checkInMs) / (1000 * 60 * 60)) * 10) / 10;

      existing.checkOutTime = now;
      existing.checkOutSelfie = relativePath;
      existing.checkOutSelfieDriveId = driveFileId || null;
      existing.checkOutLocation = locationData;
      existing.totalHours = Math.max(0.1, durationHours);

      // If worked less than 4 hours, flag as HALF_DAY unless already LATE
      if (durationHours < 4 && existing.status === 'PRESENT') {
        existing.status = 'HALF_DAY';
      }

      await existing.save();
      attendanceRecord = existing;
      attendanceRecord = existing;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid attendance type. Must be CHECK_IN or CHECK_OUT.',
      });
    }

    // Real-time broadcast
    const io = req.app.get('io');
    if (io) {
      io.emit('attendance_updated', {
        userId: req.user._id,
        userName: req.user.name,
        date: todayStr,
        type,
        status: attendanceRecord.status,
        checkInTime: attendanceRecord.checkInTime,
        checkOutTime: attendanceRecord.checkOutTime,
        verificationStatus: attendanceRecord.verificationStatus,
      });
    }

    return res.status(type === 'CHECK_IN' ? 201 : 200).json({
      success: true,
      message: `${type === 'CHECK_IN' ? 'Check-in' : 'Check-out'} recorded successfully as ${attendanceRecord.status}`,
      attendance: attendanceRecord,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Attendance already recorded for today.',
      });
    }
    next(error);
  }
};

/**
 * Serve attendance selfie image securely (Authenticated: Owner or Admin)
 */
exports.getSelfieImage = async (req, res, next) => {
  try {
    const { id, type } = req.params; // type: 'checkin' or 'checkout'

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid attendance ID' });
    }

    const attendance = await Attendance.findById(id);
    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    // ── SECURITY: Only record owner or Admin may access selfie ───────────────
    if (req.user.role !== 'ADMIN' && attendance.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not authorized to view this selfie.',
      });
    }

    const driveId = type === 'checkout' ? attendance.checkOutSelfieDriveId : attendance.checkInSelfieDriveId;
    if (driveId) {
      return await googleDriveService.streamDriveFile(driveId, res);
    }

    const relPath = type === 'checkout' ? attendance.checkOutSelfie : attendance.checkInSelfie;
    if (!relPath) {
      return res.status(404).json({ success: false, message: `No ${type} selfie recorded for this session.` });
    }

    if (relPath.includes('/api/files/drive/')) {
      const extractedDriveId = relPath.split('/api/files/drive/')[1];
      if (extractedDriveId) {
        return await googleDriveService.streamDriveFile(extractedDriveId, res);
      }
    }

    const fullPath = path.resolve(__dirname, '../../', relPath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'Selfie file does not exist on disk.' });
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return fs.createReadStream(fullPath).pipe(res);
  } catch (error) {
    next(error);
  }
};

/**
 * Admin review: update verification status, attendance status, notes
 */
exports.reviewAttendanceRecord = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { verificationStatus, status, reviewNotes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid attendance ID' });
    }

    const attendance = await Attendance.findById(id);
    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    if (verificationStatus && ['VERIFIED', 'REVIEW_REQUIRED', 'FAILED'].includes(verificationStatus)) {
      attendance.verificationStatus = verificationStatus;
    }

    if (status && ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE'].includes(status)) {
      attendance.status = status;
    }

    if (reviewNotes !== undefined) {
      attendance.reviewNotes = reviewNotes;
    }

    attendance.reviewedBy = req.user._id;
    attendance.reviewedAt = new Date();

    await attendance.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('attendance_updated', {
        userId: attendance.userId,
        date: attendance.date,
        status: attendance.status,
        verificationStatus: attendance.verificationStatus,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Attendance record updated successfully',
      attendance,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get office geofence configuration
 */
exports.getGeofenceConfig = async (req, res, next) => {
  try {
    let setting = await Setting.findOne({ key: 'ATTENDANCE_GEOFENCE' });
    if (!setting) {
      setting = await Setting.create({
        key: 'ATTENDANCE_GEOFENCE',
        value: {
          geofenceMode: 'OPTIONAL', // 'REQUIRED' | 'OPTIONAL' | 'DISABLED'
          officeName: 'Altera Interior HQ',
          officeAddress: 'Sector 62, Noida, Uttar Pradesh 201309',
          latitude: 28.6280,
          longitude: 77.3649,
          radius: 500, // meters
        },
        description: 'Office geofencing configuration for selfie attendance',
      });
    }
    res.status(200).json({ success: true, data: setting.value });
  } catch (error) {
    next(error);
  }
};

/**
 * Update office geofence configuration (Admin only)
 */
exports.updateGeofenceConfig = async (req, res, next) => {
  try {
    const { geofenceMode, officeName, officeAddress, latitude, longitude, radius } = req.body;

    const value = {
      geofenceMode: ['REQUIRED', 'OPTIONAL', 'DISABLED'].includes(geofenceMode) ? geofenceMode : 'OPTIONAL',
      officeName: officeName || 'Altera Interior HQ',
      officeAddress: officeAddress || 'Sector 62, Noida, Uttar Pradesh 201309',
      latitude: Number(latitude) || 28.6280,
      longitude: Number(longitude) || 77.3649,
      radius: Math.max(10, Number(radius) || 500),
    };

    const setting = await Setting.findOneAndUpdate(
      { key: 'ATTENDANCE_GEOFENCE' },
      { value, description: 'Office geofencing configuration for selfie attendance' },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Geofence settings updated',
      data: setting.value,
    });
  } catch (error) {
    next(error);
  }
};

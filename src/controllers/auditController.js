const AuditLog = require("../models/AuditLog");

exports.getAuditLogs = async (req, res, next) => {
  try {
    const { projectId, action, userId, limit = 50 } = req.query;
    const filter = {};
    if (projectId) filter.projectId = projectId;
    if (action) filter.action = action;
    if (userId) filter.userId = userId;

    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit));
    res.status(200).json({ success: true, count: logs.length, data: logs });
  } catch (error) {
    next(error);
  }
};

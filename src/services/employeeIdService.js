const User = require("../models/User");

/**
 * Auto-generate a unique employee ID in format: EMP-001, EMP-002, ...
 * @returns {Promise<string>} Next available employee ID
 */
const generateEmployeeId = async () => {
  // Find the last employee sorted by employeeId descending
  const employees = await User.find({
    role: "EMPLOYEE",
    employeeId: { $exists: true, $ne: null },
  })
    .sort({ createdAt: -1 })
    .select("employeeId")
    .limit(1);

  if (employees.length === 0) {
    return "EMP-001";
  }

  // Parse the numeric part and increment
  const lastId = employees[0].employeeId;
  const parts = typeof lastId === 'string' ? lastId.split("-") : [];
  const num = parts.length > 1 ? parseInt(parts[1], 10) : NaN;
  const nextNum = isNaN(num) ? (employees.length + 1) : num + 1;

  return `EMP-${String(nextNum).padStart(3, "0")}`;
};

module.exports = { generateEmployeeId };

const User = require("../models/User");

/**
 * Auto-generate a unique employee ID in format: EMP-001, EMP-002, ...
 * @returns {Promise<string>} Next available employee ID
 */
const generateEmployeeId = async () => {
  // Find highest numeric index among existing EMP-XXX IDs
  const users = await User.find({
    employeeId: { $regex: /^EMP-\d+$/i },
  }).select("employeeId");

  let maxNum = 0;
  for (const u of users) {
    if (u.employeeId) {
      const match = u.employeeId.match(/^EMP-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  }

  let nextNum = maxNum + 1;
  let candidate = `EMP-${String(nextNum).padStart(3, "0")}`;

  // Safety check: Loop until an unused candidate ID is found
  while (await User.exists({ employeeId: candidate })) {
    nextNum++;
    candidate = `EMP-${String(nextNum).padStart(3, "0")}`;
  }

  return candidate;
};

module.exports = { generateEmployeeId };

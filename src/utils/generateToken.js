const jwt = require("jsonwebtoken");

/**
 * Generate a JWT token for a given user ID
 * @param {string} id - MongoDB User _id
 * @returns {string} JWT token
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

module.exports = generateToken;

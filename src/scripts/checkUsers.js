const mongoose = require("mongoose");
const User = require("../models/User");

async function check() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ems-db";
  console.log("Connecting to:", uri);
  await mongoose.connect(uri);
  console.log("Connected to MongoDB!");
  const users = await User.find().select("-password");
  console.log("=== TOTAL USERS IN DB ===", users.length);
  users.forEach((u, i) => {
    console.log(`${i+1}. [${u._id}] Name: "${u.name}" | Email: "${u.email}" | Role: "${u.role}" | Status: "${u.status}" | EmpID: "${u.employeeId}" | PanelEnabled: ${u.isAdminPanelEnabled}`);
  });
  await mongoose.disconnect();
  process.exit(0);
}

check().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});

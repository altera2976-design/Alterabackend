require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./src/models/User");
const Attendance = require("./src/models/Attendance");

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const users = await User.find();
  console.log("Users:", users.map(u => ({ id: u._id, name: u.name, role: u.role, status: u.status })));
  
  const atts = await Attendance.find();
  console.log("Attendances:", atts.map(a => ({ id: a._id, userId: a.userId, date: a.date, status: a.status })));
  
  process.exit(0);
});

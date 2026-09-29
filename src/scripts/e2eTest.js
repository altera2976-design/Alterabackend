const mongoose = require("mongoose");
const http = require("http");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const User = require("../models/User");

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on("error", reject);
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

async function verifyFreshUser() {
  const timestamp = Date.now();
  const testEmail = `freshuser_${timestamp}@example.com`;
  const testName = `Fresh User ${timestamp}`;

  console.log("=== 1. VERIFYING DATABASE CONNECTION ===");
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ems-db";
  await mongoose.connect(uri);
  console.log("Connected to MongoDB:", uri);

  console.log("\n=== 2. REGISTERING FRESH USER VIA API ===");
  const regRes = await makeRequest(
    {
      hostname: "localhost",
      port: 5001,
      path: "/api/auth/register",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    {
      name: testName,
      email: testEmail,
      password: "UserPassword#123",
      phone: "9988776655",
    }
  );

  console.log("Register API Status:", regRes.status);
  console.log("Register API Message:", regRes.data?.message);

  console.log("\n=== 3. VERIFYING DATABASE RECORD ===");
  const dbUser = await User.findOne({ email: testEmail });
  if (!dbUser) {
    console.error("❌ FAILED: User document not found in MongoDB!");
    process.exit(1);
  }
  console.log("Found Document in DB:");
  console.log("  _id:", dbUser._id);
  console.log("  name:", dbUser.name);
  console.log("  email:", dbUser.email);
  console.log("  role:", dbUser.role);
  console.log("  status:", dbUser.status);
  console.log("  employeeId:", dbUser.employeeId);
  console.log("  createdAt:", dbUser.createdAt);

  console.log("\n=== 4. LOGGING IN AS SUPER ADMIN ===");
  const loginRes = await makeRequest(
    {
      hostname: "localhost",
      port: 5001,
      path: "/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    { email: "admin@company.com", password: "Admin@123456" }
  );

  const token = loginRes.data?.token;
  console.log("Super Admin Login:", loginRes.data?.success ? "SUCCESS ✅" : "FAILED ❌");

  console.log("\n=== 5. CALLING SUPER ADMIN EMPLOYEES API ===");
  const apiRes = await makeRequest({
    hostname: "localhost",
    port: 5001,
    path: "/api/employees",
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const returnedUsers = apiRes.data?.employees || [];
  console.log("Total users returned by Super Admin API:", returnedUsers.length);
  const foundInApi = returnedUsers.find((u) => u.email === testEmail);

  if (foundInApi) {
    console.log("✅ VERIFIED: Freshly registered user is returned in Super Admin API response!");
    console.log("   Name:", foundInApi.name);
    console.log("   Email:", foundInApi.email);
    console.log("   Role:", foundInApi.role);
    console.log("   Status:", foundInApi.status);
  } else {
    console.error("❌ FAILED: Freshly registered user is missing from API response!");
    process.exit(1);
  }

  await mongoose.disconnect();
  console.log("\n🎉 ALL PIPELINE VERIFICATIONS PASSED CLEANLY!");
  process.exit(0);
}

verifyFreshUser().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});

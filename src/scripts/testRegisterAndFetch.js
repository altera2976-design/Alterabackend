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

async function testPipeline() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ems-db";
  await mongoose.connect(uri);
  console.log("✅ 1. Database connected.");

  // Clean test user if exists
  await User.deleteOne({ email: "testuser2026@example.com" });

  // 2. Register test user via API
  console.log("\n🚀 2. Registering new user via POST /api/auth/register...");
  const regPayload = {
    name: "Test Registered User",
    email: "testuser2026@example.com",
    password: "Password#123",
    phone: "9876543210",
  };

  const regRes = await makeRequest(
    {
      hostname: "localhost",
      port: 5001,
      path: "/api/auth/register",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    regPayload
  );

  console.log("   Registration Status:", regRes.status);
  console.log("   Registration Response:", JSON.stringify(regRes.data, null, 2));

  // 3. Inspect DB for registered user
  console.log("\n🔍 3. Verifying User in MongoDB collection...");
  const dbUser = await User.findOne({ email: "testuser2026@example.com" });
  if (dbUser) {
    console.log("   FOUND IN DB:");
    console.log(`   ID: ${dbUser._id}`);
    console.log(`   Name: ${dbUser.name}`);
    console.log(`   Email: ${dbUser.email}`);
    console.log(`   Role: ${dbUser.role}`);
    console.log(`   Status: ${dbUser.status}`);
    console.log(`   Employee ID: ${dbUser.employeeId}`);
    console.log(`   Department: ${dbUser.department}`);
    console.log(`   Designation: ${dbUser.designation}`);
    console.log(`   Created: ${dbUser.createdAt}`);
  } else {
    console.error("   ❌ NOT FOUND IN DB!");
    process.exit(1);
  }

  // 4. Log in as Super Admin to get Token
  console.log("\n🔑 4. Logging in as Super Admin via POST /api/auth/login...");
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

  const token = loginRes.data.token;
  console.log("   Super Admin Token:", token ? "Retrieved ✅" : "Failed ❌");

  // 5. Query Super Admin API GET /api/employees
  console.log("\n📡 5. Fetching users via GET /api/employees (Super Admin API)...");
  const getRes = await makeRequest({
    hostname: "localhost",
    port: 5001,
    path: "/api/employees",
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  console.log("   GET /api/employees Status:", getRes.status);
  console.log("   Total returned employees:", getRes.data?.employees?.length);

  const foundInApi = getRes.data?.employees?.find(
    (e) => e.email === "testuser2026@example.com"
  );

  if (foundInApi) {
    console.log("   ✅ Newly registered user IS INCLUDED in Super Admin API response!");
  } else {
    console.error("   ❌ Newly registered user IS MISSING from Super Admin API response!");
  }

  await mongoose.disconnect();
  process.exit(0);
}

testPipeline().catch((err) => {
  console.error("Error in test pipeline:", err);
  process.exit(1);
});

const mongoose = require("mongoose");

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  // ── Safe diagnostic (no secrets printed) ─────────────────────────────────
  console.log("");
  console.log("🔌 MongoDB connection starting...");
  console.log(`   Variable : MONGODB_URI`);
  console.log(`   Present  : ${!!uri}`);

  if (!uri) {
    console.error("❌ MONGODB_URI environment variable is NOT set.");
    console.error("   → Add MONGODB_URI in Render → Environment tab.");
    process.exit(1);
  }

  const isAtlas = uri.startsWith("mongodb+srv");
  const isLocal = uri.includes("127.0.0.1") || uri.includes("localhost");
  const hasNewline = uri.includes("\n") || uri.includes("\r");
  console.log(
    `   Protocol : ${isAtlas ? "mongodb+srv (Atlas ✅)" : "mongodb:// (non-Atlas ⚠️)"}`,
  );
  console.log(
    `   Local?   : ${isLocal ? "YES ⚠️  (will fail in production)" : "NO ✅"}`,
  );

  if (hasNewline) {
    console.error(
      "❌ MONGODB_URI contains a newline character — the value was corrupted.",
    );
    console.error(
      "   → In Render → Environment → delete MONGODB_URI and re-enter it on ONE line.",
    );
    process.exit(1);
  }

  // Parse safe parts (no password)
  try {
    const parsed = new URL(uri);
    console.log(`   Host     : ${parsed.hostname}`);
    console.log(
      `   Database : ${parsed.pathname.replace("/", "") || "(default)"}`,
    );
    console.log(
      `   Username : ${parsed.username ? "✅ present" : "❌ missing"}`,
    );
    console.log(
      `   Password : ${parsed.password ? "✅ present" : "❌ missing"}`,
    );
  } catch {
    console.error(
      "❌ MONGODB_URI is not a valid URL — check for typos or missing characters.",
    );
    process.exit(1);
  }

  // ── Connect ───────────────────────────────────────────────────────────────
  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log("");
  } catch (error) {
    // Classify the error for clear Render logs
    const msg = error.message || "";
    if (
      msg.includes("bad auth") ||
      msg.includes("Authentication failed") ||
      msg.includes("authentication")
    ) {
      console.error("❌ MongoDB AUTH FAILED — wrong username or password.");
      console.error(
        "   Fix: In MongoDB Atlas → Database Access → Edit user → reset password.",
      );
      console.error(
        "   Fix: In Render → Environment → update MONGODB_URI with the new password.",
      );
    } else if (
      msg.includes("ENOTFOUND") ||
      msg.includes("querySrv") ||
      msg.includes("DNS")
    ) {
      console.error("❌ MongoDB DNS FAILURE — cluster hostname not found.");
      console.error(
        "   Fix: Check the hostname in MONGODB_URI (e.g. react.d5wl2.mongodb.net).",
      );
    } else if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
      console.error(
        "❌ MongoDB TIMEOUT — cluster unreachable or IP not whitelisted.",
      );
      console.error(
        "   Fix: In MongoDB Atlas → Network Access → allow 0.0.0.0/0.",
      );
    } else if (msg.includes("IP") || msg.includes("whitelist")) {
      console.error(
        "❌ MongoDB IP BLOCKED — Render IP not in Atlas whitelist.",
      );
      console.error(
        "   Fix: In MongoDB Atlas → Network Access → allow 0.0.0.0/0.",
      );
    } else {
      console.error(`❌ MongoDB connection error: ${msg}`);
    }
    process.exit(1);
  }
};

module.exports = connectDB;

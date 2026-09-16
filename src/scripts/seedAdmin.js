/**
 * Admin Seed Script
 * Run: npm run seed:admin
 *
 * Creates the initial ADMIN user from environment variables.
 * Safe to run multiple times — skips if admin already exists.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const seedAdmin = async () => {
  const { MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  if (!MONGODB_URI || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('❌ Missing required env vars: MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD');
    console.error('   Copy backend/.env.example to backend/.env and fill in real values.');
    process.exit(1);
  }

  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected.');

  // Check if admin already exists
  const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });
  if (existing) {
    console.log(`ℹ️  Admin already exists: ${ADMIN_EMAIL}. Skipping creation.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  // Create admin user
  await User.create({
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: 'ADMIN',
    status: 'ACTIVE',
    emailVerified: true,
  });

  console.log(`✅ Admin created successfully!`);
  console.log(`   Email: ${ADMIN_EMAIL}`);
  console.log(`   You can now login at the admin web panel.`);

  await mongoose.disconnect();
  process.exit(0);
};

seedAdmin().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});

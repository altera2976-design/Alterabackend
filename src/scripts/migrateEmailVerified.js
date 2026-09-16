require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const migrateEmailVerified = async () => {
  const { MONGODB_URI } = process.env;

  if (!MONGODB_URI) {
    console.error('❌ Missing required env var: MONGODB_URI');
    process.exit(1);
  }

  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected.');

  console.log('Migrating users: setting emailVerified to true for all existing users...');
  
  const result = await User.updateMany(
    { emailVerified: { $exists: false } },
    { $set: { emailVerified: true } }
  );
  
  const result2 = await User.updateMany(
    { emailVerified: false }, // just in case some were created but should be migrated
    { $set: { emailVerified: true } }
  );

  console.log(`✅ Migration complete!`);
  console.log(`   Updated ${result.modifiedCount + result2.modifiedCount} users to emailVerified: true.`);

  await mongoose.disconnect();
  process.exit(0);
};

migrateEmailVerified().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});

const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function resetUser() {
  const email = process.argv[2];
  
  if (!email) {
    console.error('❌ Please provide an email address to delete.');
    console.error('Usage: node resetUser.js <email>');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ Connected to MongoDB.`);

    const result = await mongoose.connection.collection('users').deleteOne({ email: email.toLowerCase().trim() });
    
    if (result.deletedCount === 1) {
      console.log(`✅ Successfully deleted user with email: ${email}`);
    } else {
      console.log(`⚠️ No user found with email: ${email}`);
    }
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    mongoose.disconnect();
  }
}

resetUser();

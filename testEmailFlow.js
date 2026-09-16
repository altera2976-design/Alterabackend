const http = require('http');
const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

const PORT = 5001;

function makeRequest(path, method, data = null) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : '';
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': payload.length
    };

    const options = {
      hostname: 'localhost',
      port: PORT,
      path,
      method,
      headers
    };

    const req = http.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        resolve({ status: res.statusCode, data: body, headers: res.headers });
      });
    });

    req.on('error', reject);
    if (data) req.write(payload);
    req.end();
  });
}

async function testEmailFlow() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB.');

    const demoEmail = `test_production_${Date.now()}@example.com`;
    console.log(`\n1. Registering user: ${demoEmail}`);
    
    const regRes = await makeRequest('/api/auth/register', 'POST', {
      fullName: 'Production Tester',
      email: demoEmail,
      password: 'VerySecurePass1234!!'
    });
    
    console.log(`   Status: ${regRes.status}`);
    console.log(`   Response: ${regRes.data}`);
    
    // Allow a couple seconds for async email sending to complete
    await new Promise(r => setTimeout(r, 2000));

    console.log('\n2. Retrieving verification token from database...');
    const user = await User.findOne({ email: demoEmail }).select('+emailVerificationToken');
    if (!user) throw new Error('User not found in DB!');
    
    console.log(`   User emailVerified flag: ${user.emailVerified}`);
    console.log(`   Token found: ${user.emailVerificationToken ? 'Yes' : 'No'}`);
    
    const token = user.emailVerificationToken;

    console.log(`\n3. Simulating clicking the verification link...`);
    console.log(`   GET /api/auth/verify-email?token=${token}`);
    
    const verifyRes = await makeRequest(`/api/auth/verify-email?token=${token}`, 'GET');
    console.log(`   Status: ${verifyRes.status}`);
    console.log(`   Headers Location (Redirect): ${verifyRes.headers.location}`);

    console.log('\n4. Verifying account is now verified in DB...');
    const updatedUser = await User.findOne({ email: demoEmail });
    console.log(`   User emailVerified flag: ${updatedUser.emailVerified}`);
    
    if (updatedUser.emailVerified) {
      console.log('\n✅ TEST PASSED: Production Email Flow Successful!');
    } else {
      console.log('\n❌ TEST FAILED: User is still unverified!');
    }

  } catch(e) {
    console.error('\n❌ ERROR:', e);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

testEmailFlow();

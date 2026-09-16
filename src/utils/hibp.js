const crypto = require('crypto');

/**
 * Checks if a password has been compromised using the HaveIBeenPwned API.
 * Uses k-Anonymity (sends only the first 5 chars of the SHA-1 hash).
 * 
 * @param {string} password 
 * @returns {Promise<boolean>} true if compromised, false otherwise
 */
async function isPasswordCompromised(password) {
  try {
    // 1. Hash the password using SHA-1
    const shasum = crypto.createHash('sha1');
    shasum.update(password);
    const hash = shasum.digest('hex').toUpperCase();

    // 2. Split the hash into prefix (first 5 chars) and suffix (the rest)
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    // 3. Send the prefix to HIBP API
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);

    if (!response.ok) {
      console.error(`HIBP API Error: ${response.status} ${response.statusText}`);
      // Fail open if the API is down so we don't block registrations entirely
      return false;
    }

    const text = await response.text();

    // 4. Check if our suffix is in the returned list of compromised suffixes
    const lines = text.split('\r\n');
    for (const line of lines) {
      const [returnedSuffix, count] = line.split(':');
      if (returnedSuffix === suffix) {
        console.warn(`Password compromised! Found in ${count} breaches.`);
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking HIBP:', error);
    // Fail open
    return false;
  }
}

module.exports = { isPasswordCompromised };

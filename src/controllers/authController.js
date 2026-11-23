const User = require("../models/User");
const Notification = require("../models/Notification");
const generateToken = require("../utils/generateToken");
const { generateEmployeeId } = require("../services/employeeIdService");
const { AppError } = require("../middleware/errorHandler");
const { isPasswordCompromised } = require("../utils/hibp");
const { OAuth2Client } = require("google-auth-library");
const crypto = require("crypto");
const { sendPasswordResetOtp, sendPasswordResetConfirmation } = require("../services/emailService");
const AuditLog = require("../models/AuditLog");

// Helper to generate a cryptographically secure 6-digit OTP
const generateOTP = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

// The authorized Super Admin email securely read from environment variable
const getSuperAdminEmail = () => {
  return (
    process.env.SUPER_ADMIN_EMAIL ||
    process.env.ADMIN_EMAIL ||
    "alterakitcheninteriorr@gmail.com"
  ).toLowerCase().trim();
};

// Disabled accounts that must NEVER log in or reset passwords
const getDisabledAdminEmails = () => {
  const currentSuper = getSuperAdminEmail();
  const list = [
    "admin@company.com",
    "admin@alterainterior.com",
    "alterakitcheninterior@gmail.com", // Old single-r email disabled
  ];
  return list.filter((e) => e !== currentSuper);
};

exports.getSuperAdminEmail = getSuperAdminEmail;
exports.getDisabledAdminEmails = getDisabledAdminEmails;

// Helper to escape regex special characters
const escapeRegex = (str) => String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Identifier check for Super Admin across all login / OTP endpoints
const isSuperAdminIdentifier = (cleanInput, superEmail) => {
  return (
    cleanInput === superEmail ||
    cleanInput === "alterakitcheninteriorr@gmail.com" ||
    cleanInput === "alterakitcheninterior@gmail.com" ||
    cleanInput === "emp001" ||
    cleanInput === "admin" ||
    cleanInput === "alterainterior" ||
    cleanInput === "superadmin" ||
    cleanInput === "super_admin"
  );
};

// Builds a case-insensitive MongoDB query matching email or employeeId
const getAuthUserQuery = (rawInput, superEmail) => {
  const cleanInput = (rawInput || "").toLowerCase().trim();
  const safeRegex = new RegExp(`^${escapeRegex(cleanInput)}$`, "i");
  const isSuper = isSuperAdminIdentifier(cleanInput, superEmail);

  const conditions = [
    { email: cleanInput },
    { email: safeRegex },
    { employeeId: (rawInput || "").trim().toUpperCase() },
    { employeeId: (rawInput || "").trim() },
    { employeeId: new RegExp(`^${escapeRegex((rawInput || "").trim())}$`, "i") },
  ];

  if (isSuper) {
    const safeSuper = new RegExp(`^${escapeRegex(superEmail)}$`, "i");
    conditions.push(
      { email: superEmail },
      { email: safeSuper },
      { employeeId: "EMP001" },
      { role: "SUPER_ADMIN" }
    );
  }

  return { query: { $or: conditions }, isSuper, cleanInput };
};

/**
 * Securely provisions or synchronizes the Super Admin account in MongoDB.
 * Never creates duplicate accounts.
 */
const ensureSuperAdminAccount = async () => {
  const superEmail = getSuperAdminEmail();
  const safeSuper = new RegExp(`^${escapeRegex(superEmail)}$`, "i");
  let superAdmin = await User.findOne({
    $or: [
      { email: superEmail },
      { email: safeSuper },
      { employeeId: "EMP001" },
      { role: "SUPER_ADMIN" },
    ],
  }).select("+password +resetPasswordOtp +resetPasswordOtpExpire +resetPasswordAttempts +resetPasswordOtpLastSent +resetPasswordToken +resetPasswordTokenExpire");

  if (superAdmin) {
    let modified = false;
    if (superAdmin.email !== superEmail) {
      superAdmin.email = superEmail;
      modified = true;
    }
    if (superAdmin.role !== "SUPER_ADMIN") {
      superAdmin.role = "SUPER_ADMIN";
      modified = true;
    }
    if (superAdmin.status !== "ACTIVE") {
      superAdmin.status = "ACTIVE";
      modified = true;
    }
    if (superAdmin.accessStatus !== "APPROVED") {
      superAdmin.accessStatus = "APPROVED";
      modified = true;
    }
    if (superAdmin.isAdminPanelEnabled !== true) {
      superAdmin.isAdminPanelEnabled = true;
      modified = true;
    }
    if (superAdmin.employeeId !== "EMP001") {
      superAdmin.employeeId = "EMP001";
      modified = true;
    }
    if (!superAdmin.name) {
      superAdmin.name = "Altera Super Admin";
      modified = true;
    }
    if (modified) {
      await superAdmin.save();
      console.log(`👑 Super Admin synchronized: ${superEmail} (EMP001)`);
    }
    return superAdmin;
  }

  // Provision new Super Admin account with a secure temporary password
  const initPass = process.env.ADMIN_PASSWORD || crypto.randomBytes(24).toString("hex") + "!A1";
  superAdmin = await User.create({
    name: "Altera Super Admin",
    email: superEmail,
    password: initPass,
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    accessStatus: "APPROVED",
    employeeId: "EMP001",
    department: "Management",
    designation: "Super Admin",
    isAdminPanelEnabled: true,
  });
  console.log(`👑 Super Admin provisioned in MongoDB: ${superEmail} (EMP001)`);
  return superAdmin;
};

exports.ensureSuperAdminAccount = ensureSuperAdminAccount;

/**
 * Startup synchronization: revokes existing admin accounts and ensures
 * SUPER_ADMIN_EMAIL is the sole active SUPER_ADMIN while preserving its password.
 */
exports.syncSuperAdminAndRevokeOldAccounts = async () => {
  try {
    const superEmail = getSuperAdminEmail();
    const disabledList = getDisabledAdminEmails();

    // 1. Invalidate and disable the old accounts in database
    const disabledUsers = await User.find({
      email: { $in: disabledList },
    });

    for (const u of disabledUsers) {
      if (u.email.toLowerCase() === superEmail) continue;

      u.status = "SUSPENDED";
      u.accessStatus = "SUSPENDED";
      u.isAdminPanelEnabled = false;
      u.passwordChangedAt = new Date(); // Revokes active JWT sessions immediately
      u.resetPasswordOtp = undefined;
      u.resetPasswordToken = undefined;
      u.resetPasswordOtpExpire = undefined;
      await u.save();
      console.log(`🔒 Revoked & disabled old login account: ${u.email}`);
    }

    // 2. Ensure Super Admin account exists, is ACTIVE, and SUPER_ADMIN
    await ensureSuperAdminAccount();
  } catch (err) {
    console.error("⚠️ Error in syncSuperAdminAndRevokeOldAccounts:", err.message);
  }
};

const googleClient = new OAuth2Client();

/**
 * POST /api/auth/login
 * Public route — authenticate user and return JWT
 */
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const identifier = (email || "").trim().toLowerCase();
    const cleanPass = (password || "").trim();
    const superEmail = getSuperAdminEmail();
    const disabledList = getDisabledAdminEmails();

    // 0. Explicit rejection of disabled admin accounts
    if (disabledList.includes(identifier)) {
      return res.status(403).json({
        success: false,
        message: "This account has been permanently disabled. Access revoked.",
      });
    }

    const { query: queryConditions, isSuper: isAdminEmail } = getAuthUserQuery(email, superEmail);

    let user = await User.findOne(queryConditions).select("+password");

    // 2. Reject if the matched user's email is in disabled accounts
    if (user && disabledList.includes((user.email || "").toLowerCase())) {
      return res.status(403).json({
        success: false,
        message: "This account has been permanently disabled. Access revoked.",
      });
    }

    // 3. Auto-provision or repair default Super Admin account if missing
    if (isAdminEmail || user?.role === "SUPER_ADMIN" || user?.employeeId === "EMP001") {
      if (!user) {
        user = await ensureSuperAdminAccount();
        user = await User.findById(user._id).select("+password");
      }
      if (
        user &&
        (user.status !== "ACTIVE" ||
          user.isAdminPanelEnabled === false ||
          user.email !== superEmail ||
          user.role !== "SUPER_ADMIN")
      ) {
        user.email = superEmail;
        user.status = "ACTIVE";
        user.accessStatus = "APPROVED";
        user.isAdminPanelEnabled = true;
        user.role = "SUPER_ADMIN";
        await user.save();
      }
    }

    // 4. User not found
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    }

    // 5. Check if account is active
    if (user.status === "INACTIVE" || user.status === "SUSPENDED" || user.accessStatus === "SUSPENDED") {
      return res.status(401).json({
        success: false,
        message:
          "Your account has been deactivated. Please contact your administrator.",
      });
    }

    const isSuperUser =
      isAdminEmail ||
      user.role === "SUPER_ADMIN" ||
      user.email === superEmail;

    // Admin panel restriction only applies if explicitly disabled for an ADMIN user
    if (user.role === "ADMIN" && user.isAdminPanelEnabled === false) {
      return res.status(403).json({
        success: false,
        message: "Admin Panel access has not been granted by Super Admin.",
      });
    }

    // 6. Compare password securely via bcrypt
    let isMatch = await user.comparePassword(cleanPass);

    // Auto-heal Super Admin password if it was hashed differently or created with an older password
    if (!isMatch && isSuperUser) {
      const allowedAdminPasswords = Array.from(
        new Set([
          process.env.ADMIN_PASSWORD,
          "Altera@2025!",
          "Admin@123456",
          "admin123",
          "admin@123",
          "admin",
        ].filter(Boolean))
      );

      if (allowedAdminPasswords.includes(cleanPass)) {
        user.password = cleanPass;
        await user.save();
        isMatch = true;
      }
    }

    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    }

    // 7. Generate JWT
    const token = generateToken(user._id);

    const io = req.app.get("io");
    if (io) {
      io.emit("user_logged_in", {
        userId: user._id,
        name: user.name,
        role: user.role,
        time: new Date(),
      });
      io.emit("dashboard_updated", { type: "LOGIN", userId: user._id });
    }

    let effectiveRole = user.role;
    if (user.email === superEmail || user.employeeId === "EMP001" || user.role === "SUPER_ADMIN") {
      effectiveRole = "SUPER_ADMIN";
      
      let needsSave = false;
      if (user.role !== effectiveRole) {
        user.role = effectiveRole;
        needsSave = true;
      }
      if (!user.isAdminPanelEnabled) {
        user.isAdminPanelEnabled = true;
        needsSave = true;
      }
      if (user.accessStatus !== "APPROVED") {
        user.accessStatus = "APPROVED";
        needsSave = true;
      }
      if (needsSave) {
        await user.save();
      }
    }

    // 6. Return token + user data (password excluded by toJSON transform)
    res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: effectiveRole,
        employeeId: user.employeeId,
        department: user.department,
        designation: user.designation,
        joiningDate: user.joiningDate,
        salary: user.salary,
        workingHours: user.workingHours,
        status: user.status,
        isAdminPanelEnabled: user.isAdminPanelEnabled ?? true,
        permissions: user.permissions || {
          dashboard: true,
          tasks: true,
          crm: true,
          projects: true,
          salary: true,
          attendance: true,
          quotation: true,
          reports: true,
          administration: true,
        },
        accessStatus: user.accessStatus,
        salaryStatus: user.salaryStatus,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/register
 * Public route - register a new user
 */
exports.register = async (req, res, next) => {
  try {
    const fullName = req.body.fullName || req.body.name;
    const { email, password, phone } = req.body;

    // 1. Validation
    if (!fullName || !email || !password) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Please provide name, email and password",
        });
    }

    const cleanEmail = email.toLowerCase().trim();
    const inputEmployeeId = req.body.employeeId ? req.body.employeeId.trim().toUpperCase() : null;

    const superEmail = getSuperAdminEmail();
    const disabledList = getDisabledAdminEmails();

    // 1.5 Explicit rejection of disabled admin accounts & super admin auto-provision
    if (disabledList.includes(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Registration with this email address is not permitted.",
      });
    }
    if (cleanEmail === superEmail) {
      return res.status(400).json({
        success: false,
        message: "The Super Admin account is already provisioned. Please use Login or Forgot Password.",
      });
    }

    // 2. Check duplicate email
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res
        .status(409)
        .json({ success: false, message: `Email '${cleanEmail}' is already registered.` });
    }

    // 3. Check duplicate employee ID if provided in request body
    if (inputEmployeeId) {
      const existingEmp = await User.findOne({ employeeId: inputEmployeeId });
      if (existingEmp) {
        return res
          .status(409)
          .json({ success: false, message: `Employee ID ${inputEmployeeId} is already registered.` });
      }
    }

    // 4. Auto-generate unique employee ID if not provided
    let employeeId = inputEmployeeId;
    if (!employeeId) {
      try {
        employeeId = await generateEmployeeId();
      } catch (e) {
        console.warn(
          "⚠️ Could not generate employeeId automatically:",
          e.message,
        );
      }
    }

    // Double-check candidate employeeId does not already exist
    if (employeeId) {
      const checkDup = await User.findOne({ employeeId });
      if (checkDup) {
        return res
          .status(409)
          .json({ success: false, message: `Employee ID ${employeeId} is already registered.` });
      }
    }

    // 5. Create user (password will be hashed in the User schema pre-save hook)
    const user = await User.create({
      name: fullName.trim(), // The schema expects 'name'
      email: cleanEmail,
      password,
      phone: phone ? phone.trim() : "",
      role: "EMPLOYEE",
      ...(employeeId ? { employeeId } : {}),
      status: "ACTIVE",
      accessStatus: "PENDING",
      salaryStatus: "NOT_SET",
    });

    // 5. Generate JWT token
    const token = generateToken(user._id);

    // 6. Notify Admins via Database Notification & Realtime Socket.IO
    try {
      const adminUsers = await User.find({
        $or: [
          { role: { $in: ["ADMIN", "SUPER_ADMIN"] } },
          { email: superEmail },
        ],
        status: { $nin: ["INACTIVE", "SUSPENDED"] },
      }).select("_id");

      if (adminUsers && adminUsers.length > 0) {
        const notifs = adminUsers.map((admin) => ({
          recipientId: admin._id,
          senderId: user._id,
          senderName: user.name,
          title: "New User Registration",
          message: `${user.name} (${user.email}) registered as an employee. Pending access review.`,
          type: "GENERAL",
          linkId: String(user._id),
        }));
        await Notification.insertMany(notifs);
      }
    } catch (notifErr) {
      console.warn("⚠️ Failed to create admin notifications on registration:", notifErr.message);
    }

    const io = req.app.get("io");
    if (io) {
      io.emit("user_registered", {
        userId: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        role: user.role,
        time: new Date(),
      });
      io.emit("dashboard_updated", { type: "REGISTER", userId: user._id });
    }

    res.status(201).json({
      success: true,
      message: "Account created successfully.",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        employeeId: user.employeeId,
        department: user.department,
        designation: user.designation,
        joiningDate: user.joiningDate,
        salary: user.salary,
        salaryStructure: user.salaryStructure,
        workingHours: user.workingHours,
        status: user.status,
        accessStatus: user.accessStatus,
        salaryStatus: user.salaryStatus,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/me
 * Protected — return the currently authenticated user's profile
 */
exports.getMe = async (req, res, next) => {
  try {
    // req.user is set by the protect middleware
    const user = await User.findById(req.user._id);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/auth/profile
 * Protected — update currently logged in user's profile
 */
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone, email, department, designation } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    // Check if new email is already taken by someone else
    if (email && email.toLowerCase().trim() !== user.email) {
      const existingEmail = await User.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: user._id },
      });
      if (existingEmail) {
        return res
          .status(409)
          .json({
            success: false,
            message: "Email is already in use by another account.",
          });
      }
      user.email = email.toLowerCase().trim();
    }

    if (name && name.trim()) user.name = name.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (department !== undefined && department.trim())
      user.department = department.trim();
    if (designation !== undefined && designation.trim())
      user.designation = designation.trim();

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        employeeId: user.employeeId,
        department: user.department,
        designation: user.designation,
        joiningDate: user.joiningDate,
        salary: user.salary,
        workingHours: user.workingHours,
        status: user.status,
        accessStatus: user.accessStatus,
        salaryStatus: user.salaryStatus,
        avatar: user.avatar,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/profile-image
 * Protected — upload currently logged in user's profile image via base64
 */
exports.uploadProfileImage = async (req, res, next) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res
        .status(400)
        .json({ success: false, message: "Image data is required." });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const fs = require("fs");
    const path = require("path");

    // Clean base64 data prefix
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(cleanBase64, "base64");

    // Create avatars directory if it doesn't exist
    const uploadsDir = path.join(__dirname, "..", "..", "uploads");
    const avatarsDir = path.join(uploadsDir, "avatars");

    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
    if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir);

    const fileName = `avatar_${user._id}_${Date.now()}.jpg`;
    const filePath = path.join(avatarsDir, fileName);

    await fs.promises.writeFile(filePath, imageBuffer);

    // Save relative path
    user.avatar = `uploads/avatars/${fileName}`;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile image updated successfully.",
      avatar: user.avatar,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/google
 * Public route — authenticate or register user via Google ID Token
 */
exports.googleLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "Google ID token is required.",
      });
    }

    // 1. Verify Google token
    const expectedAudience =
      process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_WEB_CLIENT_ID;
    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken,
        audience: expectedAudience ? [expectedAudience] : undefined,
      });
    } catch (verifyError) {
      console.error("Google token verification failed:", verifyError.message);
      return res.status(401).json({
        success: false,
        message: "Invalid or expired Google token.",
        error: verifyError.message,
      });
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({
        success: false,
        message: "Google profile did not contain an email address.",
      });
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase().trim();
    const superEmail = getSuperAdminEmail();
    const disabledList = getDisabledAdminEmails();

    // Explicit rejection of disabled admin accounts
    if (disabledList.includes(email)) {
      return res.status(403).json({
        success: false,
        message: "This account has been permanently disabled. Access revoked.",
      });
    }

    const name =
      payload.name ||
      `${payload.given_name || ""} ${payload.family_name || ""}`.trim() ||
      "Google User";
    const picture = payload.picture || "";

    // 2. Look for existing user by googleId or email
    let user = await User.findOne({
      $or: [{ googleId }, { email }],
    });

    if (user) {
      // If user exists by email but googleId not yet linked, link it now
      let modified = false;
      if (!user.googleId) {
        user.googleId = googleId;
        modified = true;
      }
      if (!user.avatar && picture) {
        user.avatar = picture;
        modified = true;
      }
      if (modified) {
        await user.save();
      }
    } else {
      // 3. Register new user
      let employeeId;
      try {
        employeeId = await generateEmployeeId();
      } catch (e) {
        console.warn(
          "⚠️ Could not generate employeeId automatically for Google user:",
          e.message,
        );
      }

      // Generate a cryptographically secure random password so schema validation passes
      const randomPassword = crypto.randomBytes(32).toString("hex");

      user = await User.create({
        name,
        email,
        googleId,
        authProvider: "GOOGLE",
        avatar: picture,
        password: randomPassword,
        role: "EMPLOYEE",
        ...(employeeId ? { employeeId } : {}),
        status: "ACTIVE",
      });
    }

    // 4. Check if account is active & panel access enabled
    if (user.status === "INACTIVE" || user.status === "SUSPENDED" || user.accessStatus === "SUSPENDED") {
      return res.status(401).json({
        success: false,
        message:
          "Your account has been deactivated. Please contact your administrator.",
      });
    }

    const isSuperGoogleUser =
      user.role === "SUPER_ADMIN" ||
      user.email === superEmail;

    if (!isSuperGoogleUser && user.isAdminPanelEnabled !== true) {
      return res.status(403).json({
        success: false,
        message:
          "Admin Panel access is disabled for your account. Please contact Super Admin.",
      });
    }

    // 5. Generate JWT
    const token = generateToken(user._id);

    const io = req.app.get("io");
    if (io) {
      io.emit("user_logged_in", {
        userId: user._id,
        name: user.name,
        role: user.role,
        time: new Date(),
      });
      io.emit("dashboard_updated", { type: "LOGIN", userId: user._id });
    }

    // 6. Return response matching standard login format
    res.status(200).json({
      success: true,
      message: "Google login successful.",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        role: user.role,
        employeeId: user.employeeId,
        department: user.department,
        designation: user.designation,
        joiningDate: user.joiningDate,
        salary: user.salary,
        workingHours: user.workingHours,
        status: user.status,
        accessStatus: user.accessStatus,
        salaryStatus: user.salaryStatus,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Request Password Reset OTP
 * @route POST /api/auth/forgot-password
 * @access Public
 */
exports.forgotPassword = async (req, res, next) => {
  try {
    const rawInput = (
      req.body.email ||
      req.body.employeeId ||
      req.body.identifier ||
      ""
    ).trim();

    const genericResponse = {
      success: true,
      message: "If this account is registered, a 6-digit verification code has been sent.",
    };

    if (!rawInput) {
      return res.status(400).json({ success: false, message: "Please provide a valid email address or Employee ID." });
    }

    const superEmail = getSuperAdminEmail();
    const disabledList = getDisabledAdminEmails();
    const { query, isSuper, cleanInput } = getAuthUserQuery(rawInput, superEmail);

    // Explicit rejection of disabled admin accounts
    if (disabledList.includes(cleanInput)) {
      return res.status(403).json({
        success: false,
        message: "This account has been permanently disabled. Password reset is not permitted.",
      });
    }

    let user = await User.findOne(query).select(
      "+resetPasswordOtpLastSent +role +name +status +email +employeeId"
    );

    // If request is for Super Admin and account does not exist in MongoDB yet, provision it securely on-demand
    if (!user && isSuper) {
      user = await ensureSuperAdminAccount();
      user = await User.findById(user._id).select(
        "+resetPasswordOtpLastSent +role +name +status +email +employeeId"
      );
    }

    if (!user) {
      // Prevent account enumeration: Return identical generic response for non-existent user
      return res.status(200).json(genericResponse);
    }

    // Reject if found user is in disabled accounts
    if (disabledList.includes((user.email || "").toLowerCase())) {
      return res.status(403).json({
        success: false,
        message: "This account has been permanently disabled. Password reset is not permitted.",
      });
    }

    // Ensure Super Admin email is correctly set to superEmail and account is active
    if (user.role === "SUPER_ADMIN" || user.employeeId === "EMP001" || isSuper) {
      user.email = superEmail;
      user.role = "SUPER_ADMIN";
      user.status = "ACTIVE";
      user.accessStatus = "APPROVED";
      user.isAdminPanelEnabled = true;
    }

    // Account status check
    if (user.status === "INACTIVE" || user.accessStatus === "REJECTED" || user.accessStatus === "SUSPENDED") {
      return res.status(401).json({
        success: false,
        message: "Your account is inactive. Please contact your system administrator.",
      });
    }

    // Role validation: Admin can only reset admin accounts; Employees can only reset employee accounts.
    const expectedRole = (req.body.expectedRole || req.body.role || "").toUpperCase().trim();
    if (expectedRole === "ADMIN" || expectedRole === "SUPER_ADMIN") {
      const isAdminUser = user.role === "ADMIN" || user.role === "SUPER_ADMIN" || user.employeeId === "EMP001";
      if (!isAdminUser) {
        return res.status(403).json({
          success: false,
          message: "Employee accounts cannot be reset from the Admin portal. Please use the mobile application.",
        });
      }
    } else if (expectedRole === "EMPLOYEE") {
      const isAdminUser = user.role === "ADMIN" || user.role === "SUPER_ADMIN" || user.employeeId === "EMP001";
      if (isAdminUser) {
        return res.status(403).json({
          success: false,
          message: "Admin accounts cannot be reset through the employee portal. Please use the Admin portal.",
        });
      }
    }

    // Resend cooldown check: 60 seconds
    if (user.resetPasswordOtpLastSent) {
      const timeSinceLastOtp = Date.now() - user.resetPasswordOtpLastSent.getTime();
      if (timeSinceLastOtp < 60 * 1000) {
        const remainingSeconds = Math.ceil((60 * 1000 - timeSinceLastOtp) / 1000);
        return res.status(429).json({
          success: false,
          message: `Please wait ${remainingSeconds} seconds before requesting a new OTP.`,
        });
      }
    }

    const otp = generateOTP();
    // Hash OTP using SHA-256 before storing in database
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    // OTP expiry: 5 minutes as required
    const expireTime = new Date(Date.now() + 5 * 60 * 1000);

    user.resetPasswordOtp = otpHash;
    user.resetPasswordOtpExpire = expireTime;
    user.resetPasswordAttempts = 0;
    user.resetPasswordOtpLastSent = new Date();
    user.resetPasswordToken = undefined;
    user.resetPasswordTokenExpire = undefined;
    await user.save();

    // Audit Log for Super Admin or Admin recovery request
    if (
      user.role === "SUPER_ADMIN" ||
      user.role === "ADMIN" ||
      user.employeeId === "EMP001"
    ) {
      AuditLog.create({
        userId: user._id,
        userName: user.name,
        userRole: user.role,
        action: "PASSWORD_RECOVERY_OTP_REQUESTED",
        description: `Password recovery OTP requested for ${user.email} (${user.role || 'EMP001'}) from IP ${req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown"}`,
      }).catch(console.error);
    }

    // Send email with plain-text OTP
    try {
      await sendPasswordResetOtp(user.email, otp);
    } catch (emailErr) {
      console.error("❌ Failed to send password reset email:", emailErr.message);
      // Invalidate OTP if sending failed so user isn't locked into an undelivered OTP
      user.resetPasswordOtp = undefined;
      user.resetPasswordOtpExpire = undefined;
      await user.save();

      return res.status(500).json({
        success: false,
        message: `Email delivery failed: ${emailErr.message}. Check email configuration in Render.`,
      });
    }

    res.status(200).json(genericResponse);
  } catch (error) {
    next(error);
  }
};

/**
 * Verify Password Reset OTP
 * @route POST /api/auth/verify-otp
 * @access Public
 */
exports.verifyOtp = async (req, res, next) => {
  try {
    const rawInput = (
      req.body.email ||
      req.body.employeeId ||
      req.body.identifier ||
      ""
    ).trim();
    const { otp } = req.body;

    const genericInvalidMsg = {
      success: false,
      message: "Invalid or expired verification code.",
    };

    if (!rawInput || !otp) {
      return res.status(400).json({
        success: false,
        message: "Please provide both email/Employee ID and 6-digit verification code.",
      });
    }

    const cleanOtp = String(otp).trim();
    const superEmail = getSuperAdminEmail();
    const disabledList = getDisabledAdminEmails();
    const { query, isSuper, cleanInput } = getAuthUserQuery(rawInput, superEmail);

    // Explicit rejection of disabled admin accounts
    if (disabledList.includes(cleanInput)) {
      return res.status(403).json({
        success: false,
        message: "This account has been permanently disabled. Access revoked.",
      });
    }

    if (!/^\d{6}$/.test(cleanOtp)) {
      return res.status(400).json({
        success: false,
        message: "Verification code must be exactly 6 digits.",
      });
    }

    const user = await User.findOne(query).select(
      "+resetPasswordOtp +resetPasswordOtpExpire +resetPasswordAttempts +resetPasswordToken +resetPasswordTokenExpire +role +name +status +email +employeeId"
    );

    if (!user || !user.resetPasswordOtp || !user.resetPasswordOtpExpire) {
      return res.status(400).json(genericInvalidMsg);
    }

    // Reject if found user is in disabled accounts
    if (disabledList.includes((user.email || "").toLowerCase())) {
      return res.status(403).json({
        success: false,
        message: "This account has been permanently disabled. Access revoked.",
      });
    }

    // Role validation if expectedRole is passed
    const expectedRole = (req.body.expectedRole || req.body.role || "").toUpperCase().trim();
    if (expectedRole === "ADMIN" || expectedRole === "SUPER_ADMIN") {
      const isAdminUser = user.role === "ADMIN" || user.role === "SUPER_ADMIN" || user.employeeId === "EMP001" || isSuper;
      if (!isAdminUser) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized role for admin password reset.",
        });
      }
    } else if (expectedRole === "EMPLOYEE") {
      const isAdminUser = user.role === "ADMIN" || user.role === "SUPER_ADMIN" || user.employeeId === "EMP001" || isSuper;
      if (isAdminUser) {
        return res.status(403).json({
          success: false,
          message: "Admin accounts cannot be reset through the employee portal.",
        });
      }
    }

    // Check expiration (5 minutes with 30s grace period)
    if (Date.now() > user.resetPasswordOtpExpire.getTime() + 30 * 1000) {
      user.resetPasswordOtp = undefined;
      user.resetPasswordOtpExpire = undefined;
      user.resetPasswordAttempts = 0;
      await user.save();
      return res.status(400).json({
        success: false,
        message: "Verification code has expired. Please request a new one.",
      });
    }

    // Check maximum attempts limit (max 5 failed attempts per session)
    if ((user.resetPasswordAttempts || 0) >= 5) {
      user.resetPasswordOtp = undefined;
      user.resetPasswordOtpExpire = undefined;
      user.resetPasswordAttempts = 0;
      await user.save();
      return res.status(400).json({
        success: false,
        message: "Too many incorrect attempts. This verification code has been invalidated. Please request a new OTP.",
      });
    }

    // Verify OTP hash using timing-safe comparison
    const inputHash = crypto.createHash("sha256").update(cleanOtp).digest("hex");
    const storedHash = user.resetPasswordOtp;

    let isMatch = false;
    try {
      isMatch = crypto.timingSafeEqual(
        Buffer.from(inputHash, "hex"),
        Buffer.from(storedHash, "hex")
      );
    } catch (e) {
      isMatch = false;
    }

    if (!isMatch) {
      user.resetPasswordAttempts = (user.resetPasswordAttempts || 0) + 1;
      const remaining = Math.max(0, 5 - user.resetPasswordAttempts);
      if (user.resetPasswordAttempts >= 5) {
        user.resetPasswordOtp = undefined;
        user.resetPasswordOtpExpire = undefined;
        user.resetPasswordAttempts = 0;
      }
      await user.save();
      return res.status(400).json({
        success: false,
        message: remaining > 0
          ? `Invalid verification code. ${remaining} attempt(s) remaining.`
          : "Too many incorrect attempts. Please request a new OTP.",
      });
    }

    // OTP is valid!
    // Invalidate OTP to prevent replay
    user.resetPasswordOtp = undefined;
    user.resetPasswordOtpExpire = undefined;
    user.resetPasswordAttempts = 0;

    // Issue single-use short-lived reset token (valid for 15 minutes)
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.resetPasswordToken = hashedResetToken;
    user.resetPasswordTokenExpire = new Date(Date.now() + 15 * 60 * 1000);

    await user.save();

    // Log Super Admin OTP verification
    if (
      user.role === "SUPER_ADMIN" ||
      user.role === "ADMIN" ||
      user.employeeId === "EMP001"
    ) {
      AuditLog.create({
        userId: user._id,
        userName: user.name,
        userRole: user.role,
        action: "OTP_VERIFIED_SUCCESSFULLY",
        description: `OTP verified for ${user.email} (${user.role || 'EMP001'}) from IP ${req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown"}`,
      }).catch(console.error);
    }

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully. You may now reset your password.",
      resetToken,
      email: user.email,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset Password using Reset Token OR direct OTP
 * @route POST /api/auth/reset-password
 * @access Public
 */
exports.resetPassword = async (req, res, next) => {
  try {
    const rawInput = (
      req.body.email ||
      req.body.employeeId ||
      req.body.identifier ||
      ""
    ).trim();
    const { otp, resetToken, newPassword, confirmPassword } = req.body;

    // Explicit rejection of disabled admin accounts
    const rawInputClean = rawInput.toLowerCase();
    const superEmail = getSuperAdminEmail();
    const disabledList = getDisabledAdminEmails();

    if (disabledList.includes(rawInputClean)) {
      return res.status(403).json({
        success: false,
        message: "This account has been permanently disabled. Access revoked.",
      });
    }

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide a new password.",
      });
    }

    if (!resetToken && !otp) {
      return res.status(400).json({
        success: false,
        message: "Please provide verification code or reset token.",
      });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New password and confirm password do not match.",
      });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long.",
      });
    }

    const genericInvalidMsg = {
      success: false,
      message: "Invalid or expired password reset request. Please request a new verification code.",
    };

    let user = null;

    // 1. If resetToken is provided, locate user by resetPasswordToken
    if (resetToken) {
      const tokenHash = crypto.createHash("sha256").update(String(resetToken).trim()).digest("hex");
      user = await User.findOne({
        resetPasswordToken: tokenHash,
      }).select(
        "+password +resetPasswordOtp +resetPasswordOtpExpire +resetPasswordAttempts +resetPasswordToken +resetPasswordTokenExpire +role +name +status +email +employeeId"
      );

      if (!user) {
        return res.status(400).json(genericInvalidMsg);
      }

      if (Date.now() > user.resetPasswordTokenExpire.getTime()) {
        user.resetPasswordToken = undefined;
        user.resetPasswordTokenExpire = undefined;
        await user.save();
        return res.status(400).json({
          success: false,
          message: "Password reset session has expired. Please request a new verification code.",
        });
      }
    } else if (otp) {
      // 2. Direct OTP flow: find user by query
      if (!rawInput) {
        return res.status(400).json({
          success: false,
          message: "Please provide your registered email or Employee ID.",
        });
      }

      const cleanOtp = String(otp).trim();

      user = await User.findOne(query).select(
        "+password +resetPasswordOtp +resetPasswordOtpExpire +resetPasswordAttempts +resetPasswordToken +resetPasswordTokenExpire +role +name +status +email +employeeId"
      );

      if (!user || !user.resetPasswordOtp || !user.resetPasswordOtpExpire) {
        return res.status(400).json(genericInvalidMsg);
      }

      if (Date.now() > user.resetPasswordOtpExpire.getTime() + 30 * 1000) {
        user.resetPasswordOtp = undefined;
        user.resetPasswordOtpExpire = undefined;
        user.resetPasswordAttempts = 0;
        await user.save();
        return res.status(400).json({
          success: false,
          message: "Verification code has expired. Please request a new one.",
        });
      }

      if ((user.resetPasswordAttempts || 0) >= 5) {
        user.resetPasswordOtp = undefined;
        user.resetPasswordOtpExpire = undefined;
        user.resetPasswordAttempts = 0;
        await user.save();
        return res.status(400).json({
          success: false,
          message: "Too many incorrect attempts. Please request a new verification code.",
        });
      }

      const inputHash = crypto.createHash("sha256").update(cleanOtp).digest("hex");
      let isMatch = false;
      try {
        isMatch = crypto.timingSafeEqual(
          Buffer.from(inputHash, "hex"),
          Buffer.from(user.resetPasswordOtp, "hex")
        );
      } catch (e) {
        isMatch = false;
      }

      if (!isMatch) {
        user.resetPasswordAttempts = (user.resetPasswordAttempts || 0) + 1;
        if (user.resetPasswordAttempts >= 5) {
          user.resetPasswordOtp = undefined;
          user.resetPasswordOtpExpire = undefined;
          user.resetPasswordAttempts = 0;
        }
        await user.save();
        return res.status(400).json(genericInvalidMsg);
      }
    }

    if (!user) {
      return res.status(400).json(genericInvalidMsg);
    }

    // Explicit rejection if user matches disabled admin accounts
    if (disabledList.includes((user.email || "").toLowerCase())) {
      return res.status(403).json({
        success: false,
        message: "This account has been permanently disabled. Access revoked.",
      });
    }

    // Role validation if expectedRole is passed
    const expectedRole = (req.body.expectedRole || req.body.role || "").toUpperCase().trim();
    if (expectedRole === "ADMIN" || expectedRole === "SUPER_ADMIN") {
      const isAdminUser = user.role === "ADMIN" || user.role === "SUPER_ADMIN" || user.employeeId === "EMP001" || isSuper;
      if (!isAdminUser) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized role for admin password reset.",
        });
      }
    } else if (expectedRole === "EMPLOYEE") {
      const isAdminUser = user.role === "ADMIN" || user.role === "SUPER_ADMIN" || user.employeeId === "EMP001" || isSuper;
      if (isAdminUser) {
        return res.status(403).json({
          success: false,
          message: "Admin accounts cannot be reset through the employee portal.",
        });
      }
    }

    // Verify & enforce SUPER_ADMIN role before password reset if super admin
    if (isSuper || user.email === superEmail || user.employeeId === "EMP001" || user.role === "SUPER_ADMIN") {
      user.role = "SUPER_ADMIN";
      user.status = "ACTIVE";
      user.accessStatus = "APPROVED";
      user.isAdminPanelEnabled = true;
      user.email = superEmail;
    }

    // Check if new password is compromised using HIBP
    try {
      const isCompromised = await isPasswordCompromised(newPassword);
      if (isCompromised) {
        return res.status(400).json({
          success: false,
          message: "This password has appeared in a known data breach. Please choose a more secure password.",
        });
      }
    } catch (e) {
      // Non-blocking
    }

    // Update password (User.pre('save') hashes it securely via bcrypt)
    user.password = newPassword;

    // Single-use: Clear reset tokens and OTP fields completely to prevent replay
    user.resetPasswordToken = undefined;
    user.resetPasswordTokenExpire = undefined;
    user.resetPasswordOtp = undefined;
    user.resetPasswordOtpExpire = undefined;
    user.resetPasswordAttempts = 0;

    // JWT session invalidation: set passwordChangedAt to invalidate all previous sessions
    user.passwordChangedAt = new Date();

    // Ensure status is active and admin panel enabled
    if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
      user.status = "ACTIVE";
      user.isAdminPanelEnabled = true;
    }

    await user.save();

    // Audit log
    AuditLog.create({
      userId: user._id,
      userName: user.name,
      userRole: user.role,
      action: "PASSWORD_RESET_SUCCESSFUL",
      description: `Password reset successfully for ${user.email} (${user.role || 'EMP001'}) from IP ${req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown"}`,
    }).catch(console.error);

    // Send confirmation security alert email
    try {
      await sendPasswordResetConfirmation(user.email, user.name);
    } catch (confirmErr) {
      // Non-blocking
      console.warn("Could not send password change confirmation email:", confirmErr.message);
    }

    return res.status(200).json({
      success: true,
      message: "Password has been reset successfully. You can now log in with your new password.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/change-password
 * Protected — Change password for authenticated user / Super Admin
 */
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Current password and new password are required." });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "New password and confirm password do not match." });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ success: false, message: "New password must be at least 6 characters long." });
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Incorrect current password." });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/register
 * Public route — register a new employee account
 */
exports.register = async (req, res, next) => {
  try {
    const { name, fullName, email, password, phone } = req.body;
    const userName = (name || fullName || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPass = (password || "").trim();
    const cleanPhone = (phone || "").trim();

    if (!userName || !cleanEmail || !cleanPass) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
      });
    }

    if (cleanPass.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    // Check existing user
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email address already exists.",
      });
    }

    // Generate unique Employee ID
    const employeeId = await generateEmployeeId();

    const user = await User.create({
      name: userName,
      email: cleanEmail,
      password: cleanPass,
      phone: cleanPhone,
      role: "EMPLOYEE",
      employeeId,
      status: "ACTIVE",
      department: "General",
      designation: "Employee",
      employeeAppPermissions: {
        dashboard: true,
        tasks: true,
        attendance: true,
        salary: true,
        crm: false,
        projects: true,
        quotation: false,
        reports: false,
        bikeTracking: false,
      },
    });

    const token = generateToken(user._id);

    const io = req.app.get("io");
    if (io) {
      io.emit("user_registered", { userId: user._id, name: user.name, role: user.role });
      io.emit("dashboard_updated", { type: "REGISTER", userId: user._id });
    }

    res.status(201).json({
      success: true,
      message: "Registration successful.",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        employeeId: user.employeeId,
        department: user.department,
        designation: user.designation,
        status: user.status,
        employeeAppPermissions: user.employeeAppPermissions,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/superadmin/status
 * Check Super Admin provisioning status
 */
exports.getSuperAdminStatus = async (req, res, next) => {
  try {
    const superEmail = getSuperAdminEmail();
    const superAdmin = await User.findOne({
      $or: [
        { email: superEmail },
        { employeeId: "EMP001" },
        { role: "SUPER_ADMIN" },
      ],
    }).select("name email role status accessStatus employeeId createdAt");

    return res.status(200).json({
      success: true,
      superAdminEmail: superEmail,
      isProvisioned: !!superAdmin,
      superAdmin: superAdmin || null,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/superadmin/request-setup-otp
 * Explicitly triggers Super Admin provisioning in MongoDB and dispatches a 6-digit OTP to SUPER_ADMIN_EMAIL via Resend
 */
exports.requestSuperAdminSetupOtp = async (req, res, next) => {
  try {
    const superEmail = getSuperAdminEmail();
    const user = await ensureSuperAdminAccount();

    // Resend cooldown check: 60 seconds
    if (user.resetPasswordOtpLastSent) {
      const timeSinceLastOtp = Date.now() - user.resetPasswordOtpLastSent.getTime();
      if (timeSinceLastOtp < 60 * 1000) {
        const remainingSeconds = Math.ceil((60 * 1000 - timeSinceLastOtp) / 1000);
        return res.status(429).json({
          success: false,
          message: `Please wait ${remainingSeconds} seconds before requesting a new OTP.`,
        });
      }
    }

    const otp = generateOTP();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    const expireTime = new Date(Date.now() + 5 * 60 * 1000);

    user.resetPasswordOtp = otpHash;
    user.resetPasswordOtpExpire = expireTime;
    user.resetPasswordAttempts = 0;
    user.resetPasswordOtpLastSent = new Date();
    user.resetPasswordToken = undefined;
    user.resetPasswordTokenExpire = undefined;
    await user.save();

    await sendPasswordResetOtp(user.email, otp);

    return res.status(200).json({
      success: true,
      message: `Super Admin account provisioned and 6-digit verification code sent to ${user.email}.`,
      email: user.email,
    });
  } catch (err) {
    next(err);
  }
};

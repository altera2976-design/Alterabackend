const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "ADMIN", "SALES", "MANAGER", "DESIGNER", "PROJECT_MANAGER", "EMPLOYEE"],
      default: "EMPLOYEE",
    },
    employeeId: {
      type: String,
      unique: true,
      sparse: true, // allows multiple nulls
    },
    googleId: {
      type: String,
      sparse: true,
      unique: true,
    },
    authProvider: {
      type: String,
      enum: ["LOCAL", "GOOGLE"],
      default: "LOCAL",
    },
    avatar: {
      type: String,
      default: "",
    },
    department: {
      type: String,
      trim: true,
      default: "",
    },
    designation: {
      type: String,
      trim: true,
      default: "",
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    salary: {
      type: Number,
      default: 0,
      min: [0, "Salary cannot be negative"],
    },
    salaryType: {
      type: String,
      enum: ["MONTHLY", "DAILY", "HOURLY"],
      default: "MONTHLY",
    },
    salaryStructure: {
      basic: { type: Number, default: 0 },
      hra: { type: Number, default: 0 },
      allowances: { type: Number, default: 0 },
      bonus: { type: Number, default: 0 },
      overtimeRate: { type: Number, default: 200 },
      otherEarnings: { type: Number, default: 0 },
      pfDeduction: { type: Number, default: 0 },
      esiDeduction: { type: Number, default: 0 },
      profTax: { type: Number, default: 0 },
      tds: { type: Number, default: 0 },
      otherDeductions: { type: Number, default: 0 },
      effectiveDate: { type: Date, default: Date.now },
    },
    workingHours: {
      type: Number,
      default: 8,
      min: [0, "Working hours cannot be negative"],
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
    isAdminPanelEnabled: {
      type: Boolean,
      default: false,
    },
    permissions: {
      dashboard: {
        view: { type: Boolean, default: true },
      },
      tasks: {
        view: { type: Boolean, default: true },
        create: { type: Boolean, default: true },
        edit: { type: Boolean, default: true },
        delete: { type: Boolean, default: true },
        assign: { type: Boolean, default: true },
      },
      crm: {
        view: { type: Boolean, default: true },
        create: { type: Boolean, default: true },
        edit: { type: Boolean, default: true },
        delete: { type: Boolean, default: true },
        export: { type: Boolean, default: true },
      },
      projects: {
        view: { type: Boolean, default: true },
        create: { type: Boolean, default: true },
        edit: { type: Boolean, default: true },
        delete: { type: Boolean, default: true },
        export: { type: Boolean, default: true },
      },
      salary: {
        view: { type: Boolean, default: true },
        create: { type: Boolean, default: true },
        edit: { type: Boolean, default: true },
        export: { type: Boolean, default: true },
      },
      attendance: {
        view: { type: Boolean, default: true },
        create: { type: Boolean, default: true },
        edit: { type: Boolean, default: true },
        export: { type: Boolean, default: true },
      },
      quotation: {
        view: { type: Boolean, default: true },
        create: { type: Boolean, default: true },
        edit: { type: Boolean, default: true },
        delete: { type: Boolean, default: true },
        export: { type: Boolean, default: true },
      },
      reports: {
        view: { type: Boolean, default: true },
        export: { type: Boolean, default: true },
      },
      notifications: {
        view: { type: Boolean, default: true },
        create: { type: Boolean, default: true },
      },
      administration: {
        view: { type: Boolean, default: true },
        edit: { type: Boolean, default: true },
      },
      transactions: {
        view: { type: Boolean, default: true },
        create: { type: Boolean, default: true },
        edit: { type: Boolean, default: true },
        delete: { type: Boolean, default: false },
        viewDetails: { type: Boolean, default: true },
        viewSummary: { type: Boolean, default: true },
        export: { type: Boolean, default: true },
        refund: { type: Boolean, default: false },
        viewAll: { type: Boolean, default: false },
      },
    },
    resetPasswordOtp: {
      type: String,
      select: false,
    },
    resetPasswordOtpExpire: {
      type: Date,
      select: false,
    },
    resetPasswordAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    documents: [
      {
        documentType: { type: String, default: 'General Document' },
        fileName: { type: String },
        originalName: { type: String },
        driveFileId: { type: String },
        driveUrl: { type: String },
        fileUrl: { type: String },
        fileType: { type: String },
        fileSize: { type: Number },
        folderType: { type: String, default: 'Employee Documents' },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Hash password before saving
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Transform: remove sensitive fields from JSON output
UserSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("User", UserSchema);

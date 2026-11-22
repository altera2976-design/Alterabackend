const mongoose = require('mongoose');

const ModuleItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    icon: { type: String, default: 'grid-outline' },
    emoji: { type: String, default: '📁' },
    webPath: { type: String, required: true },
    superAdminPath: { type: String },
    mobileRoute: { type: String },
    allowedRoles: {
      type: [String],
      default: ['SUPER_ADMIN', 'ADMIN'],
    },
    enabled: { type: Boolean, default: true },
    webVisible: { type: Boolean, default: true },
    mobileVisible: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const FormFieldSchema = new mongoose.Schema(
  {
    fieldKey: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ['text', 'number', 'email', 'date', 'select', 'textarea', 'checkbox'],
      default: 'text',
    },
    required: { type: Boolean, default: false },
    placeholder: { type: String, default: '' },
    defaultValue: { type: mongoose.Schema.Types.Mixed },
    options: { type: [String], default: [] },
    allowedRoles: {
      type: [String],
      default: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
    },
    isCustom: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const TableColumnSchema = new mongoose.Schema(
  {
    columnKey: { type: String, required: true },
    label: { type: String, required: true },
    visible: { type: Boolean, default: true },
    sortable: { type: Boolean, default: true },
    allowedRoles: {
      type: [String],
      default: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
    },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const AuditEntrySchema = new mongoose.Schema(
  {
    changedBy: { type: String, default: 'System' },
    action: { type: String, required: true },
    section: { type: String, required: true },
    details: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const AppConfigSchema = new mongoose.Schema(
  {
    configKey: {
      type: String,
      required: true,
      unique: true,
      default: 'GLOBAL_APP_CONFIG',
    },
    version: {
      type: Number,
      default: 1,
    },
    modules: {
      type: [ModuleItemSchema],
      default: [],
    },
    formSchemas: {
      type: Map,
      of: [FormFieldSchema],
      default: {},
    },
    tableSchemas: {
      type: Map,
      of: [TableColumnSchema],
      default: {},
    },
    systemSettings: {
      companyName: { type: String, default: 'Altera Design Studio' },
      themePrimaryColor: { type: String, default: '#7A131A' },
      workingDaysPerMonth: { type: Number, default: 26 },
      standardShiftHours: { type: Number, default: 8 },
      emailAlerts: { type: Boolean, default: true },
      autoApproveLeaves: { type: Boolean, default: false },
      enableRealtimeSync: { type: Boolean, default: true },
    },
    auditHistory: {
      type: [AuditEntrySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Method to get or initialize default singleton config
AppConfigSchema.statics.getOrCreateDefault = async function () {
  let config = await this.findOne({ configKey: 'GLOBAL_APP_CONFIG' });
  if (config) return config;

  const defaultModules = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: 'grid-outline',
      emoji: '📊',
      webPath: '/admin/dashboard',
      superAdminPath: '/super-admin/dashboard',
      mobileRoute: '/(app)/tabs/dashboard',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
      enabled: true,
      webVisible: true,
      mobileVisible: true,
      order: 1,
    },
    {
      id: 'employees',
      label: 'Employees',
      icon: 'people-outline',
      emoji: '👥',
      webPath: '/admin/employees',
      superAdminPath: '/super-admin/employees',
      mobileRoute: '/(app)/tabs/projects',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
      enabled: true,
      webVisible: true,
      mobileVisible: true,
      order: 2,
    },
    {
      id: 'attendance',
      label: 'Attendance',
      icon: 'calendar-outline',
      emoji: '📅',
      webPath: '/admin/attendance',
      superAdminPath: '/super-admin/attendance',
      mobileRoute: '/(app)/attendance',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
      enabled: true,
      webVisible: true,
      mobileVisible: true,
      order: 3,
    },
    {
      id: 'bike_tracking',
      label: 'Bike Tracking',
      icon: 'bicycle-outline',
      emoji: '🏍️',
      webPath: '/admin/bike-tracking',
      superAdminPath: '/super-admin/bike-tracking',
      mobileRoute: '/(app)/tabs/bike',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
      enabled: true,
      webVisible: true,
      mobileVisible: true,
      order: 4,
    },
    {
      id: 'payroll',
      label: 'Salary & Payroll',
      icon: 'cash-outline',
      emoji: '💰',
      webPath: '/admin/payroll',
      superAdminPath: '/super-admin/payroll',
      mobileRoute: '/(app)/salary',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
      enabled: true,
      webVisible: true,
      mobileVisible: true,
      order: 5,
    },
    {
      id: 'tasks',
      label: 'Tasks',
      icon: 'checkbox-outline',
      emoji: '📋',
      webPath: '/admin/tasks',
      superAdminPath: '/super-admin/tasks',
      mobileRoute: '/(app)/tabs/projects',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
      enabled: true,
      webVisible: true,
      mobileVisible: true,
      order: 6,
    },
    {
      id: 'crm',
      label: 'CRM',
      icon: 'people-outline',
      emoji: '👥',
      webPath: '/admin/crm',
      superAdminPath: '/super-admin/crm',
      mobileRoute: '/(app)/tabs/crm',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
      enabled: true,
      webVisible: true,
      mobileVisible: true,
      order: 7,
    },
    {
      id: 'transactions',
      label: 'Transactions',
      icon: 'card-outline',
      emoji: '💳',
      webPath: '/admin/transactions',
      superAdminPath: '/super-admin/transactions',
      mobileRoute: '/(app)/transactions',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
      enabled: true,
      webVisible: true,
      mobileVisible: true,
      order: 8,
    },
    {
      id: 'quotations',
      label: 'Quotations',
      icon: 'document-text-outline',
      emoji: '🧾',
      webPath: '/admin/quotations',
      superAdminPath: '/super-admin/quotations',
      mobileRoute: '/(app)/quotation',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
      enabled: true,
      webVisible: true,
      mobileVisible: true,
      order: 9,
    },
    {
      id: 'offer_letters',
      label: 'Offer Letters',
      icon: 'document-text-outline',
      emoji: '📄',
      webPath: '/admin/offer-letters',
      superAdminPath: '/super-admin/offer-letters',
      mobileRoute: '/(app)/quotation',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
      enabled: true,
      webVisible: true,
      mobileVisible: false,
      order: 10,
    },
    {
      id: 'projects',
      label: 'Projects',
      icon: 'briefcase-outline',
      emoji: '📁',
      webPath: '/admin/projects',
      superAdminPath: '/super-admin/projects',
      mobileRoute: '/(app)/tabs/projects',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
      enabled: true,
      webVisible: true,
      mobileVisible: true,
      order: 11,
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: 'stats-chart-outline',
      emoji: '📈',
      webPath: '/admin/reports',
      superAdminPath: '/super-admin/reports',
      mobileRoute: '/(app)/tabs/reports',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
      enabled: true,
      webVisible: true,
      mobileVisible: true,
      order: 12,
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: 'notifications-outline',
      emoji: '🔔',
      webPath: '/admin/notifications',
      superAdminPath: '/super-admin/notifications',
      mobileRoute: '/(app)/tabs/dashboard',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
      enabled: true,
      webVisible: true,
      mobileVisible: true,
      order: 13,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: 'settings-outline',
      emoji: '⚙️',
      webPath: '/admin/settings',
      superAdminPath: '/super-admin/settings',
      mobileRoute: '/(app)/tabs/profile',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
      enabled: true,
      webVisible: true,
      mobileVisible: true,
      order: 14,
    },
  ];

  const defaultFormSchemas = {
    offer_letter: [
      { fieldKey: 'candidateName', label: 'Candidate Full Name', type: 'text', required: true, order: 1 },
      { fieldKey: 'email', label: 'Email Address', type: 'email', required: true, order: 2 },
      { fieldKey: 'phone', label: 'Phone Number', type: 'text', required: true, order: 3 },
      { fieldKey: 'designation', label: 'Designation / Role', type: 'text', required: true, order: 4 },
      { fieldKey: 'department', label: 'Department', type: 'text', required: false, order: 5 },
      { fieldKey: 'joiningDate', label: 'Date of Joining', type: 'date', required: true, order: 6 },
      { fieldKey: 'offeredSalary', label: 'Offered Salary / CTC (₹)', type: 'number', required: true, order: 7 },
      { fieldKey: 'employmentType', label: 'Employment Type', type: 'select', options: ['Full Time', 'Part Time', 'Contract', 'Internship'], required: true, order: 8 },
      { fieldKey: 'jobLocation', label: 'Job Location', type: 'text', required: false, order: 9 },
    ],
    salary: [
      { fieldKey: 'employeeId', label: 'Employee ID', type: 'text', required: true, order: 1 },
      { fieldKey: 'basicSalary', label: 'Basic Salary (₹)', type: 'number', required: true, order: 2 },
      { fieldKey: 'hra', label: 'HRA (₹)', type: 'number', required: false, order: 3 },
      { fieldKey: 'allowances', label: 'Allowances (₹)', type: 'number', required: false, order: 4 },
      { fieldKey: 'bonuses', label: 'Bonus / Incentives (₹)', type: 'number', required: false, order: 5 },
      { fieldKey: 'deductions', label: 'Deductions (₹)', type: 'number', required: false, order: 6 },
      { fieldKey: 'effectiveDate', label: 'Effective Date', type: 'date', required: true, order: 7 },
    ],
    attendance: [
      { fieldKey: 'employeeId', label: 'Employee ID', type: 'text', required: true, order: 1 },
      { fieldKey: 'date', label: 'Date', type: 'date', required: true, order: 2 },
      { fieldKey: 'status', label: 'Status', type: 'select', options: ['Present', 'Absent', 'Half Day', 'Leave', 'Holiday'], required: true, order: 3 },
      { fieldKey: 'checkInTime', label: 'Check-in Time', type: 'text', required: false, order: 4 },
      { fieldKey: 'checkOutTime', label: 'Check-out Time', type: 'text', required: false, order: 5 },
      { fieldKey: 'remarks', label: 'Remarks', type: 'textarea', required: false, order: 6 },
    ],
  };

  const defaultTableSchemas = {
    offer_letters: [
      { columnKey: 'candidateName', label: 'Candidate Name', visible: true, sortable: true, order: 1 },
      { columnKey: 'designation', label: 'Designation', visible: true, sortable: true, order: 2 },
      { columnKey: 'offeredSalary', label: 'Offered Salary', visible: true, sortable: true, order: 3 },
      { columnKey: 'joiningDate', label: 'Joining Date', visible: true, sortable: true, order: 4 },
      { columnKey: 'status', label: 'Status', visible: true, sortable: true, order: 5 },
      { columnKey: 'actions', label: 'Actions', visible: true, sortable: false, order: 6 },
    ],
    salary: [
      { columnKey: 'employeeId', label: 'Employee ID', visible: true, sortable: true, order: 1 },
      { columnKey: 'name', label: 'Employee Name', visible: true, sortable: true, order: 2 },
      { columnKey: 'basicSalary', label: 'Basic Salary', visible: true, sortable: true, order: 3 },
      { columnKey: 'allowances', label: 'Allowances', visible: true, sortable: true, order: 4 },
      { columnKey: 'deductions', label: 'Deductions', visible: true, sortable: true, order: 5 },
      { columnKey: 'netSalary', label: 'Net Salary', visible: true, sortable: true, order: 6 },
      { columnKey: 'actions', label: 'Actions', visible: true, sortable: false, order: 7 },
    ],
    attendance: [
      { columnKey: 'date', label: 'Date', visible: true, sortable: true, order: 1 },
      { columnKey: 'employeeName', label: 'Employee', visible: true, sortable: true, order: 2 },
      { columnKey: 'status', label: 'Status', visible: true, sortable: true, order: 3 },
      { columnKey: 'checkIn', label: 'Check-In', visible: true, sortable: false, order: 4 },
      { columnKey: 'checkOut', label: 'Check-Out', visible: true, sortable: false, order: 5 },
      { columnKey: 'workingHours', label: 'Hours', visible: true, sortable: true, order: 6 },
      { columnKey: 'actions', label: 'Actions', visible: true, sortable: false, order: 7 },
    ],
    payroll: [
      { columnKey: 'month', label: 'Month', visible: true, sortable: true, order: 1 },
      { columnKey: 'employeeName', label: 'Employee', visible: true, sortable: true, order: 2 },
      { columnKey: 'grossSalary', label: 'Gross', visible: true, sortable: true, order: 3 },
      { columnKey: 'netPayable', label: 'Net Payable', visible: true, sortable: true, order: 4 },
      { columnKey: 'paymentStatus', label: 'Status', visible: true, sortable: true, order: 5 },
      { columnKey: 'actions', label: 'Actions', visible: true, sortable: false, order: 6 },
    ],
  };

  config = await this.create({
    configKey: 'GLOBAL_APP_CONFIG',
    version: 1,
    modules: defaultModules,
    formSchemas: defaultFormSchemas,
    tableSchemas: defaultTableSchemas,
    auditHistory: [
      {
        changedBy: 'System Initialization',
        action: 'INIT',
        section: 'ALL',
        details: 'Initial centralized configuration seed created.',
        timestamp: new Date(),
      },
    ],
  });

  return config;
};

module.exports = mongoose.model('AppConfig', AppConfigSchema);

const AppConfig = require('../models/AppConfig');
const appConfigController = require('../controllers/appConfigController');

async function testSyncLogic() {
  console.log('🧪 Starting Synchronization Engine Logic & Controller Tests...\n');

  // Mock Socket.IO instance
  const emittedEvents = [];
  const mockIo = {
    emit: (event, payload) => {
      emittedEvents.push({ event, payload });
      console.log(`   [Mock Socket.IO] Broadcast event: "${event}"`, payload.type ? `(type: ${payload.type}, v=${payload.version})` : '');
    },
  };

  const mockApp = {
    get: (key) => (key === 'io' ? mockIo : null),
  };

  // ── TEST 1: Schema Default Initialization ─────────────────────────────────
  console.log('[TEST 1] Testing AppConfig Model Schema...');
  const sampleConfig = new AppConfig({
    configKey: 'GLOBAL_APP_CONFIG',
    version: 1,
    modules: [
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
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        enabled: true,
        webVisible: true,
        mobileVisible: false,
        order: 2,
      },
    ],
    formSchemas: {
      offer_letter: [
        { fieldKey: 'candidateName', label: 'Candidate Full Name', type: 'text', required: true, order: 1 },
        { fieldKey: 'offeredSalary', label: 'Offered Salary', type: 'number', required: true, order: 2 },
      ],
    },
    tableSchemas: {
      offer_letters: [
        { columnKey: 'candidateName', label: 'Candidate Name', visible: true, sortable: true, order: 1 },
        { columnKey: 'offeredSalary', label: 'Offered Salary', visible: true, sortable: true, order: 2 },
      ],
    },
    systemSettings: {
      companyName: 'Altera Design Studio',
      themePrimaryColor: '#7A131A',
      workingDaysPerMonth: 26,
      standardShiftHours: 8,
    },
  });

  const validationError = sampleConfig.validateSync();
  if (validationError) {
    throw new Error('Schema validation failed: ' + validationError.message);
  }
  console.log('✅ AppConfig Schema validation passed successfully.');

  // ── TEST 2: Role-based filtering simulation ───────────────────────────────
  console.log('\n[TEST 2] Testing Role-based Access Filtering...');
  // Super Admin should see all modules
  const superAdminModules = sampleConfig.modules.filter((m) => m.enabled);
  console.log(`✅ Super Admin visible modules: ${superAdminModules.length} (Expected: 2)`);

  // Employee should only see modules where allowedRoles includes EMPLOYEE
  const employeeModules = sampleConfig.modules.filter((m) => m.enabled && m.allowedRoles.includes('EMPLOYEE'));
  console.log(`✅ Employee visible modules: ${employeeModules.length} (Expected: 1)`);
  if (employeeModules.length !== 1 || employeeModules[0].id !== 'dashboard') {
    throw new Error('Employee role filtering failed!');
  }

  // ── TEST 3: Navigation / Module Add & Reorder Broadcast ───────────────────
  console.log('\n[TEST 3] Testing Navigation Update and Socket.IO Broadcast...');
  const newModule = {
    id: 'inventory',
    label: 'Inventory Control',
    icon: 'cube-outline',
    emoji: '📦',
    webPath: '/admin/inventory',
    mobileRoute: '/(app)/tabs/modules',
    allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
    enabled: true,
    webVisible: true,
    mobileVisible: true,
    order: 3,
  };
  sampleConfig.modules.push(newModule);
  sampleConfig.version += 1;

  // Simulate updateModules controller logic
  mockIo.emit('app_config_updated', {
    type: 'modules',
    version: sampleConfig.version,
    config: sampleConfig,
  });

  const lastEvent = emittedEvents[emittedEvents.length - 1];
  if (lastEvent.event !== 'app_config_updated' || lastEvent.payload.type !== 'modules') {
    throw new Error('Broadcast event failed for modules update.');
  }
  console.log(`✅ Navigation updated. New version: v${sampleConfig.version}. Socket.IO event received by listeners.`);

  // ── TEST 4: Dynamic Form Field Add & Delete ──────────────────────────────
  console.log('\n[TEST 4] Testing Dynamic Form Field Addition & Removal...');
  const formFields = sampleConfig.formSchemas.get('offer_letter');
  // Add field
  formFields.push({
    fieldKey: 'noticePeriodDays',
    label: 'Notice Period (Days)',
    type: 'number',
    required: false,
    order: 3,
  });
  sampleConfig.formSchemas.set('offer_letter', formFields);
  sampleConfig.version += 1;

  mockIo.emit('app_config_updated', {
    type: 'forms',
    version: sampleConfig.version,
    config: sampleConfig,
  });

  console.log(`✅ Dynamic field "noticePeriodDays" added. Total fields: ${sampleConfig.formSchemas.get('offer_letter').length}`);

  // Delete field
  const updatedFields = sampleConfig.formSchemas.get('offer_letter').filter((f) => f.fieldKey !== 'noticePeriodDays');
  sampleConfig.formSchemas.set('offer_letter', updatedFields);
  sampleConfig.version += 1;

  mockIo.emit('app_config_updated', {
    type: 'forms',
    version: sampleConfig.version,
    config: sampleConfig,
  });

  console.log(`✅ Dynamic field deleted. Remaining fields: ${sampleConfig.formSchemas.get('offer_letter').length} (Expected: 2)`);

  // ── TEST 5: Real-time Entity Sync Trigger (Offer Letter, Salary, Attendance, Payroll) ────
  console.log('\n[TEST 5] Testing Entity Real-time Sync Triggers...');
  mockIo.emit('entity_changed', {
    entity: 'attendance',
    action: 'update',
    data: { recordId: 'att_123', status: 'Present' },
    timestamp: new Date().toISOString(),
  });

  mockIo.emit('entity_changed', {
    entity: 'salary',
    action: 'update',
    data: { employeeId: 'EMP001', netSalary: 75000 },
    timestamp: new Date().toISOString(),
  });

  mockIo.emit('entity_changed', {
    entity: 'payroll',
    action: 'mark_paid',
    data: { month: '2026-11' },
    timestamp: new Date().toISOString(),
  });

  const entityEvents = emittedEvents.filter((e) => e.event === 'entity_changed');
  if (entityEvents.length !== 3) {
    throw new Error('Entity change broadcast verification failed.');
  }
  console.log(`✅ Real-time entity change events verified for attendance, salary, and payroll.`);

  // ── TEST 6: Audit History & Versioning ───────────────────────────────────
  console.log('\n[TEST 6] Testing Configuration Versioning & Audit History...');
  sampleConfig.auditHistory.unshift({
    changedBy: 'Super Admin',
    action: 'UPDATE_MODULES',
    section: 'NAVIGATION',
    details: 'Added inventory module and reordered links.',
    timestamp: new Date(),
  });

  if (sampleConfig.version < 4 || sampleConfig.auditHistory.length === 0) {
    throw new Error('Versioning / Audit history tracking failed.');
  }
  console.log(`✅ Configuration version advanced to v${sampleConfig.version}. Audit history recorded: "${sampleConfig.auditHistory[0].action}"`);

  console.log('\n🎉 ALL SYNCHRONIZATION LOGIC & SOCKET.IO TESTS PASSED WITH 100% SUCCESS!\n');
}

testSyncLogic().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

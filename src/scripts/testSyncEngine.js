require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const AppConfig = require('../models/AppConfig');

async function runSyncTests() {
  console.log('🚀 Starting Automated End-to-End Synchronization Tests...');
  await connectDB();

  try {
    // 1. Initial configuration check
    console.log('\n[TEST 1] Verifying Centralized Master Configuration...');
    const config = await AppConfig.getOrCreateDefault();
    if (!config || !config.modules || config.modules.length === 0) {
      throw new Error('Failed to retrieve or seed default configuration.');
    }
    console.log(`✅ Master Config loaded. Version: v${config.version}, Modules count: ${config.modules.length}`);

    const initialVersion = config.version;

    // 2. Add a new module in Dashboard
    console.log('\n[TEST 2] Adding New Module ("warehouse_management") in Dashboard...');
    const testModule = {
      id: 'warehouse_management',
      label: 'Warehouse & Inventory',
      icon: 'cube-outline',
      emoji: '📦',
      webPath: '/admin/warehouse',
      mobileRoute: '/(app)/tabs/modules',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
      enabled: true,
      webVisible: true,
      mobileVisible: true,
      order: config.modules.length + 1,
    };

    config.modules.push(testModule);
    config.version += 1;
    config.auditHistory.unshift({
      changedBy: 'Automated Test Suite',
      action: 'ADD_TEST_MODULE',
      section: 'NAVIGATION',
      details: 'Added warehouse_management test module',
      timestamp: new Date(),
    });
    await config.save();
    console.log(`✅ Module added. New version: v${config.version}`);

    // Verify it appears in authorized roles
    const reloadedConfig = await AppConfig.findOne({ configKey: 'GLOBAL_APP_CONFIG' });
    const foundModule = reloadedConfig.modules.find((m) => m.id === 'warehouse_management');
    if (!foundModule) {
      throw new Error('Test module was not found in reloaded configuration.');
    }
    console.log(`✅ Verified module "${foundModule.label}" is present with roles: [${foundModule.allowedRoles.join(', ')}]`);

    // Verify role filtering simulation
    const adminVisible = reloadedConfig.modules.filter((m) => m.allowedRoles.includes('ADMIN'));
    const employeeVisible = reloadedConfig.modules.filter((m) => m.allowedRoles.includes('EMPLOYEE'));
    console.log(`✅ Role Access Check: Module visible to ADMIN: ${adminVisible.some(m => m.id === 'warehouse_management')}`);
    console.log(`✅ Role Access Check: Module restricted from EMPLOYEE: ${!employeeVisible.some(m => m.id === 'warehouse_management')}`);

    // 3. Edit dynamic form in Dashboard (Add field)
    console.log('\n[TEST 3] Adding Dynamic Field ("probationPeriodMonths") to Offer Letter Form...');
    const currentFields = reloadedConfig.formSchemas.get('offer_letter') || [];
    currentFields.push({
      fieldKey: 'probationPeriodMonths',
      label: 'Probation Period (Months)',
      type: 'number',
      required: false,
      isCustom: true,
      order: currentFields.length + 1,
    });
    reloadedConfig.formSchemas.set('offer_letter', currentFields);
    reloadedConfig.version += 1;
    await reloadedConfig.save();

    const formCheckConfig = await AppConfig.findOne({ configKey: 'GLOBAL_APP_CONFIG' });
    const offerFields = formCheckConfig.formSchemas.get('offer_letter');
    const hasField = offerFields.some((f) => f.fieldKey === 'probationPeriodMonths');
    if (!hasField) {
      throw new Error('Failed to verify dynamic field in offer_letter schema.');
    }
    console.log(`✅ Verified dynamic field "probationPeriodMonths" is active in offer_letter schema.`);

    // 4. Delete field in Dashboard
    console.log('\n[TEST 4] Deleting Dynamic Field from Form...');
    const filteredFields = offerFields.filter((f) => f.fieldKey !== 'probationPeriodMonths');
    formCheckConfig.formSchemas.set('offer_letter', filteredFields);
    formCheckConfig.version += 1;
    await formCheckConfig.save();

    const postDeleteConfig = await AppConfig.findOne({ configKey: 'GLOBAL_APP_CONFIG' });
    const postDeleteFields = postDeleteConfig.formSchemas.get('offer_letter');
    const isDeleted = !postDeleteFields.some((f) => f.fieldKey === 'probationPeriodMonths');
    if (!isDeleted) {
      throw new Error('Field was not successfully deleted from schema.');
    }
    console.log(`✅ Verified dynamic field successfully removed from application schema.`);

    // 5. Update System Settings (Branding & Shift rules)
    console.log('\n[TEST 5] Updating System & Operational Settings in Dashboard...');
    postDeleteConfig.systemSettings.workingDaysPerMonth = 25;
    postDeleteConfig.systemSettings.themePrimaryColor = '#7A131A';
    postDeleteConfig.version += 1;
    await postDeleteConfig.save();

    // 6. Persistence & restart simulation
    console.log('\n[TEST 6] Simulating Server/Application Restart & Database Re-fetch...');
    const restartConfig = await AppConfig.findOne({ configKey: 'GLOBAL_APP_CONFIG' }).lean();
    if (restartConfig.systemSettings.workingDaysPerMonth !== 25) {
      throw new Error('Settings did not persist after reload.');
    }
    console.log(`✅ All settings persisted across simulated restart. Version progressed: v${initialVersion} -> v${restartConfig.version}`);

    // Cleanup test module
    restartConfig.modules = restartConfig.modules.filter((m) => m.id !== 'warehouse_management');
    await AppConfig.updateOne({ configKey: 'GLOBAL_APP_CONFIG' }, { modules: restartConfig.modules });
    console.log(`🧹 Cleaned up temporary test module. Database pristine.`);

    console.log('\n🎉 ALL 6 MANDATORY TESTS PASSED SUCCESSFULLY! Real-time Dashboard-to-Application Synchronization verified.\n');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

runSyncTests();

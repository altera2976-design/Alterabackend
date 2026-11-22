const AppConfig = require('../models/AppConfig');

// Helper to broadcast config updates via Socket.IO
const broadcastConfigUpdate = (req, type, config) => {
  try {
    const io = req.app.get('io');
    if (io) {
      io.emit('app_config_updated', {
        type,
        version: config.version,
        config: {
          modules: config.modules,
          formSchemas: config.formSchemas,
          tableSchemas: config.tableSchemas,
          systemSettings: config.systemSettings,
          version: config.version,
          updatedAt: config.updatedAt,
        },
      });
      console.log(`📡 Broadcasted app_config_updated [type=${type}, v=${config.version}]`);
    }
  } catch (err) {
    console.warn('⚠️ Failed to broadcast socket event:', err.message);
  }
};

// GET /api/app-config: Get active config filtered for the requester's role
exports.getAppConfig = async (req, res, next) => {
  try {
    const config = await AppConfig.getOrCreateDefault();
    const userRole = req.user?.role?.toUpperCase() || 'EMPLOYEE';
    const isSuperAdmin = userRole === 'SUPER_ADMIN';

    // Filter modules by role & enabled status
    const filteredModules = config.modules
      .filter((m) => {
        if (!m.enabled) return false;
        if (isSuperAdmin) return true;
        if (!m.allowedRoles || m.allowedRoles.length === 0) return true;
        return m.allowedRoles.includes(userRole);
      })
      .sort((a, b) => a.order - b.order);

    res.status(200).json({
      success: true,
      data: {
        version: config.version,
        modules: filteredModules,
        formSchemas: config.formSchemas,
        tableSchemas: config.tableSchemas,
        systemSettings: config.systemSettings,
        updatedAt: config.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/app-config/master: Get complete configuration (Admins)
exports.getMasterAppConfig = async (req, res, next) => {
  try {
    const config = await AppConfig.getOrCreateDefault();
    res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/app-config/modules: Add, update, delete or reorder modules
exports.updateModules = async (req, res, next) => {
  try {
    const { modules } = req.body;
    if (!Array.isArray(modules)) {
      return res.status(400).json({ success: false, message: 'modules must be an array' });
    }

    const config = await AppConfig.getOrCreateDefault();
    config.modules = modules;
    config.version += 1;

    const adminIdentity = req.user?.name || req.user?.email || 'Admin';
    config.auditHistory.unshift({
      changedBy: adminIdentity,
      action: 'UPDATE_MODULES',
      section: 'NAVIGATION',
      details: `Updated navigation with ${modules.length} modules.`,
      timestamp: new Date(),
    });

    if (config.auditHistory.length > 50) {
      config.auditHistory = config.auditHistory.slice(0, 50);
    }

    await config.save();
    broadcastConfigUpdate(req, 'modules', config);

    res.status(200).json({
      success: true,
      message: 'Modules updated and synchronized across all applications.',
      data: config.modules,
      version: config.version,
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/app-config/forms: Update form schema for a module/formKey
exports.updateFormSchema = async (req, res, next) => {
  try {
    const { formKey, fields } = req.body;
    if (!formKey || !Array.isArray(fields)) {
      return res.status(400).json({ success: false, message: 'formKey and fields array are required' });
    }

    const config = await AppConfig.getOrCreateDefault();
    config.formSchemas.set(formKey, fields);
    config.version += 1;

    const adminIdentity = req.user?.name || req.user?.email || 'Admin';
    config.auditHistory.unshift({
      changedBy: adminIdentity,
      action: 'UPDATE_FORM_SCHEMA',
      section: formKey,
      details: `Updated form schema for '${formKey}' with ${fields.length} fields.`,
      timestamp: new Date(),
    });

    await config.save();
    broadcastConfigUpdate(req, 'forms', config);

    res.status(200).json({
      success: true,
      message: `Form schema for '${formKey}' updated and synchronized.`,
      data: config.formSchemas.get(formKey),
      version: config.version,
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/app-config/tables: Update table schema for a tableKey
exports.updateTableSchema = async (req, res, next) => {
  try {
    const { tableKey, columns } = req.body;
    if (!tableKey || !Array.isArray(columns)) {
      return res.status(400).json({ success: false, message: 'tableKey and columns array are required' });
    }

    const config = await AppConfig.getOrCreateDefault();
    config.tableSchemas.set(tableKey, columns);
    config.version += 1;

    const adminIdentity = req.user?.name || req.user?.email || 'Admin';
    config.auditHistory.unshift({
      changedBy: adminIdentity,
      action: 'UPDATE_TABLE_SCHEMA',
      section: tableKey,
      details: `Updated table columns for '${tableKey}' with ${columns.length} columns.`,
      timestamp: new Date(),
    });

    await config.save();
    broadcastConfigUpdate(req, 'tables', config);

    res.status(200).json({
      success: true,
      message: `Table schema for '${tableKey}' updated and synchronized.`,
      data: config.tableSchemas.get(tableKey),
      version: config.version,
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/app-config/settings: Update system & operational settings
exports.updateSystemSettings = async (req, res, next) => {
  try {
    const { systemSettings } = req.body;
    if (!systemSettings || typeof systemSettings !== 'object') {
      return res.status(400).json({ success: false, message: 'systemSettings object is required' });
    }

    const config = await AppConfig.getOrCreateDefault();
    config.systemSettings = {
      ...config.systemSettings.toObject?.() || config.systemSettings,
      ...systemSettings,
    };
    config.version += 1;

    const adminIdentity = req.user?.name || req.user?.email || 'Admin';
    config.auditHistory.unshift({
      changedBy: adminIdentity,
      action: 'UPDATE_SETTINGS',
      section: 'SYSTEM_SETTINGS',
      details: `Updated operational and system preferences.`,
      timestamp: new Date(),
    });

    await config.save();
    broadcastConfigUpdate(req, 'settings', config);

    res.status(200).json({
      success: true,
      message: 'System settings updated and synchronized across all applications.',
      data: config.systemSettings,
      version: config.version,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/app-config/sync-trigger: Broadcast entity changes to all web and mobile listeners
exports.triggerSync = async (req, res, next) => {
  try {
    const { entity, action, data } = req.body;
    const io = req.app.get('io');
    if (io) {
      io.emit('entity_changed', {
        entity: entity || 'general',
        action: action || 'updated',
        data: data || null,
        timestamp: new Date(),
      });
      console.log(`📡 Broadcasted entity_changed [entity=${entity}, action=${action}]`);
    }

    res.status(200).json({
      success: true,
      message: `Synchronization trigger dispatched for ${entity}.`,
    });
  } catch (error) {
    next(error);
  }
};

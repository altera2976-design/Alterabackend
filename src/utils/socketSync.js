/**
 * Centralized Socket.IO entity broadcast utility
 * Ensures every change made in Dashboard automatically notifies
 * all connected Web (Admin / Super Admin / User) and Mobile clients.
 */

function broadcastEntityChange(req, entity, action, data = null) {
  try {
    const io = req?.app?.get ? req.app.get('io') : null;
    if (io) {
      const payload = {
        entity,
        action,
        data,
        timestamp: new Date().toISOString(),
      };
      // General entity event
      io.emit('entity_changed', payload);
      // Specific entity event for targeted subscribers
      io.emit(`${entity}_changed`, payload);
      console.log(`📡 [Socket.IO] Broadcasted ${entity}_changed -> ${action}`);
    }
  } catch (err) {
    console.warn('⚠️ [Socket.IO] broadcastEntityChange warning:', err.message);
  }
}

module.exports = {
  broadcastEntityChange,
};

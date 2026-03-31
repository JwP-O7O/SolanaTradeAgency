// ============================================================
// NOTIFICATION MANAGER
// Re-exports NotificationManager from notificationRules
// for compatibility with agency-enhanced.js
// ============================================================
const { NotificationManager, getNotificationManager } = require('./notificationRules');

module.exports = NotificationManager;
module.exports.getNotificationManager = getNotificationManager;

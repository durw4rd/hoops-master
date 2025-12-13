// Admin configuration
// Note: Admin privileges are now controlled by LaunchDarkly 'admin-mode' flag
// This file is kept for potential future admin-specific configurations

// Admin feature settings
export const ADMIN_SETTINGS = {
  // Whether to show admin actions in the UI
  showAdminActions: true,
  
  // Whether to log admin actions (for audit trail)
  logAdminActions: true,
  
  // Admin action confirmation required
  requireConfirmation: true,
};

// Admin action types for audit trail
export const ADMIN_ACTION_TYPES = {
  REASSIGN_SLOT: 'admin_reassign_slot',
  OVERRIDE_SCHEDULE: 'admin_override_schedule',
  MANAGE_USERS: 'admin_manage_users',
} as const;

// Admin action logging interface
export interface AdminActionLog {
  timestamp: string;
  adminUser: string;
  actionType: string;
  details: Record<string, any>;
  sessionId?: string;
} 
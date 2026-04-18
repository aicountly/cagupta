/**
 * Role and permission definitions.
 *
 * These values mirror the seed data in server-php/database/seed.sql.
 * Keep in sync with the backend when adding/removing permissions.
 */

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN:       'admin',
  MANAGER:     'manager',
  STAFF:       'staff',
  VIEWER:      'viewer',
  AFFILIATE:   'affiliate',
  CLIENT:      'client',
};

/** Human-readable display names for each role. */
export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin:       'Admin',
  manager:     'Manager',
  staff:       'Staff',
  viewer:      'Viewer',
  affiliate:   'Affiliate',
  client:      'Client',
};

/** Tailwind-compatible badge colour classes for each role. */
export const ROLE_BADGE_COLORS = {
  super_admin: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' }, // red
  admin:       { bg: '#ffedd5', color: '#9a3412', border: '#fdba74' }, // orange
  manager:     { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' }, // blue
  staff:       { bg: '#dcfce7', color: '#166534', border: '#86efac' }, // green
  viewer:      { bg: '#f3f4f6', color: '#374151', border: '#d1d5db' }, // gray
  affiliate:   { bg: '#ede9fe', color: '#5b21b6', border: '#c4b5fd' }, // violet
  client:      { bg: '#dcfce7', color: '#166534', border: '#86efac' }, // green
};

/**
 * Default permissions per role.
 *
 * The wildcard '*' means all permissions.
 * Used client-side for optimistic checks; the server is the authoritative source.
 */
export const PERMISSIONS = {
  super_admin: ['*'],
  admin: [
    'dashboard.view',
    'clients.view', 'clients.create', 'clients.edit', 'clients.delete',
    'services.view', 'services.create', 'services.edit', 'services.delete',
    'documents.view', 'documents.upload',
    'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete',
    'calendar.view', 'calendar.create',
    'credentials.view',
    'registers.view',
    'leads.view', 'leads.create', 'leads.edit',
    'quotations.setup', 'quotations.manage',
    'settings.view',
    'users.manage',
    'users.delegate',
    'affiliates.manage',
  ],
  manager: [
    'dashboard.view',
    'clients.view', 'clients.create', 'clients.edit',
    'services.view', 'services.create', 'services.edit',
    'documents.view', 'documents.upload',
    'invoices.view', 'invoices.create',
    'calendar.view', 'calendar.create',
    'registers.view',
    'leads.view', 'leads.create',
    'quotations.manage',
    'users.delegate',
    'affiliates.manage',
  ],
  staff: [
    'dashboard.view',
    'clients.view',
    'services.view', 'services.edit',
    'documents.view',
    'calendar.view', 'calendar.create',
  ],
  viewer: [
    'dashboard.view',
    'clients.view',
    'services.view',
    'documents.view',
    'invoices.view',
  ],
  affiliate: [
    'affiliate.portal',
    'affiliate.profile',
    'affiliate.payouts.request',
    'affiliate.sub_affiliates.create',
    'affiliate.bank.manage',
  ],
  client: [
    'client.portal',
    'client.services.view',
    'client.ledger.view',
    'client.profile.view',
  ],
};

/**
 * Check whether a user has a specific permission.
 *
 * @param {string[]|null} userPermissions  The permissions array from the auth context.
 * @param {string}        permission       Permission key, e.g. 'clients.view'.
 * @returns {boolean}
 */
export function hasPermission(userPermissions, permission) {
  if (!userPermissions || userPermissions.length === 0) return false;
  if (userPermissions.includes('*')) return true;
  return userPermissions.includes(permission);
}

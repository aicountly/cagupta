/**
 * Role and permission definitions.
 * Mirrors server-php/database/seed.sql — keep in sync with backend.
 */
export const ROLES = {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    MANAGER: 'manager',
    STAFF: 'staff',
    VIEWER: 'viewer',
    ASSOCIATE: 'associate',
    PARTNER: 'partner',
    CLIENT: 'client',
    ACCOUNTS: 'accounts',
};
export const ROLE_LABELS = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    manager: 'Manager',
    staff: 'Staff',
    viewer: 'Viewer',
    associate: 'Associate',
    partner: 'Partner',
    client: 'Client',
    accounts: 'Accounts',
};
export const ROLE_BADGE_COLORS = {
    super_admin: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
    admin: { bg: '#ffedd5', color: '#9a3412', border: '#fdba74' },
    manager: { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
    staff: { bg: '#dcfce7', color: '#166534', border: '#86efac' },
    viewer: { bg: '#f3f4f6', color: '#374151', border: '#d1d5db' },
    associate: { bg: '#ede9fe', color: '#5b21b6', border: '#c4b5fd' },
    partner: { bg: '#ffedd5', color: '#9a3412', border: '#fdba74' },
    client: { bg: '#dcfce7', color: '#166534', border: '#86efac' },
    accounts: { bg: '#cffafe', color: '#155e75', border: '#67e8f9' },
};
export const PERMISSIONS = {
    super_admin: ['*'],
    admin: [
        'dashboard.view',
        'clients.view', 'clients.create', 'clients.edit', 'clients.delete',
        'services.view', 'services.create', 'services.edit', 'services.delete',
        'services.assignees.manage',
        'documents.view', 'documents.upload',
        'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete',
        'calendar.view', 'calendar.create',
        'credentials.view',
        'portal_types.manage',
        'registers.view',
        'register_types.manage',
        'leads.view', 'leads.create', 'leads.edit',
        'quotations.setup', 'quotations.manage',
        'settings.view',
        'chat.use',
        'client.chat.manage',
        'users.manage',
        'users.delegate',
        'associates.manage',
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
        'chat.use',
        'client.chat.manage',
        'users.delegate',
        'associates.manage',
    ],
    staff: [
        'dashboard.view',
        'clients.view',
        'services.view', 'services.edit',
        'documents.view',
        'calendar.view', 'calendar.create',
        'chat.use',
        'client.chat.manage',
        'cash_book.view', 'cash_book.create', 'cash_book.edit',
    ],
    viewer: [
        'dashboard.view',
        'clients.view',
        'services.view',
        'documents.view',
        'chat.use',
        'invoices.view',
    ],
    associate: [
        'associate.portal',
        'associate.profile',
        'chat.use',
        'associate.payouts.request',
        'associate.sub_associates.create',
        'associate.bank.manage',
    ],
    partner: [
        'partner.portal',
        'partner.profile',
        'chat.use',
        'partner.assignments.view',
        'partner.assignments.manage',
        'partner.payouts.request',
        'partner.bank.manage',
    ],
    client: [
        'client.portal',
        'client.services.view',
        'client.ledger.view',
        'client.profile.view',
        'client.chat.use',
    ],
    accounts: [
        'dashboard.view',
        'clients.view',
        'clients.edit',
        'services.view',
        'documents.view',
        'calendar.view',
        'registers.view',
        'invoices.view',
        'invoices.create',
        'invoices.edit',
        'invoices.delete',
        'settings.view',
        'chat.use',
        'client.chat.manage',
        'associates.manage',
        'partners.manage',
    ],
};
export function hasPermission(userPermissions, permission) {
    if (!userPermissions || userPermissions.length === 0)
        return false;
    if (userPermissions.includes('*'))
        return true;
    return userPermissions.includes(permission);
}
export function hasAnyPermission(userPermissions, permissions) {
    if (!permissions.length)
        return false;
    return permissions.some((p) => hasPermission(userPermissions, p));
}

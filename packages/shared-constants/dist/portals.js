export const VALID_PORTALS = [
    'staff',
    'associate',
    'client',
    'partner',
];
/** Legacy marketing links used ?portal=affiliate before the Associate rename. */
export const LEGACY_ASSOCIATE_PORTAL_SLUG = 'affiliate';
export const PORTAL_META = {
    staff: {
        label: 'Core',
        accent: '#2563eb',
        tint: '#eff6ff',
        iconKey: 'Users',
        sub: 'For Staff & Team Members',
    },
    associate: {
        label: 'Associate',
        accent: '#7c3aed',
        tint: '#f5f3ff',
        iconKey: 'Handshake',
        sub: 'For Accountants & Bankers',
    },
    client: {
        label: 'My CA',
        accent: '#15803d',
        tint: '#f0fdf4',
        iconKey: 'UserCircle',
        sub: 'Clients of CA Rahul Gupta & Associates',
    },
    partner: {
        label: 'Partner',
        accent: '#ea580c',
        tint: '#fff7ed',
        iconKey: 'Briefcase',
        sub: 'For Professionals',
    },
};
export function isPortalKey(value) {
    return VALID_PORTALS.includes(value);
}
/** Normalize URL ?portal= slug (handles legacy affiliate → associate). */
export function normalizePortalSlug(raw) {
    if (!raw)
        return null;
    const slug = raw === LEGACY_ASSOCIATE_PORTAL_SLUG ? 'associate' : raw;
    return isPortalKey(slug) ? slug : null;
}
export function portalMismatchMessage(portal, user) {
    if (user?.role === 'associate' && portal !== 'associate') {
        return 'This account is for associates. Select “Associate” above.';
    }
    if (user?.role === 'partner' && portal !== 'partner') {
        return 'This account is for partners. Select “Partner” above.';
    }
    if (user?.role === 'client' && portal !== 'client') {
        return 'This account is for clients. Select “My CA” above.';
    }
    if (user?.role && user.role !== 'associate' && portal === 'associate') {
        return 'This is not an associate account. Select “Core” above.';
    }
    if (user?.role && user.role !== 'partner' && portal === 'partner') {
        return 'This is not a partner account. Select “Core” above.';
    }
    if (user?.role && user.role !== 'client' && portal === 'client') {
        return 'This is not a client account. Select “Core” or “Associate”.';
    }
    return '';
}
/** Web route home path after login (mobile uses React Navigation — map separately). */
export function homeRouteForRole(role) {
    if (role === 'associate')
        return '/associate';
    if (role === 'partner')
        return '/partner';
    if (role === 'client')
        return '/client';
    return '/';
}
export function mobileNavigatorForRole(role) {
    if (role === 'associate')
        return 'Associate';
    if (role === 'partner')
        return 'Partner';
    if (role === 'client')
        return 'Client';
    return 'Core';
}

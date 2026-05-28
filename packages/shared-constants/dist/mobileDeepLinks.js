import { normalizePortalSlug } from './portals.js';
export const MOBILE_APP_SCHEME = 'carahulgupta';
/** HTTPS hosts that open the mobile app via Universal / App Links (must match app.config.js). */
export const MOBILE_UNIVERSAL_LINK_HOSTS = ['app.carahulgupta.in'];
function pathFromParsedUrl(parsed) {
    const host = parsed.hostname || '';
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (MOBILE_UNIVERSAL_LINK_HOSTS.includes(host)) {
        return segments.join('/');
    }
    if (!host && segments.length === 0)
        return '';
    if (!host)
        return segments.join('/');
    if (segments.length === 0)
        return host;
    return [host, ...segments].join('/');
}
function portalFromSegment(segment) {
    if (segment === 'core' || segment === 'staff')
        return 'staff';
    return normalizePortalSlug(segment);
}
/** Build `carahulgupta://…` URL for emails, push payloads, or QR codes. */
export function buildMobileDeepLink(path, query) {
    const clean = path.replace(/^\//, '');
    const qs = query && Object.keys(query).length > 0
        ? `?${new URLSearchParams(query).toString()}`
        : '';
    return `${MOBILE_APP_SCHEME}://${clean}${qs}`;
}
export function buildMobileLoginLink(portal) {
    return buildMobileDeepLink('login', { portal });
}
/**
 * Parse app deep link URLs.
 * Examples:
 * - carahulgupta://login?portal=client
 * - carahulgupta://login?portal=affiliate  (legacy → associate)
 * - carahulgupta://client/service/42
 * - carahulgupta://core/inbox
 */
export function parseMobileDeepLink(url) {
    if (!url)
        return null;
    try {
        const normalized = url.includes('://') ? url : `${MOBILE_APP_SCHEME}://${url.replace(/^\//, '')}`;
        const parsed = new URL(normalized);
        const scheme = parsed.protocol.replace(':', '');
        const isCustomScheme = scheme === MOBILE_APP_SCHEME;
        const isUniversalLink = scheme === 'https' &&
            MOBILE_UNIVERSAL_LINK_HOSTS.includes(parsed.hostname);
        if (!isCustomScheme && !isUniversalLink)
            return null;
        const query = {};
        parsed.searchParams.forEach((value, key) => {
            query[key] = value;
        });
        const routePath = pathFromParsedUrl(parsed);
        if (!routePath || routePath === 'login') {
            return { type: 'login', portal: normalizePortalSlug(query.portal) };
        }
        const segments = routePath.split('/');
        const portal = portalFromSegment(segments[0] || '');
        if (!portal)
            return null;
        return {
            type: 'route',
            portal,
            path: segments.slice(1).join('/'),
            params: query,
        };
    }
    catch {
        return null;
    }
}
/** Pre-select login portal tab from a cold-start or marketing deep link. */
export function resolveInitialPortalFromUrl(url) {
    const link = parseMobileDeepLink(url);
    if (!link)
        return null;
    if (link.type === 'login')
        return link.portal;
    return link.portal;
}
/** Map auth role to portal key for deep-link permission checks. */
export function portalKeyForRole(role) {
    if (role === 'associate')
        return 'associate';
    if (role === 'partner')
        return 'partner';
    if (role === 'client')
        return 'client';
    return 'staff';
}

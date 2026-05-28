import { type PortalKey } from './portals.js';
export declare const MOBILE_APP_SCHEME = "carahulgupta";
/** HTTPS hosts that open the mobile app via Universal / App Links (must match app.config.js). */
export declare const MOBILE_UNIVERSAL_LINK_HOSTS: readonly ["app.carahulgupta.in"];
export type MobileDeepLinkLogin = {
    type: 'login';
    portal: PortalKey | null;
};
export type MobileDeepLinkRoute = {
    type: 'route';
    portal: PortalKey;
    /** Path after portal segment, e.g. `service/123`, `inbox`, `chat`. */
    path: string;
    params: Record<string, string>;
};
export type MobileDeepLink = MobileDeepLinkLogin | MobileDeepLinkRoute;
/** Build `carahulgupta://…` URL for emails, push payloads, or QR codes. */
export declare function buildMobileDeepLink(path: string, query?: Record<string, string>): string;
export declare function buildMobileLoginLink(portal: PortalKey): string;
/**
 * Parse app deep link URLs.
 * Examples:
 * - carahulgupta://login?portal=client
 * - carahulgupta://login?portal=affiliate  (legacy → associate)
 * - carahulgupta://client/service/42
 * - carahulgupta://core/inbox
 */
export declare function parseMobileDeepLink(url: string | null | undefined): MobileDeepLink | null;
/** Pre-select login portal tab from a cold-start or marketing deep link. */
export declare function resolveInitialPortalFromUrl(url: string | null | undefined): PortalKey | null;
/** Map auth role to portal key for deep-link permission checks. */
export declare function portalKeyForRole(role: string | null | undefined): PortalKey;
//# sourceMappingURL=mobileDeepLinks.d.ts.map
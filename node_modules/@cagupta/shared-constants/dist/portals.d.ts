/** Portal keys used in auth API and routing. */
export type PortalKey = 'staff' | 'associate' | 'client' | 'partner';
export declare const VALID_PORTALS: readonly PortalKey[];
/** Legacy marketing links used ?portal=affiliate before the Associate rename. */
export declare const LEGACY_ASSOCIATE_PORTAL_SLUG = "affiliate";
/** Lucide icon names — each app maps these to its icon component library. */
export type PortalIconKey = 'Users' | 'Handshake' | 'UserCircle' | 'Briefcase';
export interface PortalMetaEntry {
    label: string;
    accent: string;
    tint: string;
    iconKey: PortalIconKey;
    sub: string;
}
export declare const PORTAL_META: Record<PortalKey, PortalMetaEntry>;
export declare function isPortalKey(value: string | null | undefined): value is PortalKey;
/** Normalize URL ?portal= slug (handles legacy affiliate → associate). */
export declare function normalizePortalSlug(raw: string | null | undefined): PortalKey | null;
export interface PortalUser {
    role?: string | null;
}
export declare function portalMismatchMessage(portal: PortalKey, user: PortalUser | null | undefined): string;
/** Web route home path after login (mobile uses React Navigation — map separately). */
export declare function homeRouteForRole(role: string | null | undefined): string;
/** Mobile navigator key after login. */
export type MobilePortalNavigator = 'Core' | 'Associate' | 'Partner' | 'Client';
export declare function mobileNavigatorForRole(role: string | null | undefined): MobilePortalNavigator;
//# sourceMappingURL=portals.d.ts.map
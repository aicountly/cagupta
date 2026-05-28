/**
 * Role and permission definitions.
 * Mirrors server-php/database/seed.sql — keep in sync with backend.
 */
export declare const ROLES: {
    readonly SUPER_ADMIN: "super_admin";
    readonly ADMIN: "admin";
    readonly MANAGER: "manager";
    readonly STAFF: "staff";
    readonly VIEWER: "viewer";
    readonly ASSOCIATE: "associate";
    readonly PARTNER: "partner";
    readonly CLIENT: "client";
    readonly ACCOUNTS: "accounts";
};
export type RoleKey = (typeof ROLES)[keyof typeof ROLES];
export declare const ROLE_LABELS: Record<string, string>;
export interface RoleBadgeColors {
    bg: string;
    color: string;
    border: string;
}
export declare const ROLE_BADGE_COLORS: Record<string, RoleBadgeColors>;
export declare const PERMISSIONS: Record<string, string[]>;
export declare function hasPermission(userPermissions: string[] | null | undefined, permission: string): boolean;
export declare function hasAnyPermission(userPermissions: string[] | null | undefined, permissions: string[]): boolean;
//# sourceMappingURL=roles.d.ts.map
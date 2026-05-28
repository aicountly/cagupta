import { type PortalKey } from '@cagupta/shared-constants';
import type { ApiClient, SessionStorageAdapter } from './createApiClient.js';
export interface AuthUser {
    id: number;
    name: string;
    email: string;
    role: string;
    permissions?: string[];
    initials?: string;
    is_active?: boolean;
    can_change_password?: boolean;
    avatar_url?: string | null;
    portal_theme?: string;
}
export interface AuthSession {
    token: string;
    user: AuthUser;
}
export interface AuthOptions {
    portal?: PortalKey;
    identifier?: string;
}
export interface CreateAuthServiceConfig {
    api: ApiClient;
    storage: SessionStorageAdapter;
    baseUrl: string;
    fetchImpl?: typeof fetch;
    getInitials?: (name: string) => string;
    mockMode?: boolean;
    mockOtp?: string;
}
declare function maskEmail(email: string): string;
export declare function createAuthService(config: CreateAuthServiceConfig): {
    loginWithPassword: (email: string, password: string, options?: AuthOptions) => Promise<AuthSession | {
        otpRequired: true;
        maskedEmail: string;
    }>;
    requestEmailOtp: (email: string, options?: AuthOptions) => Promise<void>;
    verifyEmailOtp: (email: string, otp: string, options?: AuthOptions) => Promise<AuthSession>;
    fetchCurrentUser: (token: string) => Promise<AuthUser | null>;
    logoutFromServer: (token: string | null) => Promise<void>;
    logout: () => Promise<void>;
    getStoredSession: () => Promise<AuthSession | null>;
    saveSession: (token: string, user: AuthUser) => Promise<AuthSession>;
    buildMockUser: (name: string, email: string, role?: string | null) => AuthUser;
    maskEmail: typeof maskEmail;
    updateProfile: (fields: {
        name?: string;
        avatar_url?: string | null;
        portal_theme?: string;
    }) => Promise<AuthUser>;
    changePassword: (creds: {
        currentPassword: string;
        newPassword: string;
    }) => Promise<void>;
};
export type AuthService = ReturnType<typeof createAuthService>;
export {};
//# sourceMappingURL=auth.d.ts.map
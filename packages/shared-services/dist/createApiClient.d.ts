export type FetchImpl = typeof fetch;
export interface SessionStorageAdapter {
    getToken(): Promise<string | null> | string | null;
    setToken(token: string): Promise<void> | void;
    removeToken(): Promise<void> | void;
    getUser(): Promise<unknown | null> | unknown | null;
    setUser(user: unknown): Promise<void> | void;
    removeUser(): Promise<void> | void;
}
export interface ApiClientConfig {
    baseUrl: string;
    getToken: () => Promise<string | null> | string | null;
    fetchImpl?: FetchImpl;
    /** Called when an authenticated request returns HTTP 401. */
    onUnauthorized?: () => void;
}
export interface ApiJsonResponse<T = unknown> {
    success?: boolean;
    message?: string;
    data?: T;
    meta?: Record<string, unknown>;
    has_more?: boolean;
}
export declare function createApiClient(config: ApiClientConfig): {
    get: <T = unknown>(path: string, params?: Record<string, string | number | undefined>) => Promise<ApiJsonResponse<T>>;
    post: <T = unknown>(path: string, body?: unknown) => Promise<ApiJsonResponse<T>>;
    patch: <T = unknown>(path: string, body?: unknown) => Promise<ApiJsonResponse<T>>;
    postPublic: <T = unknown>(path: string, body?: unknown) => Promise<ApiJsonResponse<T>>;
    authHeaders: (extra?: Record<string, string>) => Promise<Record<string, string>>;
    parseResponse: (res: Response) => Promise<ApiJsonResponse<unknown>>;
};
export type ApiClient = ReturnType<typeof createApiClient>;
//# sourceMappingURL=createApiClient.d.ts.map
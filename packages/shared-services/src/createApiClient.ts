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

async function parseResponse(res: Response, onUnauthorized?: () => void): Promise<ApiJsonResponse> {
  if (res.status === 401) {
    onUnauthorized?.();
  }
  const json = (await res.json().catch(() => ({}))) as ApiJsonResponse;
  if (!res.ok) {
    throw new Error(json.message || `Request failed (${res.status})`);
  }
  return json;
}

export function createApiClient(config: ApiClientConfig) {
  const fetchImpl = config.fetchImpl ?? fetch;
  const onUnauthorized = config.onUnauthorized;
  const parse = (res: Response) => parseResponse(res, onUnauthorized);

  async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
    const token = await config.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  }

  async function get<T = unknown>(path: string, params?: Record<string, string | number | undefined>): Promise<ApiJsonResponse<T>> {
    const url = new URL(`${config.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
      });
    }
    const res = await fetchImpl(url.toString(), { headers: await authHeaders() });
    return parse(res) as Promise<ApiJsonResponse<T>>;
  }

  async function post<T = unknown>(path: string, body?: unknown): Promise<ApiJsonResponse<T>> {
    const res = await fetchImpl(`${config.baseUrl}${path}`, {
      method: 'POST',
      headers: await authHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return parse(res) as Promise<ApiJsonResponse<T>>;
  }

  async function patch<T = unknown>(path: string, body?: unknown): Promise<ApiJsonResponse<T>> {
    const res = await fetchImpl(`${config.baseUrl}${path}`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return parse(res) as Promise<ApiJsonResponse<T>>;
  }

  async function postPublic<T = unknown>(path: string, body?: unknown): Promise<ApiJsonResponse<T>> {
    const res = await fetchImpl(`${config.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return parse(res) as Promise<ApiJsonResponse<T>>;
  }

  return { get, post, patch, postPublic, authHeaders, parseResponse: parse };
}

export type ApiClient = ReturnType<typeof createApiClient>;

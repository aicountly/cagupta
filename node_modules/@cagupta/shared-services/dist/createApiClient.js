async function parseResponse(res, onUnauthorized) {
    if (res.status === 401) {
        onUnauthorized?.();
    }
    const json = (await res.json().catch(() => ({})));
    if (!res.ok) {
        throw new Error(json.message || `Request failed (${res.status})`);
    }
    return json;
}
export function createApiClient(config) {
    const fetchImpl = config.fetchImpl ?? fetch;
    const onUnauthorized = config.onUnauthorized;
    const parse = (res) => parseResponse(res, onUnauthorized);
    async function authHeaders(extra = {}) {
        const token = await config.getToken();
        return {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...extra,
        };
    }
    async function get(path, params) {
        const url = new URL(`${config.baseUrl}${path}`);
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== '')
                    url.searchParams.set(k, String(v));
            });
        }
        const res = await fetchImpl(url.toString(), { headers: await authHeaders() });
        return parse(res);
    }
    async function post(path, body) {
        const res = await fetchImpl(`${config.baseUrl}${path}`, {
            method: 'POST',
            headers: await authHeaders(),
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        return parse(res);
    }
    async function patch(path, body) {
        const res = await fetchImpl(`${config.baseUrl}${path}`, {
            method: 'PATCH',
            headers: await authHeaders(),
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        return parse(res);
    }
    async function postPublic(path, body) {
        const res = await fetchImpl(`${config.baseUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        return parse(res);
    }
    return { get, post, patch, postPublic, authHeaders, parseResponse: parse };
}

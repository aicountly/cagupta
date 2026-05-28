import { invokeUnauthorizedHandler } from './unauthorizedHandler';

/** Public auth endpoints — 401 here means bad credentials, not expired session. */
const PUBLIC_AUTH_PATH = /\/auth\/(login|verify-otp|request-otp|sso)(\/|$|\?)/;

/**
 * Global fetch wrapper: expired JWT on authenticated API calls triggers logout.
 * Covers all web services still using raw fetch (not only shared apiClient).
 */
export function installFetch401Handler() {
  if (typeof window === 'undefined' || window.__caguptaFetch401Installed) return;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await nativeFetch(input, init);
    if (res.status === 401 && localStorage.getItem('auth_token')) {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      let pathname = url;
      try {
        pathname = new URL(url, window.location.origin).pathname;
      } catch {
        /* keep raw url */
      }
      if (!PUBLIC_AUTH_PATH.test(pathname)) {
        invokeUnauthorizedHandler();
      }
    }
    return res;
  };
  window.__caguptaFetch401Installed = true;
}

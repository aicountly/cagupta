/** Mutable hook for API 401 → logout (registered by AuthProvider after mount). */
let handler = null;

export function setUnauthorizedHandler(cb) {
  handler = cb;
}

export function invokeUnauthorizedHandler() {
  handler?.();
}

/** Mutable hook for API 401 → logout (registered by AuthProvider after mount). */
let handler: (() => void) | null = null;

export function setUnauthorizedHandler(cb: (() => void) | null) {
  handler = cb;
}

export function invokeUnauthorizedHandler() {
  handler?.();
}

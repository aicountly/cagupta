import { useEffect, useRef } from 'react';

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise = null;

function loadTurnstileScript() {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.turnstile) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.turnstile)));
      return;
    }
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.onload = () => resolve(Boolean(window.turnstile));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile widget for public lead forms.
 * Renders nothing when siteKey is empty (local dev / mock mode).
 */
export default function TurnstileField({ siteKey, onVerify, onExpire }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    if (!siteKey) {
      onVerifyRef.current?.('');
      return undefined;
    }

    let cancelled = false;

    loadTurnstileScript().then((ok) => {
      if (cancelled || !ok || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => onVerifyRef.current?.(token),
        'expired-callback': () => {
          onVerifyRef.current?.('');
          onExpireRef.current?.();
        },
        'error-callback': () => onVerifyRef.current?.(''),
      });
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current != null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={containerRef} style={{ minHeight: 65, marginTop: 8 }} />;
}

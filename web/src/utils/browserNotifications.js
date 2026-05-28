const SHOWN_STORAGE_KEY = 'cagupta:shown-browser-notifs';
export const BROWSER_NOTIF_PROMPT_DISMISSED_KEY = 'cagupta:browser-notif-prompt-dismissed';
const MAX_STORED_TAGS = 200;

const shownTags = loadShownSet();

function loadShownSet() {
  try {
    const raw = sessionStorage.getItem(SHOWN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function persistShownSet() {
  const arr = [...shownTags].slice(-MAX_STORED_TAGS);
  sessionStorage.setItem(SHOWN_STORAGE_KEY, JSON.stringify(arr));
}

export function isBrowserNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotificationPermission() {
  if (!isBrowserNotificationSupported()) return 'denied';
  return Notification.permission;
}

export async function requestBrowserNotificationPermission() {
  if (!isBrowserNotificationSupported()) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

export function hasShownBrowserNotification(tag) {
  return shownTags.has(String(tag));
}

export function markShownBrowserNotification(tag) {
  shownTags.add(String(tag));
  persistShownSet();
}

export function truncatePreview(text, maxLen = 200) {
  const value = String(text || '').trim();
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen - 1)}…`;
}

export function shouldSuppressStaffNotification({
  pathname,
  search,
  kind,
  entityId,
  floatingChatOpen,
  floatingChatConversationId,
}) {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return false;
  }

  const id = Number(entityId || 0);
  if (id <= 0) return false;

  if (kind === 'chat_message') {
    if (pathname === '/desk/chat') {
      const params = new URLSearchParams(search || '');
      if (Number(params.get('conversation') || 0) === id) return true;
    }
    if (floatingChatOpen && Number(floatingChatConversationId || 0) === id) return true;
  }

  if (kind === 'client_chat_escalation' && pathname === '/desk/client-chat') {
    const params = new URLSearchParams(search || '');
    if (Number(params.get('thread') || 0) === id) return true;
  }

  return false;
}

export function shouldSuppressClientChatNotification(pathname) {
  return typeof document !== 'undefined'
    && document.visibilityState === 'visible'
    && pathname === '/client/chat';
}

/**
 * Show a native OS/browser notification. Returns null when skipped or unsupported.
 */
export function showBrowserNotification({ tag, title, body, onClick }) {
  if (!isBrowserNotificationSupported()) return null;
  if (getBrowserNotificationPermission() !== 'granted') return null;

  const notificationTag = String(tag);
  if (hasShownBrowserNotification(notificationTag)) return null;

  markShownBrowserNotification(notificationTag);

  const base = import.meta.env.BASE_URL || '/';
  const icon = `${base}${base.endsWith('/') ? '' : '/'}favicon.ico`.replace(/\/{2,}/g, '/');

  const notification = new Notification(title || 'New message', {
    body: body || '',
    icon,
    tag: notificationTag,
  });

  notification.onclick = (event) => {
    event.preventDefault();
    window.focus();
    notification.close();
    onClick?.();
  };

  return notification;
}

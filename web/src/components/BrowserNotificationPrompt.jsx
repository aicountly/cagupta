import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import {
  BROWSER_NOTIF_PROMPT_DISMISSED_KEY,
  getBrowserNotificationPermission,
  isBrowserNotificationSupported,
  requestBrowserNotificationPermission,
} from '../utils/browserNotifications';

function getInitialVisible() {
  if (!isBrowserNotificationSupported()) return false;
  const dismissed = localStorage.getItem(BROWSER_NOTIF_PROMPT_DISMISSED_KEY) === '1';
  return getBrowserNotificationPermission() === 'default' && !dismissed;
}

export default function BrowserNotificationPrompt() {
  const [visible, setVisible] = useState(getInitialVisible);

  async function handleEnable() {
    const result = await requestBrowserNotificationPermission();
    setVisible(false);
    if (result === 'denied') {
      localStorage.setItem(BROWSER_NOTIF_PROMPT_DISMISSED_KEY, '1');
    }
  }

  function handleDismiss() {
    localStorage.setItem(BROWSER_NOTIF_PROMPT_DISMISSED_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div style={bannerStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
        <Bell size={18} color="#2563eb" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
            Enable desktop notifications
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 1.45 }}>
            Get message previews in your Windows or Mac notification bar when you are away from chat.
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button type="button" onClick={handleEnable} style={enableBtn}>
          Enable
        </button>
        <button type="button" onClick={handleDismiss} style={dismissBtn} aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

const bannerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  marginBottom: 16,
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid #BFDBFE',
  background: '#EFF6FF',
};

const enableBtn = {
  padding: '7px 12px',
  borderRadius: 8,
  border: 'none',
  background: '#2563eb',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const dismissBtn = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 6,
  borderRadius: 8,
  border: 'none',
  background: 'transparent',
  color: '#64748b',
  cursor: 'pointer',
};

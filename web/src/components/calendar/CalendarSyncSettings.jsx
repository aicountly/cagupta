import { useState, useEffect, useCallback } from 'react';
import {
  getCalendarAccounts,
  getGoogleAuthorizeUrl,
  getOutlookAuthorizeUrl,
  connectApple,
  disconnectAccount,
  updateCalendarAccount,
  getSyncSettings,
  updateSyncSettings,
  triggerSync,
  openOAuthPopup,
} from '../../services/calendarSyncService';
import { useNotification } from '../../context/NotificationContext';

// ── Provider metadata ─────────────────────────────────────────────────────────

const PROVIDERS = [
  {
    key: 'google',
    label: 'Google Calendar',
    icon: (
      <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
        <path fill="#4285F4" d="M24 20.5v7h9.8c-.4 2.5-2.9 7.3-9.8 7.3-5.9 0-10.7-4.9-10.7-10.8S18.1 13.2 24 13.2c3.3 0 5.6 1.4 6.9 2.6l4.7-4.5C32.6 8.3 28.6 6.2 24 6.2 13.8 6.2 5.5 14.5 5.5 24.5S13.8 42.8 24 42.8c10.7 0 17.7-7.5 17.7-18.1 0-1.2-.1-2.1-.3-3.1H24z"/>
      </svg>
    ),
    color: '#4285F4',
  },
  {
    key: 'outlook',
    label: 'Outlook Calendar',
    icon: (
      <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
        <rect x="4" y="4" width="40" height="40" rx="4" fill="#0078D4"/>
        <text x="24" y="32" textAnchor="middle" fill="#fff" fontSize="20" fontWeight="bold" fontFamily="Arial">O</text>
      </svg>
    ),
    color: '#0078D4',
  },
  {
    key: 'apple',
    label: 'Apple Calendar',
    icon: (
      <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
        <rect x="4" y="4" width="40" height="40" rx="8" fill="#1c1c1e"/>
        <text x="24" y="32" textAnchor="middle" fill="#fff" fontSize="20" fontWeight="bold" fontFamily="Arial"></text>
      </svg>
    ),
    color: '#1c1c1e',
  },
];

const DIRECTION_LABELS = {
  two_way:   'Two-way',
  push_only: 'Push only (app → calendar)',
  pull_only: 'Pull only (calendar → app)',
};

// ── Main component ────────────────────────────────────────────────────────────

export default function CalendarSyncSettings() {
  const { addNotification } = useNotification();

  const [accounts, setAccounts]         = useState([]);
  const [settings, setSettings]         = useState({});
  const [loading, setLoading]           = useState(true);
  const [syncing, setSyncing]           = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [appleForm, setAppleForm] = useState({ visible: false, apple_id: '', app_password: '', submitting: false });

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([getCalendarAccounts(), getSyncSettings()])
      .then(([accts, cfg]) => {
        setAccounts(accts);
        setSettings(cfg);
      })
      .catch(() => addNotification('Could not load calendar sync data', 'info'))
      .finally(() => setLoading(false));
  }, [addNotification]);

  useEffect(() => { reload(); }, [reload]);

  // ── Connect handlers ──────────────────────────────────────────────────────

  async function handleConnectGoogle() {
    try {
      const { authorizationUrl } = await getGoogleAuthorizeUrl();
      await openOAuthPopup(authorizationUrl, 'google_calendar_oauth');
      addNotification('Google Calendar connected', 'appointment');
      reload();
    } catch (err) {
      addNotification(err.message || 'Google connect failed', 'info');
    }
  }

  async function handleConnectOutlook() {
    try {
      const { authorizationUrl } = await getOutlookAuthorizeUrl();
      await openOAuthPopup(authorizationUrl, 'outlook_calendar_oauth');
      addNotification('Outlook Calendar connected', 'appointment');
      reload();
    } catch (err) {
      addNotification(err.message || 'Outlook connect failed', 'info');
    }
  }

  async function handleConnectApple(e) {
    e.preventDefault();
    setAppleForm((f) => ({ ...f, submitting: true }));
    try {
      await connectApple({ apple_id: appleForm.apple_id, app_password: appleForm.app_password });
      setAppleForm({ visible: false, apple_id: '', app_password: '', submitting: false });
      addNotification('Apple Calendar connected', 'appointment');
      reload();
    } catch (err) {
      addNotification(err.message || 'Apple connect failed', 'info');
      setAppleForm((f) => ({ ...f, submitting: false }));
    }
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  async function handleDisconnect(tokenId, providerLabel) {
    if (!window.confirm(`Disconnect ${providerLabel}? All synced data will stop updating.`)) return;
    try {
      await disconnectAccount(tokenId);
      addNotification(`${providerLabel} disconnected`, 'info');
      reload();
    } catch (err) {
      addNotification(err.message || 'Disconnect failed', 'info');
    }
  }

  // ── Calendar toggle / direction ───────────────────────────────────────────

  async function handleToggleCalendar(calId, field, value) {
    try {
      await updateCalendarAccount(calId, { [field]: value });
      setAccounts((prev) =>
        prev.map((group) => ({
          ...group,
          calendars: group.calendars.map((cal) =>
            cal.id === calId ? { ...cal, [field]: value } : cal,
          ),
        })),
      );
    } catch (err) {
      addNotification(err.message || 'Update failed', 'info');
    }
  }

  // ── Global settings ───────────────────────────────────────────────────────

  async function handleSaveSettings() {
    setSavingSettings(true);
    try {
      const updated = await updateSyncSettings(settings);
      setSettings(updated);
      addNotification('Sync settings saved', 'appointment');
    } catch (err) {
      addNotification(err.message || 'Could not save settings', 'info');
    } finally {
      setSavingSettings(false);
    }
  }

  // ── Manual sync ───────────────────────────────────────────────────────────

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const result = await triggerSync();
      const msg = `Sync done — ${result.imported ?? 0} imported, ${result.conflicts ?? 0} conflicts`;
      addNotification(msg, 'appointment');
      reload();
    } catch (err) {
      addNotification(err.message || 'Sync failed', 'info');
    } finally {
      setSyncing(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getConnectedGroup(providerKey) {
    return accounts.find((a) => a.provider === providerKey) || null;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <div style={{ padding: 32, color: '#94a3b8' }}>Loading calendar integrations…</div>;
  }

  return (
    <div style={{ maxWidth: 720 }}>
      {/* ── Connected Accounts ── */}
      <section style={{ marginBottom: 32 }}>
        <h3 style={sectionTitle}>Connected Accounts</h3>
        <p style={sectionDesc}>
          Connect your Google, Outlook, or Apple iCloud calendars. Each provider can have multiple
          calendars — toggle which ones to sync and choose the sync direction.
        </p>

        {PROVIDERS.map((prov) => {
          const group = getConnectedGroup(prov.key);
          return (
            <div key={prov.key} style={providerCard}>
              {/* Provider header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ flexShrink: 0 }}>{prov.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{prov.label}</div>
                  {group ? (
                    <div style={{ fontSize: 12, color: '#64748b' }}>{group.provider_email}</div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Not connected</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {group ? (
                    <>
                      {prov.key === 'google' && (
                        <button type="button" style={btnOutlineSmall} onClick={handleConnectGoogle}>
                          + Add account
                        </button>
                      )}
                      {prov.key === 'outlook' && (
                        <button type="button" style={btnOutlineSmall} onClick={handleConnectOutlook}>
                          + Add account
                        </button>
                      )}
                      <button
                        type="button"
                        style={btnDangerSmall}
                        onClick={() => handleDisconnect(group.token_id || 0, prov.label)}
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <>
                      {prov.key === 'google' && (
                        <button type="button" style={{ ...btnPrimarySmall, background: prov.color }} onClick={handleConnectGoogle}>
                          Connect
                        </button>
                      )}
                      {prov.key === 'outlook' && (
                        <button type="button" style={{ ...btnPrimarySmall, background: prov.color }} onClick={handleConnectOutlook}>
                          Connect
                        </button>
                      )}
                      {prov.key === 'apple' && (
                        <button
                          type="button"
                          style={{ ...btnPrimarySmall, background: prov.color }}
                          onClick={() => setAppleForm((f) => ({ ...f, visible: !f.visible }))}
                        >
                          {appleForm.visible ? 'Cancel' : 'Connect'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Apple credential form */}
              {prov.key === 'apple' && appleForm.visible && !group && (
                <form onSubmit={handleConnectApple} style={appleFormBox}>
                  <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                    Apple Calendar uses an <strong>App-Specific Password</strong> instead of OAuth.
                    Generate one at{' '}
                    <a href="https://appleid.apple.com" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
                      appleid.apple.com
                    </a>{' '}
                    → Security → App-Specific Passwords.
                  </p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <input
                      type="email"
                      placeholder="Apple ID (email)"
                      required
                      value={appleForm.apple_id}
                      onChange={(e) => setAppleForm((f) => ({ ...f, apple_id: e.target.value }))}
                      style={inputStyle}
                    />
                    <input
                      type="password"
                      placeholder="App-specific password"
                      required
                      value={appleForm.app_password}
                      onChange={(e) => setAppleForm((f) => ({ ...f, app_password: e.target.value }))}
                      style={inputStyle}
                    />
                    <button type="submit" disabled={appleForm.submitting} style={btnPrimarySmall}>
                      {appleForm.submitting ? 'Connecting…' : 'Save & Connect'}
                    </button>
                  </div>
                </form>
              )}

              {/* Calendar list */}
              {group && group.calendars.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={calListHeader}>
                    <span style={{ flex: 2 }}>Calendar</span>
                    <span style={{ flex: 1, textAlign: 'center' }}>Sync</span>
                    <span style={{ flex: 2 }}>Direction</span>
                    <span style={{ flex: 1, color: '#94a3b8', fontSize: 11 }}>Last synced</span>
                  </div>
                  {group.calendars.map((cal) => (
                    <div key={cal.id} style={calRow}>
                      <span style={{ flex: 2, fontSize: 13, color: '#334155' }}>
                        {cal.calendar_name || cal.calendar_id}
                      </span>
                      <span style={{ flex: 1, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(cal.sync_enabled)}
                          onChange={(e) => handleToggleCalendar(cal.id, 'sync_enabled', e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                      </span>
                      <span style={{ flex: 2 }}>
                        <select
                          value={cal.sync_direction}
                          onChange={(e) => handleToggleCalendar(cal.id, 'sync_direction', e.target.value)}
                          style={selectSmall}
                          disabled={!cal.sync_enabled}
                        >
                          {Object.entries(DIRECTION_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </span>
                      <span style={{ flex: 1, fontSize: 11, color: '#94a3b8' }}>
                        {cal.last_synced_at
                          ? new Date(cal.last_synced_at).toLocaleDateString('en-IN')
                          : 'Never'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {group && group.calendars.length === 0 && (
                <div style={{ fontSize: 12, color: '#94a3b8', paddingTop: 4 }}>
                  No calendars found. Try disconnecting and reconnecting to refresh.
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* ── Global Settings ── */}
      <section style={settingsCard}>
        <h3 style={{ ...sectionTitle, marginBottom: 16 }}>Sync Settings</h3>

        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={labelStyle}>Default provider for new appointments</label>
            <select
              value={settings.default_provider || ''}
              onChange={(e) => setSettings((s) => ({ ...s, default_provider: e.target.value }))}
              style={inputStyle}
            >
              <option value="">None (manual sync only)</option>
              <option value="google">Google Calendar</option>
              <option value="outlook">Outlook Calendar</option>
              <option value="apple">Apple Calendar</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Conflict resolution</label>
            <select
              value={settings.conflict_resolution || 'local_wins'}
              onChange={(e) => setSettings((s) => ({ ...s, conflict_resolution: e.target.value }))}
              style={inputStyle}
            >
              <option value="local_wins">Local wins — keep app version on conflict</option>
              <option value="remote_wins">Remote wins — accept external calendar version</option>
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#334155' }}>
            <input
              type="checkbox"
              checked={Boolean(settings.auto_sync_enabled)}
              onChange={(e) => setSettings((s) => ({ ...s, auto_sync_enabled: e.target.checked }))}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <span>
              <strong>Auto-sync</strong> — automatically push new appointments to connected calendars
            </span>
          </label>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingTop: 4 }}>
            <button
              type="button"
              style={btnPrimary}
              onClick={handleSaveSettings}
              disabled={savingSettings}
            >
              {savingSettings ? 'Saving…' : 'Save Settings'}
            </button>
            <button
              type="button"
              style={syncing ? { ...btnSync, opacity: 0.6 } : btnSync}
              onClick={handleSyncNow}
              disabled={syncing}
            >
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sectionTitle = {
  margin: '0 0 6px 0',
  fontSize: 15,
  fontWeight: 700,
  color: '#1e293b',
};

const sectionDesc = {
  margin: '0 0 16px 0',
  fontSize: 13,
  color: '#64748b',
  lineHeight: 1.5,
};

const providerCard = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: '14px 16px',
  marginBottom: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,.04)',
};

const settingsCard = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: '20px 20px 24px',
  boxShadow: '0 1px 3px rgba(0,0,0,.04)',
};

const calListHeader = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 0',
  fontSize: 11,
  fontWeight: 700,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid #f1f5f9',
  marginBottom: 4,
};

const calRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 0',
  borderBottom: '1px solid #f8fafc',
};

const appleFormBox = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '12px 14px',
  marginTop: 8,
};

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#64748b',
  marginBottom: 4,
};

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontSize: 13,
  boxSizing: 'border-box',
};

const selectSmall = {
  padding: '4px 8px',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontSize: 12,
  background: '#fff',
  cursor: 'pointer',
};

const btnPrimary = {
  padding: '8px 18px',
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};

const btnSync = {
  padding: '8px 18px',
  background: '#0f172a',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};

const btnPrimarySmall = {
  padding: '5px 12px',
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const btnOutlineSmall = {
  padding: '5px 12px',
  background: '#fff',
  color: '#2563eb',
  border: '1px solid #2563eb',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const btnDangerSmall = {
  padding: '5px 12px',
  background: '#fff',
  color: '#dc2626',
  border: '1px solid #fca5a5',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

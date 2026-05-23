import { useState, useEffect } from 'react';
import { Bell, Mail, Smartphone, MessageSquare, CheckCircle2, AlertCircle, RefreshCw, Info } from 'lucide-react';
import { API_BASE_URL } from '../../../constants/config';

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const TRIGGER_LABELS = {
  service_log_created:    { label: 'Service Log Created', desc: 'Triggered when a team member posts an activity log visible to client/affiliate.' },
  service_status_changed: { label: 'Service Status Changed', desc: 'Triggered when an engagement status is updated (e.g. In Progress → Completed).' },
  invoice_created:        { label: 'Invoice Created', desc: 'Triggered when a new invoice is raised for a client.' },
};

const CHANNEL_ICONS = { email: Mail, sms: Smartphone, whatsapp: MessageSquare };

export default function TriggerSettings() {
  const [triggers, setTriggers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/settings/triggers`, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok) setTriggers(data.data || []);
      else setError(data.message || 'Failed to load');
    } catch {
      setError('Network error loading triggers.');
    } finally {
      setLoading(false);
    }
  }

  async function saveTrigger(id, updates) {
    setSaving(id);
    setSaved(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/settings/triggers/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (res.ok) {
        setTriggers((prev) => prev.map((t) => t.id === id ? { ...t, ...updates } : t));
        setSaved(id);
        setTimeout(() => setSaved(null), 2000);
      } else {
        setError(data.message || 'Failed to save');
      }
    } catch {
      setError('Network error.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Activity Trigger Settings</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
          Configure automatic email/SMS/WA notifications when team posts service activity
        </p>
      </div>

      {/* Testing Mode Banner */}
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Info size={16} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>Testing Mode Active</div>
          <div style={{ fontSize: 13, color: '#92400e' }}>
            While <strong>Testing Mode</strong> is enabled, all trigger notifications are sent to the test email/mobile address only.
            Real client contact details are <strong>NOT</strong> used. Once fully tested, disable Testing Mode to send to actual clients.
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: 13 }}>Loading triggers…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {triggers.map((trigger) => {
            const meta = TRIGGER_LABELS[trigger.trigger_type] || { label: trigger.trigger_type, desc: '' };
            const ChannelIcon = CHANNEL_ICONS[trigger.channel] || Mail;
            const isSaving = saving === trigger.id;
            const wasSaved = saved === trigger.id;

            return (
              <div key={trigger.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Bell size={14} color="var(--portal-primary)" />
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{meta.label}</span>
                      {wasSaved && <CheckCircle2 size={14} color="#16a34a" />}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{meta.desc}</div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0, marginLeft: 16 }}>
                    <div style={{
                      width: 40, height: 22, borderRadius: 11,
                      background: trigger.enabled ? 'var(--portal-primary)' : '#e2e8f0',
                      position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
                    }} onClick={() => saveTrigger(trigger.id, { enabled: !trigger.enabled })}>
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%', background: '#fff',
                        position: 'absolute', top: 2, left: trigger.enabled ? 20 : 2,
                        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: trigger.enabled ? 'var(--portal-primary)' : '#94a3b8' }}>
                      {trigger.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                </div>

                {trigger.enabled && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                    {/* Channel */}
                    <div>
                      <label style={labelStyle}>Channel</label>
                      <select
                        value={trigger.channel}
                        onChange={(e) => saveTrigger(trigger.id, { channel: e.target.value })}
                        style={inputStyle}
                        disabled={isSaving}
                      >
                        <option value="email">Email</option>
                        <option value="sms">SMS</option>
                        <option value="whatsapp">WhatsApp</option>
                      </select>
                    </div>

                    {/* Testing Mode Toggle */}
                    <div>
                      <label style={labelStyle}>Testing Mode</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
                        <div style={{
                          width: 36, height: 20, borderRadius: 10,
                          background: trigger.testing_mode ? '#fde68a' : '#bbf7d0',
                          position: 'relative', cursor: 'pointer',
                        }} onClick={() => saveTrigger(trigger.id, { testing_mode: !trigger.testing_mode })}>
                          <div style={{
                            width: 16, height: 16, borderRadius: '50%', background: '#fff',
                            position: 'absolute', top: 2, left: trigger.testing_mode ? 18 : 2,
                            transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                          }} />
                        </div>
                        <span style={{ fontSize: 12, color: trigger.testing_mode ? '#d97706' : '#16a34a', fontWeight: 600 }}>
                          {trigger.testing_mode ? 'TEST' : 'LIVE'}
                        </span>
                      </div>
                    </div>

                    {/* Test address */}
                    <div>
                      <label style={labelStyle}>Test Email (used in Testing Mode)</label>
                      <input
                        value={trigger.test_email || 'testing@logicmail.in'}
                        onChange={(e) => setTriggers((prev) => prev.map((t) => t.id === trigger.id ? { ...t, test_email: e.target.value } : t))}
                        onBlur={(e) => saveTrigger(trigger.id, { test_email: e.target.value })}
                        style={inputStyle}
                        disabled={isSaving}
                        placeholder="testing@logicmail.in"
                      />
                    </div>
                  </div>
                )}

                {isSaving && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8', marginTop: 10 }}>
                    <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> Saving…
                  </div>
                )}
              </div>
            );
          })}

          {triggers.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: 13 }}>
              No trigger configurations found. Run database migrations first.
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 24, padding: '14px 18px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>How Triggers Work</div>
        <ul style={{ margin: '0', paddingLeft: 18, fontSize: 12, color: '#166534', lineHeight: 1.8 }}>
          <li>When a team member posts a <strong>client-visible</strong> activity log, the trigger fires automatically.</li>
          <li>In <strong>Testing Mode</strong>: notification goes to <code>testing@logicmail.in</code> (or your custom test address).</li>
          <li>In <strong>Live Mode</strong>: notification goes to the client's registered email/mobile.</li>
          <li>All trigger events are logged in the <strong>Activity Trigger Log</strong> table for audit purposes.</li>
        </ul>
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' };
const inputStyle = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#1e293b', background: '#f8fafc', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' };

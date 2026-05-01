import { useState } from 'react';
import {
  MessageSquare, Send, Paperclip, FileText, X,
  Settings, CheckCircle2, AlertCircle, ExternalLink,
  Users, Clock, BarChart3, Zap,
} from 'lucide-react';
import { API_BASE_URL } from '../../../constants/config';

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const PROVIDERS = [
  { id: 'interakt', name: 'Interakt', logo: '🟢', desc: 'Official WhatsApp Business API partner', docsUrl: 'https://interakt.ai' },
  { id: 'smsgatewayhub', name: 'SMSGatewayHub', logo: '🔵', desc: 'Multi-channel messaging gateway', docsUrl: 'https://smsgatewayhub.com' },
  { id: 'gupshup', name: 'Gupshup', logo: '🟠', desc: 'Enterprise messaging platform', docsUrl: 'https://gupshup.io' },
  { id: 'twilio', name: 'Twilio', logo: '🔴', desc: 'Global communications platform', docsUrl: 'https://twilio.com' },
];

const MOCK_TEMPLATES = [
  { id: 1, name: 'tax_deadline_reminder', status: 'approved', preview: 'Dear {{1}}, your {{2}} filing deadline is on {{3}}. Please contact us to avoid penalties.' },
  { id: 2, name: 'gst_due_date', status: 'approved', preview: 'GST Return for {{1}} is due on {{2}}. Kindly share your documents by {{3}}.' },
  { id: 3, name: 'itr_acknowledgment', status: 'approved', preview: 'Dear {{1}}, your ITR for AY {{2}} has been filed. Acknowledgment No: {{3}}.' },
  { id: 4, name: 'service_completion', status: 'pending', preview: 'Dear {{1}}, your {{2}} service has been completed. Please review and revert.' },
];

export default function WANativeMarketing() {
  const [provider, setProvider] = useState('interakt');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [configured, setConfigured] = useState(false);
  const [activeTab, setActiveTab] = useState('compose');

  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateVars, setTemplateVars] = useState({});
  const [recipients, setRecipients] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  async function saveConfig(e) {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/marketing/wa/native/config`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ provider, api_key: apiKey, api_secret: apiSecret, phone_number_id: phoneNumberId }),
      });
      if (res.ok) setConfigured(true);
    } catch { /* ignore */ }
  }

  async function handleSend() {
    if (!selectedTemplate || !recipients.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/marketing/wa/native/send`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          provider,
          template_name: selectedTemplate.name,
          variables: templateVars,
          recipients: recipients.split('\n').map((r) => r.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      setResult({ success: res.ok, message: data.message || (res.ok ? 'Messages queued successfully.' : 'Send failed.') });
    } catch {
      setResult({ success: false, message: 'Network error. Please try again.' });
    } finally {
      setSending(false);
    }
  }

  const varCount = selectedTemplate ? (selectedTemplate.preview.match(/\{\{\d+\}\}/g) || []).length : 0;

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>WA Native (Business API)</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
          Send pre-approved WhatsApp templates via Official Business API
        </p>
      </div>

      {/* Info Banner */}
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 10 }}>
        <AlertCircle size={16} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 13, color: '#92400e' }}>
          <strong>Important:</strong> WhatsApp Business API requires pre-approved message templates (HSM). You must register with an official Business Solution Provider (BSP) and get your templates approved before sending.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
        {/* Left: Provider config */}
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>API Provider</h3>
          {PROVIDERS.map((p) => (
            <div key={p.id} onClick={() => setProvider(p.id)} style={{
              padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 8,
              border: provider === p.id ? '2px solid #F37920' : '1px solid #e2e8f0',
              background: provider === p.id ? '#FEF0E6' : '#f8fafc',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{p.logo}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{p.desc}</div>
                </div>
              </div>
            </div>
          ))}

          <form onSubmit={saveConfig} style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>API Key</label>
              <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password"
                placeholder="Enter API key" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>API Secret / Token</label>
              <input value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} type="password"
                placeholder="Enter secret" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>WhatsApp Phone Number ID</label>
              <input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="e.g. 91XXXXXXXXXX" style={inputStyle} />
            </div>
            <button type="submit" style={{ ...btnPrimary, width: '100%', justifyContent: 'center' }}>
              <Settings size={13} /> Save Configuration
            </button>
            {configured && (
              <div style={{ marginTop: 8, textAlign: 'center', fontSize: 12, color: '#16a34a' }}>
                <CheckCircle2 size={12} style={{ marginRight: 4 }} /> Configuration saved
              </div>
            )}
          </form>
        </div>

        {/* Right: Compose */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0', alignSelf: 'flex-start' }}>
            {[['compose', 'Compose'], ['templates', 'Templates'], ['logs', 'Delivery Logs']].map(([tab, label]) => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: activeTab === tab ? '#F37920' : '#f8fafc',
                color: activeTab === tab ? '#fff' : '#64748b',
                borderRight: '1px solid #e2e8f0',
              }}>{label}</button>
            ))}
          </div>

          {activeTab === 'compose' && (
            <div style={card}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>Send Template Message</h3>

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Select Template</label>
                <select value={selectedTemplate?.id || ''} onChange={(e) => {
                  const t = MOCK_TEMPLATES.find((x) => x.id === Number(e.target.value));
                  setSelectedTemplate(t || null);
                  setTemplateVars({});
                }} style={inputStyle}>
                  <option value="">-- Choose a template --</option>
                  {MOCK_TEMPLATES.filter((t) => t.status === 'approved').map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {selectedTemplate && (
                <>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Template Preview</div>
                    <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.6 }}>{selectedTemplate.preview}</div>
                  </div>
                  {varCount > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <label style={labelStyle}>Template Variables</label>
                      {Array.from({ length: varCount }, (_, i) => (
                        <input key={i} placeholder={`Variable ${i + 1}`}
                          value={templateVars[i + 1] || ''} onChange={(e) => setTemplateVars((p) => ({ ...p, [i + 1]: e.target.value }))}
                          style={{ ...inputStyle, marginBottom: 6 }} />
                      ))}
                    </div>
                  )}
                </>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Recipients (one mobile per line)</label>
                <textarea value={recipients} onChange={(e) => setRecipients(e.target.value)}
                  placeholder={'91XXXXXXXXXX\n91XXXXXXXXXX\n91XXXXXXXXXX'}
                  rows={5} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace' }} />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  {recipients.split('\n').filter((r) => r.trim()).length} recipient(s) entered
                </div>
              </div>

              {result && (
                <div style={{
                  padding: '10px 14px', borderRadius: 8, marginBottom: 14,
                  background: result.success ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${result.success ? '#bbf7d0' : '#fecaca'}`,
                  color: result.success ? '#16a34a' : '#dc2626', fontSize: 13,
                }}>
                  {result.success ? <CheckCircle2 size={13} style={{ marginRight: 6 }} /> : <AlertCircle size={13} style={{ marginRight: 6 }} />}
                  {result.message}
                </div>
              )}

              <button onClick={handleSend} disabled={sending || !selectedTemplate || !recipients.trim()}
                style={{ ...btnPrimary, width: '100%', justifyContent: 'center', opacity: sending ? 0.7 : 1 }}>
                <Send size={13} /> {sending ? 'Sending…' : 'Send Template Messages'}
              </button>
            </div>
          )}

          {activeTab === 'templates' && (
            <div style={card}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>Message Templates</h3>
              {MOCK_TEMPLATES.map((t) => (
                <div key={t.id} style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{t.name}</div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: t.status === 'approved' ? '#f0fdf4' : '#fffbeb',
                      color: t.status === 'approved' ? '#16a34a' : '#d97706',
                      border: `1px solid ${t.status === 'approved' ? '#bbf7d0' : '#fde68a'}`,
                    }}>{t.status.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{t.preview}</div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'logs' && (
            <div style={card}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>Delivery Logs</h3>
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                <BarChart3 size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
                <div style={{ fontSize: 13 }}>Delivery logs will appear here after messages are sent.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const card = { background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#F37920', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#1e293b', background: '#f8fafc', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' };
const labelStyle = { fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };

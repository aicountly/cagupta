import { useState, useEffect, useRef } from 'react';
import {
  Smartphone, QrCode, RefreshCw, Users, MessageSquare,
  Send, Paperclip, Image, FileText, Clock, CheckCircle2,
  AlertCircle, Wifi, WifiOff, X, ChevronDown, ChevronRight,
  Search, Filter, Play, Pause,
} from 'lucide-react';
import { API_BASE_URL } from '../../../constants/config';

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const SESSION_STATUS = { DISCONNECTED: 'disconnected', CONNECTING: 'connecting', CONNECTED: 'connected' };

export default function WAWebMarketing() {
  const [sessionStatus, setSessionStatus] = useState(SESSION_STATUS.DISCONNECTED);
  const [qrCode, setQrCode] = useState(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedTargets, setSelectedTargets] = useState([]);
  const [activeTab, setActiveTab] = useState('groups');
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sendDelay, setSendDelay] = useState({ min: 15, max: 60 });
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(null);
  const [sendLog, setSendLog] = useState([]);
  const [search, setSearch] = useState('');
  const fileRef = useRef(null);

  // Poll session status
  useEffect(() => {
    checkSession();
    const iv = setInterval(checkSession, 5000);
    return () => clearInterval(iv);
  }, []);

  async function checkSession() {
    try {
      const res = await fetch(`${API_BASE_URL}/marketing/wa/session/status`, { headers: authHeaders() });
      if (res.ok) {
        const json = await res.json();
        const payload = json.data || {};
        setSessionStatus(payload.status || SESSION_STATUS.DISCONNECTED);
        if (payload.status === SESSION_STATUS.CONNECTING && payload.qr) {
          setQrCode(payload.qr);
        }
        if (payload.status === SESSION_STATUS.CONNECTED) {
          setQrCode(null);
          setShowQrModal(false);
          loadContactsAndGroups();
        }
      }
    } catch {
      // silently ignore — bridge may not be running yet
    }
  }

  async function initiateConnection() {
    setShowQrModal(true);
    setSessionStatus(SESSION_STATUS.CONNECTING);
    try {
      await fetch(`${API_BASE_URL}/marketing/wa/session/start`, { method: 'POST', headers: authHeaders() });
    } catch {
      setSessionStatus(SESSION_STATUS.DISCONNECTED);
    }
  }

  async function disconnectSession() {
    try {
      await fetch(`${API_BASE_URL}/marketing/wa/session/stop`, { method: 'POST', headers: authHeaders() });
      setSessionStatus(SESSION_STATUS.DISCONNECTED);
      setContacts([]);
      setGroups([]);
    } catch { /* ignore */ }
  }

  async function loadContactsAndGroups() {
    try {
      const [cRes, gRes] = await Promise.all([
        fetch(`${API_BASE_URL}/marketing/wa/contacts`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/marketing/wa/groups`, { headers: authHeaders() }),
      ]);
      if (cRes.ok) setContacts(await cRes.json().then(d => d.data || []));
      if (gRes.ok) setGroups(await gRes.json().then(d => d.data || []));
    } catch { /* ignore */ }
  }

  function toggleTarget(item) {
    setSelectedTargets((prev) =>
      prev.find((t) => t.id === item.id)
        ? prev.filter((t) => t.id !== item.id)
        : [...prev, item],
    );
  }

  function handleFileAttach(e) {
    const files = Array.from(e.target.files);
    setAttachments((prev) => [...prev, ...files]);
    e.target.value = '';
  }

  async function handleSend() {
    if (!message.trim() && attachments.length === 0) return;
    if (selectedTargets.length === 0) return;
    setIsSending(true);
    setSendProgress({ sent: 0, total: selectedTargets.length, failed: 0 });
    setSendLog([]);

    for (let i = 0; i < selectedTargets.length; i++) {
      const target = selectedTargets[i];
      const delay = Math.floor(Math.random() * (sendDelay.max - sendDelay.min + 1) + sendDelay.min);

      if (i > 0) {
        setSendLog((prev) => [...prev, { type: 'delay', text: `Waiting ${delay}s before next message…` }]);
        await new Promise((r) => setTimeout(r, delay * 1000));
      }

      try {
        const formData = new FormData();
        formData.append('target_id', target.id);
        formData.append('target_type', target.type);
        formData.append('message', message);
        attachments.forEach((f) => formData.append('attachments[]', f));

        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API_BASE_URL}/marketing/wa/send`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        const ok = res.ok;
        setSendProgress((prev) => ({
          ...prev,
          sent: prev.sent + (ok ? 1 : 0),
          failed: prev.failed + (ok ? 0 : 1),
        }));
        setSendLog((prev) => [...prev, {
          type: ok ? 'success' : 'error',
          text: ok ? `✓ Sent to ${target.name}` : `✗ Failed: ${target.name}`,
        }]);
      } catch {
        setSendProgress((prev) => ({ ...prev, failed: prev.failed + 1 }));
        setSendLog((prev) => [...prev, { type: 'error', text: `✗ Error sending to ${target.name}` }]);
      }
    }

    setIsSending(false);
  }

  const displayList = (activeTab === 'groups' ? groups : contacts)
    .filter((item) => item.name?.toLowerCase().includes(search.toLowerCase()));

  const statusColor = sessionStatus === SESSION_STATUS.CONNECTED ? '#22c55e'
    : sessionStatus === SESSION_STATUS.CONNECTING ? '#f59e0b' : '#94a3b8';

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>WA Web Marketing</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Send messages via WhatsApp Web browser session
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
            {sessionStatus === SESSION_STATUS.CONNECTED ? 'Connected' : sessionStatus === SESSION_STATUS.CONNECTING ? 'Scanning QR…' : 'Disconnected'}
          </div>
          {sessionStatus === SESSION_STATUS.CONNECTED ? (
            <button onClick={disconnectSession} style={btnOutline}>
              <WifiOff size={14} /> Disconnect
            </button>
          ) : (
            <button onClick={initiateConnection} style={btnPrimary}>
              <QrCode size={14} /> Connect WhatsApp
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20 }}>
        {/* Left: Contact/Group picker */}
        <div style={card}>
          <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
            {['groups', 'contacts'].map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: activeTab === tab ? '#F37920' : '#f8fafc',
                color: activeTab === tab ? '#fff' : '#64748b',
              }}>
                {tab === 'groups' ? 'Groups' : 'Contacts'}
              </button>
            ))}
          </div>

          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${activeTab}…`}
              style={{ ...inputStyle, paddingLeft: 32 }}
            />
          </div>

          {sessionStatus !== SESSION_STATUS.CONNECTED ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8' }}>
              <QrCode size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
              <div style={{ fontSize: 13 }}>Connect WhatsApp to load groups & contacts</div>
            </div>
          ) : displayList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: 13 }}>
              No {activeTab} found
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {displayList.map((item) => {
                const selected = selectedTargets.some((t) => t.id === item.id);
                return (
                  <div key={item.id} onClick={() => toggleTarget(item)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                    background: selected ? '#FEF0E6' : 'transparent',
                    border: selected ? '1px solid #F37920' : '1px solid transparent',
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', background: selected ? '#F37920' : '#e2e8f0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                      color: selected ? '#fff' : '#64748b', flexShrink: 0,
                    }}>
                      {item.name?.charAt(0) || '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                      {item.membersCount && <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.membersCount} members</div>}
                    </div>
                    {selected && <CheckCircle2 size={14} color="#F37920" />}
                  </div>
                );
              })}
            </div>
          )}

          {selectedTargets.length > 0 && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                {selectedTargets.length} target{selectedTargets.length > 1 ? 's' : ''} selected
              </div>
              <button onClick={() => setSelectedTargets([])} style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2 }}>
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Right: Composer + Send */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Message Composer */}
          <div style={card}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 12px' }}>
              Message Composer
            </h3>
            <textarea
              value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your WhatsApp message here… (supports *bold*, _italic_, ~strikethrough~)"
              rows={6}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => fileRef.current?.click()} style={btnOutline}>
                <Paperclip size={13} /> Attach File
              </button>
              <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileAttach}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls" />
            </div>
            {attachments.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {attachments.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f1f5f9', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}>
                    <FileText size={12} color="#64748b" />
                    <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Send Settings */}
          <div style={card}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 12px' }}>
              Send Settings
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Min delay (seconds)</label>
                <input type="number" value={sendDelay.min} min={5} max={300}
                  onChange={(e) => setSendDelay((p) => ({ ...p, min: Number(e.target.value) }))}
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Max delay (seconds)</label>
                <input type="number" value={sendDelay.max} min={10} max={600}
                  onChange={(e) => setSendDelay((p) => ({ ...p, max: Number(e.target.value) }))}
                  style={inputStyle} />
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
              A random delay between {sendDelay.min}–{sendDelay.max}s will be applied between each message to avoid spam detection.
            </div>

            <button
              onClick={handleSend}
              disabled={isSending || selectedTargets.length === 0 || (!message.trim() && attachments.length === 0)}
              style={{
                ...btnPrimary, marginTop: 16, width: '100%', justifyContent: 'center',
                opacity: (isSending || selectedTargets.length === 0) ? 0.6 : 1,
              }}
            >
              {isSending ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sending…</> : <><Send size={14} /> Send to {selectedTargets.length} target{selectedTargets.length !== 1 ? 's' : ''}</>}
            </button>
          </div>

          {/* Send Progress */}
          {sendProgress && (
            <div style={card}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 12px' }}>
                Send Progress
              </h3>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>{sendProgress.sent}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Sent</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>{sendProgress.failed}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Failed</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#94a3b8' }}>{sendProgress.total - sendProgress.sent - sendProgress.failed}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Remaining</div>
                </div>
              </div>
              <div style={{ background: '#e2e8f0', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.round(((sendProgress.sent + sendProgress.failed) / sendProgress.total) * 100)}%`,
                  height: '100%', background: '#F37920', transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ maxHeight: 160, overflowY: 'auto', marginTop: 12 }}>
                {sendLog.map((log, i) => (
                  <div key={i} style={{
                    fontSize: 12, padding: '3px 0',
                    color: log.type === 'success' ? '#16a34a' : log.type === 'error' ? '#dc2626' : '#94a3b8',
                  }}>{log.text}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* QR Code Modal */}
      {showQrModal && (
        <div style={modalOverlay}>
          <div style={{ ...modalCard, maxWidth: 380, textAlign: 'center' }}>
            <button onClick={() => setShowQrModal(false)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
              <X size={18} />
            </button>
            <QrCode size={32} color="#F37920" style={{ marginBottom: 12 }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>Scan with WhatsApp</h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
              Open WhatsApp → Menu → Linked Devices → Link a Device
            </p>
            {qrCode ? (
              <img src={qrCode} alt="WhatsApp QR Code" style={{ width: 200, height: 200, borderRadius: 12, border: '4px solid #F37920' }} />
            ) : (
              <div style={{ width: 200, height: 200, borderRadius: 12, border: '2px dashed #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                <RefreshCw size={24} color="#94a3b8" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            )}
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 16 }}>QR code refreshes every 20 seconds</p>
          </div>
        </div>
      )}
    </div>
  );
}

const card = {
  background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
  padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: '#F37920', color: '#fff', border: 'none',
  borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const btnOutline = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: '#fff', color: '#334155', border: '1px solid #e2e8f0',
  borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
const inputStyle = {
  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 13, color: '#1e293b', background: '#f8fafc',
  boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none',
};
const labelStyle = { fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };
const modalOverlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modalCard = {
  background: '#fff', borderRadius: 16, padding: '28px', position: 'relative',
  boxShadow: '0 20px 60px rgba(0,0,0,0.15)', width: '90%',
};

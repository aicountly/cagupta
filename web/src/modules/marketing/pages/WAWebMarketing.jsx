import { useState, useEffect, useRef } from 'react';
import {
  Smartphone, QrCode, RefreshCw, Users, MessageSquare,
  Send, Paperclip, Image, FileText, Clock, CheckCircle2,
  AlertCircle, Wifi, WifiOff, X, ChevronDown, ChevronRight,
  Search, Filter, Play, Pause, Radio, Plus, Trash2,
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
  const [channels, setChannels] = useState([]);
  const [selectedTargets, setSelectedTargets] = useState([]);
  const [activeTab, setActiveTab] = useState('groups');
  const [addChannelModal, setAddChannelModal] = useState(false);
  const [channelInput, setChannelInput] = useState({ jid: '', name: '' });
  const [addingChannel, setAddingChannel] = useState(false);
  const [addChannelError, setAddChannelError] = useState('');
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sendDelay, setSendDelay] = useState({ min: 15, max: 60 });
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(null);
  const [sendLog, setSendLog] = useState([]);
  const [search, setSearch] = useState('');
  const [refreshStatus, setRefreshStatus] = useState(null); // null | { type: 'loading'|'success'|'error', message: string }
  const fileRef = useRef(null);
  const wasConnectedRef = useRef(false);
  const refreshTimerRef = useRef(null);
  const syncRetryRef = useRef(0);

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
          // Only reload when first transitioning to connected, not on every poll
          if (!wasConnectedRef.current) {
            wasConnectedRef.current = true;
            loadContactsAndGroups();
          }
        } else {
          wasConnectedRef.current = false;
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
      setChannels([]);
    } catch { /* ignore */ }
  }

  async function loadContactsAndGroups(isRetry = false) {
    if (!isRetry) syncRetryRef.current = 0;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setRefreshStatus({ type: 'loading', message: 'Syncing contacts, groups & channels…' });
    try {
      const [cRes, gRes, chRes] = await Promise.all([
        fetch(`${API_BASE_URL}/marketing/wa/contacts`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/marketing/wa/groups`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/marketing/wa/channels`, { headers: authHeaders() }),
      ]);
      let contactCount = 0, groupCount = 0, channelCount = 0;
      if (cRes.ok) {
        const d = await cRes.json();
        const arr = d.data || [];
        setContacts(arr);
        contactCount = arr.length;
      }
      if (gRes.ok) {
        const d = await gRes.json();
        const arr = d.data || [];
        setGroups(arr);
        groupCount = arr.length;
      }
      if (chRes.ok) {
        const d = await chRes.json();
        const arr = d.data || [];
        setChannels(arr);
        channelCount = arr.length;
      }
      // Auto-retry up to 3 times when contacts come back empty — the bridge may still
      // be processing the initial contacts.set batch that WhatsApp sends after connect.
      if (contactCount === 0 && syncRetryRef.current < 3) {
        syncRetryRef.current += 1;
        const delay = syncRetryRef.current * 5000;
        setRefreshStatus({
          type: 'loading',
          message: `Contacts still loading… retrying in ${delay / 1000}s (${syncRetryRef.current}/3)`,
        });
        refreshTimerRef.current = setTimeout(() => loadContactsAndGroups(true), delay);
        return;
      }
      const anyFailed = !cRes.ok || !gRes.ok || !chRes.ok;
      if (anyFailed) {
        setRefreshStatus({ type: 'error', message: 'Some data failed to load. Try again.' });
      } else {
        setRefreshStatus({ type: 'success', message: `Synced — ${groupCount} group${groupCount !== 1 ? 's' : ''}, ${contactCount} contact${contactCount !== 1 ? 's' : ''}, ${channelCount} channel${channelCount !== 1 ? 's' : ''}` });
      }
    } catch {
      setRefreshStatus({ type: 'error', message: 'Sync failed. Check your connection.' });
    }
    refreshTimerRef.current = setTimeout(() => setRefreshStatus(null), 4000);
  }

  async function handleAddChannel() {
    const jid = channelInput.jid.trim();
    if (!jid) return;
    setAddingChannel(true);
    setAddChannelError('');
    try {
      const token = localStorage.getItem('auth_token');
      const isInvite = jid.includes('whatsapp.com/channel/') || (!jid.includes('@') && jid.length > 10);
      const body = isInvite
        ? { invite_code: jid, name: channelInput.name || '' }
        : { jid, name: channelInput.name || '' };
      const res = await fetch(`${API_BASE_URL}/marketing/wa/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        const channel = data.data || data;
        setChannels((prev) => prev.some((c) => c.id === channel.id) ? prev : [...prev, channel]);
        setAddChannelModal(false);
        setChannelInput({ jid: '', name: '' });
        setActiveTab('channels');
      } else {
        setAddChannelError(data.message || 'Failed to add channel');
      }
    } catch {
      setAddChannelError('Network error. Is WhatsApp connected?');
    } finally {
      setAddingChannel(false);
    }
  }

  async function handleRemoveChannel(channelId) {
    if (!window.confirm('Remove this channel from the list?')) return;
    try {
      const token = localStorage.getItem('auth_token');
      await fetch(`${API_BASE_URL}/marketing/wa/channels/${encodeURIComponent(channelId)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
      setSelectedTargets((prev) => prev.filter((t) => t.id !== channelId));
    } catch { /* ignore */ }
  }

  function sameId(a, b) {
    return a != null && b != null && String(a).trim() === String(b).trim();
  }

  function toggleTarget(item) {
    setSelectedTargets((prev) =>
      prev.find((t) => sameId(t.id, item.id))
        ? prev.filter((t) => !sameId(t.id, item.id))
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

  const displayList = (activeTab === 'groups' ? groups : activeTab === 'channels' ? channels : contacts)
    .filter((item) => String(item.name || item.id || '').toLowerCase().includes(search.toLowerCase()));

  const allFilteredSelected =
    displayList.length > 0 && displayList.every((item) => selectedTargets.some((t) => sameId(t.id, item.id)));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      // Deselect only the filtered items, keep any others that were selected outside this filter
      const filteredIds = new Set(displayList.map((item) => String(item.id).trim()));
      setSelectedTargets((prev) => prev.filter((t) => !filteredIds.has(String(t.id).trim())));
    } else {
      // Add all filtered items that aren't already selected
      setSelectedTargets((prev) => {
        const existing = new Set(prev.map((t) => String(t.id).trim()));
        const toAdd = displayList.filter((item) => !existing.has(String(item.id).trim()));
        return [...prev, ...toAdd];
      });
    }
  }

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ flex: 1, display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              {[
                { key: 'groups', label: 'Groups' },
                { key: 'contacts', label: 'Contacts' },
                { key: 'channels', label: 'Channels' },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => { setActiveTab(key); setSearch(''); }} style={{
                  flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: activeTab === key ? '#F37920' : '#f8fafc',
                  color: activeTab === key ? '#fff' : '#64748b',
                }}>
                  {label}
                </button>
              ))}
            </div>
            {sessionStatus === SESSION_STATUS.CONNECTED && (
              <div style={{ display: 'flex', gap: 6 }}>
                {activeTab === 'channels' && (
                  <button
                    onClick={() => { setAddChannelModal(true); setAddChannelError(''); setChannelInput({ jid: '', name: '' }); }}
                    title="Add a WhatsApp Channel"
                    style={{ ...btnOutline, padding: '7px 10px', flexShrink: 0 }}
                  >
                    <Plus size={13} />
                  </button>
                )}
                <button
                  onClick={loadContactsAndGroups}
                  disabled={refreshStatus?.type === 'loading'}
                  title="Refresh contacts, groups & channels"
                  style={{
                    ...btnOutline, padding: '7px 10px', flexShrink: 0,
                    opacity: refreshStatus?.type === 'loading' ? 0.6 : 1,
                  }}
                >
                  <RefreshCw
                    size={13}
                    style={refreshStatus?.type === 'loading' ? { animation: 'spin 1s linear infinite' } : undefined}
                  />
                </button>
              </div>
            )}
          </div>

          {refreshStatus && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 10px', marginBottom: 10, borderRadius: 7, fontSize: 12,
              background: refreshStatus.type === 'success' ? '#f0fdf4'
                : refreshStatus.type === 'error' ? '#fef2f2' : '#f8fafc',
              border: `1px solid ${refreshStatus.type === 'success' ? '#bbf7d0'
                : refreshStatus.type === 'error' ? '#fecaca' : '#e2e8f0'}`,
              color: refreshStatus.type === 'success' ? '#16a34a'
                : refreshStatus.type === 'error' ? '#dc2626' : '#64748b',
            }}>
              {refreshStatus.type === 'loading' && (
                <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
              )}
              {refreshStatus.type === 'success' && <CheckCircle2 size={12} style={{ flexShrink: 0 }} />}
              {refreshStatus.type === 'error' && <AlertCircle size={12} style={{ flexShrink: 0 }} />}
              <span>{refreshStatus.message}</span>
            </div>
          )}

          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${activeTab}…`}
              style={{ ...inputStyle, paddingLeft: 32 }}
            />
          </div>

          {sessionStatus === SESSION_STATUS.CONNECTED && displayList.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                {displayList.length} {activeTab}{displayList.length !== 1 ? '' : ''} {search ? 'matched' : 'total'}
              </span>
              <button
                onClick={toggleSelectAll}
                style={{
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', padding: '2px 0',
                  color: allFilteredSelected ? '#ef4444' : '#F37920',
                  textDecoration: 'underline', textUnderlineOffset: 2,
                }}
              >
                {allFilteredSelected ? `Deselect all (${displayList.length})` : `Select all (${displayList.length})`}
              </button>
            </div>
          )}

          {sessionStatus !== SESSION_STATUS.CONNECTED ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8' }}>
              <QrCode size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
              <div style={{ fontSize: 13 }}>Connect WhatsApp to load groups, contacts & channels</div>
            </div>
          ) : displayList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: 13 }}>
              {search
                ? `No ${activeTab} match "${search}"`
                : activeTab === 'channels'
                  ? <span>No channels yet. Click <strong>+</strong> to add your WhatsApp Channel.</span>
                  : `No ${activeTab} found`}
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {displayList.map((item) => {
                const selected = selectedTargets.some((t) => sameId(t.id, item.id));
                const isChannel = item.type === 'newsletter';
                return (
                  <div key={item.id ?? item.name} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    borderRadius: 8, marginBottom: 4, userSelect: 'none',
                    background: selected ? '#FEF0E6' : 'transparent',
                    border: selected ? '1px solid #F37920' : '1px solid transparent',
                    transition: 'background 0.12s, border-color 0.12s',
                  }}>
                    <div onClick={() => toggleTarget(item)} style={{
                      width: 32, height: 32, borderRadius: isChannel ? 8 : '50%',
                      background: selected ? '#F37920' : isChannel ? '#dcfce7' : '#e2e8f0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                      color: selected ? '#fff' : isChannel ? '#16a34a' : '#64748b', flexShrink: 0, cursor: 'pointer',
                    }}>
                      {isChannel ? <Radio size={14} /> : (item.name?.charAt(0) || '?')}
                    </div>
                    <div onClick={() => toggleTarget(item)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                      {item.membersCount && <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.membersCount} members</div>}
                      {isChannel && <div style={{ fontSize: 11, color: '#94a3b8' }}>WhatsApp Channel</div>}
                    </div>
                    {selected && <CheckCircle2 size={14} color="#F37920" />}
                    {isChannel && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveChannel(item.id); }}
                        title="Remove channel"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px 4px', flexShrink: 0 }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
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

      {/* Add Channel Modal */}
      {addChannelModal && (
        <div style={modalOverlay}>
          <div style={{ ...modalCard, maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Radio size={18} color="#16a34a" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Add WhatsApp Channel</h3>
              </div>
              <button onClick={() => setAddChannelModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
              Enter your WhatsApp Channel invite link (e.g. <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>https://whatsapp.com/channel/…</code>)
              or the Channel JID (e.g. <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>123456789@newsletter</code>).
            </p>
            <label style={labelStyle}>Channel Link or JID</label>
            <input
              value={channelInput.jid}
              onChange={(e) => setChannelInput((p) => ({ ...p, jid: e.target.value }))}
              placeholder="https://whatsapp.com/channel/ABC… or 123@newsletter"
              style={{ ...inputStyle, marginBottom: 12 }}
              onKeyDown={(e) => e.key === 'Enter' && handleAddChannel()}
            />
            <label style={labelStyle}>Channel Name (optional)</label>
            <input
              value={channelInput.name}
              onChange={(e) => setChannelInput((p) => ({ ...p, name: e.target.value }))}
              placeholder="My CA Channel"
              style={{ ...inputStyle, marginBottom: 16 }}
              onKeyDown={(e) => e.key === 'Enter' && handleAddChannel()}
            />
            {addChannelError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626', marginBottom: 14 }}>
                <AlertCircle size={13} /> {addChannelError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setAddChannelModal(false)} style={btnOutline} disabled={addingChannel}>Cancel</button>
              <button
                onClick={handleAddChannel}
                disabled={addingChannel || !channelInput.jid.trim()}
                style={{ ...btnPrimary, background: '#16a34a', opacity: (addingChannel || !channelInput.jid.trim()) ? 0.6 : 1 }}
              >
                {addingChannel ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={13} />}
                {addingChannel ? 'Adding…' : 'Add Channel'}
              </button>
            </div>
          </div>
        </div>
      )}

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

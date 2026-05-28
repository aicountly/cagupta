import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MessageSquare, Search, RefreshCw, Send, AlertCircle, Bot, Users, User,
} from 'lucide-react';
import BrowserNotificationPrompt from '../../../components/BrowserNotificationPrompt';
import {
  fetchClientChatThreads, fetchClientChatThread, fetchClientChatMessages,
  sendStaffClientChatMessage, markStaffClientChatRead,
} from '../services/clientChatService';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ClientChatInbox() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialThreadId = Number(searchParams.get('thread') || 0);

  const [filterTab, setFilterTab] = useState('all');
  const [search, setSearch] = useState('');
  const [threads, setThreads] = useState([]);
  const [selectedId, setSelectedId] = useState(initialThreadId || null);
  const [selectedThread, setSelectedThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [actionBusy, setActionBusy] = useState('');
  const threadRef = useRef(null);
  const lastMsgIdRef = useRef(0);

  const loadThreads = useCallback(() => {
    setLoading(true);
    setErr('');
    const filter = filterTab === 'attention' ? 'needs_attention' : '';
    return fetchClientChatThreads({ filter })
      .then(({ rows }) => setThreads(rows))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [filterTab]);

  const loadMessages = useCallback((threadId, { initial = false } = {}) => {
    if (!threadId) return Promise.resolve();
    const afterId = initial ? 0 : lastMsgIdRef.current;
    return fetchClientChatMessages(threadId, { afterId })
      .then(({ rows }) => {
        if (rows.length === 0) return;
        setMessages((prev) => {
          if (initial) return rows;
          const ids = new Set(prev.map((m) => m.id));
          const merged = [...prev];
          rows.forEach((m) => { if (!ids.has(m.id)) merged.push(m); });
          return merged.sort((a, b) => Number(a.id) - Number(b.id));
        });
        const maxId = Math.max(...rows.map((m) => Number(m.id)));
        lastMsgIdRef.current = Math.max(lastMsgIdRef.current, maxId);
        markStaffClientChatRead(threadId, maxId).catch(() => {});
      })
      .catch((e) => setErr(e.message));
  }, []);

  const openThread = useCallback((threadId) => {
    setSelectedId(threadId);
    setSearchParams(threadId ? { thread: String(threadId) } : {}, { replace: true });
    setMessages([]);
    lastMsgIdRef.current = 0;
    fetchClientChatThread(threadId)
      .then((data) => setSelectedThread(data?.conversation || data))
      .catch((e) => setErr(e.message));
    loadMessages(threadId, { initial: true });
  }, [loadMessages, setSearchParams]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  useEffect(() => {
    if (initialThreadId > 0) openThread(initialThreadId);
  }, [initialThreadId, openThread]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const poll = setInterval(() => {
      loadMessages(selectedId);
      loadThreads();
    }, 15000);
    return () => clearInterval(poll);
  }, [selectedId, loadMessages, loadThreads]);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages]);

  async function handleSend() {
    if (!selectedId || !draft.trim()) return;
    setActionBusy('send');
    try {
      const msg = await sendStaffClientChatMessage(selectedId, draft.trim());
      setDraft('');
      setMessages((prev) => [...prev, msg]);
      lastMsgIdRef.current = Math.max(lastMsgIdRef.current, Number(msg.id));
      loadThreads();
    } catch (e) {
      setErr(e.message);
    } finally {
      setActionBusy('');
    }
  }

  const filtered = threads.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (t.client_display_name || t.title || '').toLowerCase().includes(q)
      || (t.last_message_preview || '').toLowerCase().includes(q);
  });

  const clientName = selectedThread?.client_summary?.display_name
    || selectedThread?.client_display_name
    || selectedThread?.title
    || 'Client';

  return (
    <div>
      <BrowserNotificationPrompt />
      <div style={headerCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={iconWrap}><MessageSquare size={20} color="var(--portal-primary)" /></div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0B1F3B' }}>Client Chat</h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>
              Client bot conversations — reply when escalation is needed
            </p>
          </div>
        </div>
        <button type="button" onClick={loadThreads} style={btnOutline}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {err && <div style={errorBanner}><AlertCircle size={14} /> {err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, minHeight: 520 }}>
        <div style={panelCard}>
          <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9' }}>
            {['all', 'attention'].map((tab) => (
              <button key={tab} type="button" onClick={() => setFilterTab(tab)} style={tabBtn(filterTab === tab)}>
                {tab === 'all' ? 'All' : 'Needs attention'}
              </button>
            ))}
          </div>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #F8FAFC', position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 34 }}
            />
          </div>
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            {loading && filtered.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No client threads</div>
            ) : filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => openThread(t.id)}
                style={{
                  ...listItem,
                  background: selectedId === t.id ? '#FFF7ED' : '#fff',
                  borderLeft: selectedId === t.id ? '3px solid var(--portal-primary)' : t.needs_attention ? '3px solid #DC2626' : '3px solid transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <User size={14} color="#64748b" />
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#0B1F3B', flex: 1, textAlign: 'left' }}>
                    {t.client_display_name || t.title || 'Client'}
                  </span>
                  {t.needs_attention && <span style={attentionBadge}>!</span>}
                </div>
                {t.last_message_preview && (
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.last_message_preview}
                  </div>
                )}
                {t.last_message_created_at && (
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, textAlign: 'left' }}>
                    {formatTime(t.last_message_created_at)}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div style={panelCard}>
          {!selectedId ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              <MessageSquare size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
              <div style={{ fontSize: 14 }}>Select a client thread to view and reply</div>
            </div>
          ) : (
            <>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0B1F3B' }}>{clientName}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Client support thread (bot + team)</div>
              </div>
              <div ref={threadRef} style={threadArea}>
                {messages.map((m) => {
                  const kind = m.sender_kind || 'staff';
                  const isClient = kind === 'client';
                  const isBot = kind === 'bot';
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: isClient ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '75%',
                        padding: '10px 14px',
                        borderRadius: isClient ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: isClient ? '#DCFCE7' : isBot ? '#F1F5F9' : '#FFF7ED',
                        color: '#0B1F3B',
                        border: kind === 'staff' ? '1px solid #FDBA74' : 'none',
                      }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {isBot && <Bot size={12} />}
                          {kind === 'staff' && <Users size={12} />}
                          {isClient && <User size={12} />}
                          {m.sender_name || (isBot ? 'CA Assistant' : isClient ? 'Client' : 'CA Team')}
                        </div>
                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body_text}</div>
                        <div style={{ fontSize: 10, marginTop: 6, opacity: 0.7, textAlign: 'right' }}>{formatTime(m.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={composerWrap}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Reply as CA team…"
                  rows={2}
                  style={inputStyle}
                />
                <button type="button" onClick={handleSend} disabled={!draft.trim() || actionBusy === 'send'} style={btnSend}>
                  <Send size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const headerCard = {
  background: '#fff', borderRadius: 14, padding: '18px 22px', marginBottom: 16,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};
const iconWrap = {
  width: 42, height: 42, borderRadius: 10, background: '#FFF7ED',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const panelCard = {
  background: '#fff', borderRadius: 14, overflow: 'hidden',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column',
};
const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E2E8F0',
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
const listItem = {
  width: '100%', padding: '12px 16px', border: 'none', borderBottom: '1px solid #F8FAFC',
  cursor: 'pointer', textAlign: 'left',
};
const attentionBadge = {
  background: '#DC2626', color: '#fff', fontSize: 10, fontWeight: 700,
  borderRadius: 999, padding: '2px 7px',
};
const threadArea = {
  flex: 1, overflowY: 'auto', padding: 18, minHeight: 360, maxHeight: 420,
  display: 'flex', flexDirection: 'column', gap: 10,
};
const composerWrap = {
  padding: '12px 16px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 10,
};
const btnSend = {
  alignSelf: 'flex-end', padding: '10px 14px', borderRadius: 10, border: 'none',
  background: 'var(--portal-primary)', color: '#fff', cursor: 'pointer',
};
const errorBanner = {
  background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8,
  marginBottom: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
};
const btnOutline = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer',
  fontSize: 13, fontWeight: 600, color: '#334155',
};
const tabBtn = (active) => ({
  flex: 1, padding: '10px 8px', border: 'none', background: active ? '#FFF7ED' : '#fff',
  cursor: 'pointer', fontSize: 12, fontWeight: 600, color: active ? 'var(--portal-primary)' : '#64748b',
  borderBottom: active ? '2px solid var(--portal-primary)' : '2px solid transparent',
});

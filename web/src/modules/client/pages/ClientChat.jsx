import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Send, AlertCircle, RefreshCw, Users } from 'lucide-react';
import BrowserNotificationPrompt from '../../../components/BrowserNotificationPrompt';
import ClientLayout from '../components/ClientLayout';
import {
  fetchClientChatThread, sendClientChatMessage, markClientChatRead,
} from '../services/clientChatService';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ClientChat() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const threadRef = useRef(null);
  const lastMsgIdRef = useRef(0);

  const mergeMessages = useCallback((rows, initial = false) => {
    if (!rows?.length) return;
    setMessages((prev) => {
      if (initial) return rows;
      const ids = new Set(prev.map((m) => m.id));
      const merged = [...prev];
      rows.forEach((m) => { if (!ids.has(m.id)) merged.push(m); });
      return merged.sort((a, b) => Number(a.id) - Number(b.id));
    });
    const maxId = Math.max(...rows.map((m) => Number(m.id)));
    lastMsgIdRef.current = Math.max(lastMsgIdRef.current, maxId);
    markClientChatRead(maxId).catch(() => {});
  }, []);

  const loadThread = useCallback((initial = false) => {
    const afterId = initial ? 0 : lastMsgIdRef.current;
    return fetchClientChatThread({ afterId })
      .then(({ messages: rows }) => mergeMessages(rows, initial))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [mergeMessages]);

  useEffect(() => {
    loadThread(true);
  }, [loadThread]);

  useEffect(() => {
    const poll = setInterval(() => loadThread(false), 15000);
    return () => clearInterval(poll);
  }, [loadThread]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setErr('');
    try {
      const data = await sendClientChatMessage(draft.trim());
      setDraft('');
      const newMsgs = [data.client_message, data.bot_message].filter(Boolean);
      mergeMessages(newMsgs);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <ClientLayout title="Chat">
      <BrowserNotificationPrompt />
      <div style={headerCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={iconWrap}><Bot size={20} color="#16a34a" /></div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>CA Assistant</h1>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
              Ask general tax and service questions. Our team can reply in this thread when needed.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => loadThread(false)} style={btnOutline}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {err && <div style={errorBanner}><AlertCircle size={14} /> {err}</div>}

      <div style={panelCard}>
        <div ref={threadRef} style={threadArea}>
          {loading && messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>Loading chat…</div>
          )}
          {messages.map((m) => {
            const kind = m.sender_kind || (m.sender_user_id ? 'staff' : 'bot');
            const mine = kind === 'client';
            const isBot = kind === 'bot';
            const isStaff = kind === 'staff';
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: mine ? '#16a34a' : isStaff ? '#EFF6FF' : '#F1F5F9',
                  color: mine ? '#fff' : '#0f172a',
                  border: isStaff ? '1px solid #BFDBFE' : 'none',
                }}
                >
                  {!mine && (
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isBot && <Bot size={12} />}
                      {isStaff && <Users size={12} />}
                      {m.sender_name || (isBot ? 'CA Assistant' : 'CA Team')}
                    </div>
                  )}
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
            placeholder="Ask your CA assistant…"
            rows={2}
            style={inputStyle}
            disabled={sending}
          />
          <button type="button" onClick={handleSend} disabled={!draft.trim() || sending} style={btnSend}>
            <Send size={16} />
          </button>
        </div>
        <div style={disclaimer}>
          General information only — not formal tax or legal advice. Ask to speak with our team for personalised help.
        </div>
      </div>
    </ClientLayout>
  );
}

const headerCard = {
  background: '#fff', borderRadius: 14, padding: '16px 20px', marginBottom: 16,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};
const iconWrap = {
  width: 40, height: 40, borderRadius: 10, background: '#f0fdf4',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const panelCard = {
  background: '#fff', borderRadius: 14, overflow: 'hidden',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};
const threadArea = {
  minHeight: 420, maxHeight: 520, overflowY: 'auto', padding: 18,
  display: 'flex', flexDirection: 'column', gap: 10, background: '#FAFBFC',
};
const composerWrap = {
  padding: '12px 16px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 10,
};
const inputStyle = {
  flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #E2E8F0',
  fontSize: 13, resize: 'none', boxSizing: 'border-box',
};
const btnSend = {
  alignSelf: 'flex-end', padding: '10px 14px', borderRadius: 10, border: 'none',
  background: '#16a34a', color: '#fff', cursor: 'pointer',
};
const btnOutline = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer',
  fontSize: 13, fontWeight: 600, color: '#334155',
};
const errorBanner = {
  background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8,
  marginBottom: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
};
const disclaimer = {
  padding: '10px 16px', fontSize: 11, color: '#64748b', borderTop: '1px solid #F8FAFC',
  background: '#fff',
};

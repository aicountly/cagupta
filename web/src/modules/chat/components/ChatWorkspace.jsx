import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MessageSquare, Search, RefreshCw, Send, AlertCircle, Hash, User, Plus, LogOut,
} from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { ROLES } from '../../../constants/roles';
import {
  fetchConversations, fetchConversation, fetchMessages, sendMessage,
  markConversationRead, fetchChatContacts, createConversation, leaveChannel,
} from '../services/chatService';
import NewDmModal from './NewDmModal';
import NewChannelModal from './NewChannelModal';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ChatWorkspace({ auditLink = null }) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const role = session?.user?.role || '';
  const isAdmin = role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN;

  const [searchParams, setSearchParams] = useSearchParams();
  const initialConvId = Number(searchParams.get('conversation') || 0);

  const [filterTab, setFilterTab] = useState('all');
  const [search, setSearch] = useState('');
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(initialConvId || null);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [err, setErr] = useState('');
  const [actionBusy, setActionBusy] = useState('');
  const [showDmModal, setShowDmModal] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const threadRef = useRef(null);
  const lastMsgIdRef = useRef(0);

  const loadConversations = useCallback(() => {
    setLoading(true);
    setErr('');
    return fetchConversations()
      .then(setConversations)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const loadMessages = useCallback((convId, { initial = false } = {}) => {
    if (!convId) return Promise.resolve();
    setMsgLoading(initial);
    const afterId = initial ? 0 : lastMsgIdRef.current;
    return fetchMessages(convId, { afterId, limit: 50 })
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
        if (maxId > 0) {
          markConversationRead(convId, maxId).catch(() => {});
          setConversations((prev) => prev.map((c) => (
            c.id === convId ? { ...c, unread_count: 0 } : c
          )));
        }
      })
      .catch((e) => setErr(e.message))
      .finally(() => setMsgLoading(false));
  }, []);

  const openConversation = useCallback((convId) => {
    setSelectedId(convId);
    setSearchParams(convId ? { conversation: String(convId) } : {}, { replace: true });
    setMessages([]);
    lastMsgIdRef.current = 0;
    fetchConversation(convId)
      .then(setSelectedConv)
      .catch((e) => setErr(e.message));
    loadMessages(convId, { initial: true });
  }, [loadMessages, setSearchParams]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (initialConvId > 0) {
      openConversation(initialConvId);
    }
  }, [initialConvId, openConversation]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const poll = setInterval(() => {
      loadMessages(selectedId);
      loadConversations();
    }, 15000);
    return () => clearInterval(poll);
  }, [selectedId, loadMessages, loadConversations]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend() {
    if (!selectedId || !draft.trim()) return;
    setActionBusy('send');
    try {
      const msg = await sendMessage(selectedId, draft.trim());
      setDraft('');
      setMessages((prev) => [...prev, msg]);
      lastMsgIdRef.current = Math.max(lastMsgIdRef.current, Number(msg.id));
      loadConversations();
    } catch (e) {
      setErr(e.message);
    } finally {
      setActionBusy('');
    }
  }

  async function handleNewDm(peerUserId) {
    setActionBusy('dm');
    try {
      const conv = await createConversation({ type: 'dm', peer_user_id: peerUserId });
      setShowDmModal(false);
      await loadConversations();
      openConversation(conv.id);
    } catch (e) {
      setErr(e.message);
    } finally {
      setActionBusy('');
    }
  }

  async function handleNewChannel({ title, memberUserIds }) {
    setActionBusy('channel');
    try {
      const conv = await createConversation({ type: 'channel', title, member_user_ids: memberUserIds });
      setShowChannelModal(false);
      await loadConversations();
      openConversation(conv.id);
    } catch (e) {
      setErr(e.message);
    } finally {
      setActionBusy('');
    }
  }

  async function handleLeave() {
    if (!selectedId || !selectedConv || selectedConv.type !== 'channel') return;
    setActionBusy('leave');
    try {
      await leaveChannel(selectedId);
      setSelectedId(null);
      setSelectedConv(null);
      setMessages([]);
      setSearchParams({}, { replace: true });
      await loadConversations();
    } catch (e) {
      setErr(e.message);
    } finally {
      setActionBusy('');
    }
  }

  function openModals() {
    fetchChatContacts().then(setContacts).catch(() => setContacts([]));
  }

  const filtered = conversations.filter((c) => {
    if (filterTab === 'channels' && c.type !== 'channel') return false;
    if (filterTab === 'dms' && c.type !== 'dm') return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.display_title || c.title || '').toLowerCase().includes(q)
      || (c.last_message_preview || '').toLowerCase().includes(q);
  });

  const displayTitle = selectedConv?.display_title || selectedConv?.title || 'Conversation';

  return (
    <div>
      <div style={headerCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={iconWrap}><MessageSquare size={20} color="#F37920" /></div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0B1F3B' }}>Team Chat</h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>
              Message your team — all conversations are recorded for audit
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {auditLink}
          <button type="button" onClick={() => { openModals(); setShowDmModal(true); }} style={btnOutline}>
            <User size={14} /> New DM
          </button>
          {isAdmin && (
            <button type="button" onClick={() => { openModals(); setShowChannelModal(true); }} style={btnOutline}>
              <Plus size={14} /> New channel
            </button>
          )}
          <button type="button" onClick={loadConversations} style={btnOutline}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {err && <div style={errorBanner}><AlertCircle size={14} /> {err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, minHeight: 520 }}>
        <div style={panelCard}>
          <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9' }}>
            {['all', 'channels', 'dms'].map((tab) => (
              <button key={tab} type="button" onClick={() => setFilterTab(tab)} style={tabBtn(filterTab === tab)}>
                {tab === 'all' ? 'All' : tab === 'channels' ? 'Channels' : 'DMs'}
              </button>
            ))}
          </div>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #F8FAFC', position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 34 }}
            />
          </div>
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            {loading && filtered.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No conversations yet</div>
            ) : filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openConversation(c.id)}
                style={{
                  ...listItem,
                  background: selectedId === c.id ? '#FFF7ED' : '#fff',
                  borderLeft: selectedId === c.id ? '3px solid #F37920' : '3px solid transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {c.type === 'channel' ? <Hash size={14} color="#64748b" /> : <User size={14} color="#64748b" />}
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#0B1F3B', flex: 1, textAlign: 'left' }}>
                    {c.display_title || c.title || 'Chat'}
                  </span>
                  {Number(c.unread_count) > 0 && (
                    <span style={unreadBadge}>{c.unread_count}</span>
                  )}
                </div>
                {c.last_message_preview && (
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.last_message_preview}
                  </div>
                )}
                {c.last_message_created_at && (
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, textAlign: 'left' }}>
                    {formatTime(c.last_message_created_at)}
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
              <div style={{ fontSize: 14 }}>Select a conversation or start a new message</div>
            </div>
          ) : (
            <>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0B1F3B' }}>{displayTitle}</div>
                  {selectedConv?.type === 'channel' && selectedConv?.members && (
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {selectedConv.members.length} member{selectedConv.members.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                {selectedConv?.type === 'channel' && (
                  <button type="button" onClick={handleLeave} disabled={actionBusy === 'leave'} style={btnOutline}>
                    <LogOut size={14} /> Leave
                  </button>
                )}
              </div>
              <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: 18, minHeight: 360, maxHeight: 420, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {msgLoading && messages.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading messages…</div>
                )}
                {messages.map((m) => {
                  const mine = Number(m.sender_user_id) === Number(userId);
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '75%',
                        padding: '10px 14px',
                        borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: mine ? '#F37920' : '#F1F5F9',
                        color: mine ? '#fff' : '#0B1F3B',
                      }}
                      >
                        {!mine && (
                          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, opacity: 0.85 }}>
                            {m.sender_name || 'User'}
                          </div>
                        )}
                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body_text}</div>
                        <div style={{ fontSize: 10, marginTop: 6, opacity: 0.7, textAlign: 'right' }}>{formatTime(m.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: '12px 16px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 10 }}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Type a message… (Enter to send)"
                  rows={2}
                  style={{ ...inputStyle, flex: 1, resize: 'none' }}
                />
                <button type="button" onClick={handleSend} disabled={!draft.trim() || actionBusy === 'send'} style={btnSend}>
                  <Send size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showDmModal && (
        <NewDmModal
          contacts={contacts}
          onClose={() => setShowDmModal(false)}
          onCreate={handleNewDm}
          busy={actionBusy === 'dm'}
        />
      )}
      {showChannelModal && (
        <NewChannelModal
          contacts={contacts}
          onClose={() => setShowChannelModal(false)}
          onCreate={handleNewChannel}
          busy={actionBusy === 'channel'}
        />
      )}
    </div>
  );
}

const pageWrap = { padding: 0 };
void pageWrap;

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
const unreadBadge = {
  background: '#F37920', color: '#fff', fontSize: 10, fontWeight: 700,
  borderRadius: 999, padding: '2px 7px', minWidth: 18, textAlign: 'center',
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
const btnSend = {
  alignSelf: 'flex-end', padding: '10px 14px', borderRadius: 10, border: 'none',
  background: '#F37920', color: '#fff', cursor: 'pointer',
};
const tabBtn = (active) => ({
  flex: 1, padding: '10px 8px', border: 'none', background: active ? '#FFF7ED' : '#fff',
  cursor: 'pointer', fontSize: 12, fontWeight: 600, color: active ? '#F37920' : '#64748b',
  borderBottom: active ? '2px solid #F37920' : '2px solid transparent',
});

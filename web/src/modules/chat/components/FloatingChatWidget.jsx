import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, X } from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { fetchChatUnreadCount } from '../services/chatService';
import ChatWorkspace from './ChatWorkspace';

const TEAM_CHAT_OPEN_EVENT = 'cagupta:team-chat:open';

export default function FloatingChatWidget() {
  const { hasPermission } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [initialConversationId, setInitialConversationId] = useState(0);
  const [selectedConversationId, setSelectedConversationId] = useState(null);

  const fabRef = useRef(null);
  const panelRef = useRef(null);

  const hideOnRoute = location.pathname === '/desk/chat' || location.pathname === '/desk/chat/audit';

  const loadUnread = useCallback(() => {
    fetchChatUnreadCount()
      .then((count) => setUnreadCount(Number(count) || 0))
      .catch(() => setUnreadCount(0));
  }, []);

  useEffect(() => {
    if (!hasPermission('chat.use') || hideOnRoute) return undefined;
    loadUnread();
    const t = setInterval(loadUnread, 30000);
    return () => clearInterval(t);
  }, [hasPermission, hideOnRoute, loadUnread]);

  useEffect(() => {
    if (open) loadUnread();
  }, [open, loadUnread]);

  useEffect(() => {
    const handler = (e) => {
      const conversationId = Number(e.detail?.conversationId || 0);
      if (conversationId > 0) {
        setInitialConversationId(conversationId);
        setSelectedConversationId(conversationId);
      }
      setOpen(true);
    };
    window.addEventListener(TEAM_CHAT_OPEN_EVENT, handler);
    return () => window.removeEventListener(TEAM_CHAT_OPEN_EVENT, handler);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (fabRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      if (e.target.closest('[role="dialog"]')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!hasPermission('chat.use') || hideOnRoute) return null;

  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);
  const fullPageHref = selectedConversationId
    ? `/desk/chat?conversation=${selectedConversationId}`
    : '/desk/chat';

  return (
    <>
      {open && (
        <div
          ref={panelRef}
          style={panelStyle}
          data-floating-chat="panel"
        >
          <div style={panelHeader}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#0B1F3B' }}>Team Chat</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Link to={fullPageHref} style={fullPageLink} onClick={() => setOpen(false)}>
                Open full page
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={iconBtn}
                aria-label="Close chat"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <ChatWorkspace
              variant="floating"
              syncUrl={false}
              pollingEnabled={open}
              initialConversationId={initialConversationId}
              onConversationChange={setSelectedConversationId}
            />
          </div>
        </div>
      )}

      <button
        ref={fabRef}
        type="button"
        id="chat-btn"
        onClick={() => setOpen((v) => !v)}
        title="Open Team Chat"
        style={fabStyle}
        aria-expanded={open}
      >
        <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>Chat</span>
        <span style={onlineDot} aria-hidden />
        <MessageSquare size={20} color="var(--portal-primary)" />
        {unreadCount > 0 && (
          <span style={fabBadge}>{badgeLabel}</span>
        )}
      </button>
    </>
  );
}

export { TEAM_CHAT_OPEN_EVENT };

const fabStyle = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 14px',
  borderRadius: 8,
  border: '1.5px solid #cbd5e1',
  background: '#fff',
  boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
  cursor: 'pointer',
};

const onlineDot = {
  display: 'inline-block',
  width: 10,
  height: 10,
  borderRadius: '50%',
  background: '#22c55e',
  flexShrink: 0,
};

const fabBadge = {
  position: 'absolute',
  top: -6,
  right: -6,
  background: 'var(--portal-primary)',
  color: '#fff',
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 999,
  padding: '2px 6px',
  minWidth: 18,
  textAlign: 'center',
  lineHeight: 1.3,
};

const panelStyle = {
  position: 'fixed',
  bottom: 60,
  right: 12,
  zIndex: 999,
  width: 700,
  maxWidth: 'calc(100vw - 24px)',
  background: '#fff',
  borderRadius: 14,
  border: '1.5px solid var(--portal-primary)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const panelHeader = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  borderBottom: '1px solid #e2e8f0',
};

const fullPageLink = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--portal-primary)',
  textDecoration: 'none',
};

const iconBtn = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 4,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: '#64748b',
};

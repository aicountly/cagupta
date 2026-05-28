import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  dispatchStaffNotificationsRefresh,
  TEAM_CHAT_ACTIVE_CONTEXT_EVENT,
} from '../constants/events';
import { fetchStaffNotifications } from '../services/notificationService';
import { TEAM_CHAT_OPEN_EVENT } from '../modules/chat/components/FloatingChatWidget';
import {
  getBrowserNotificationPermission,
  showBrowserNotification,
  shouldSuppressStaffNotification,
} from '../utils/browserNotifications';

const POLL_MS = 20000;
const CHAT_KINDS = new Set(['chat_message', 'client_chat_escalation']);
const MOCK_MODE = !import.meta.env.VITE_API_BASE_URL;

export function useStaffBrowserNotifications() {
  const { session, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const seededRef = useRef(false);
  const seenIdsRef = useRef(new Set());
  const [floatingContext, setFloatingContext] = useState({ open: false, conversationId: 0 });

  useEffect(() => {
    const handler = (event) => {
      setFloatingContext({
        open: Boolean(event.detail?.open),
        conversationId: Number(event.detail?.conversationId || 0),
      });
    };
    window.addEventListener(TEAM_CHAT_ACTIVE_CONTEXT_EVENT, handler);
    return () => window.removeEventListener(TEAM_CHAT_ACTIVE_CONTEXT_EVENT, handler);
  }, []);

  useEffect(() => {
    seededRef.current = false;
    seenIdsRef.current = new Set();
  }, [session?.token]);

  const processRows = useCallback((rows) => {
    let foundNew = false;
    const chatRows = (Array.isArray(rows) ? rows : [])
      .filter((row) => CHAT_KINDS.has(row.kind) && !row.read_at);

    for (const row of chatRows) {
      const id = Number(row.id);
      if (!id) continue;

      if (!seededRef.current) {
        seenIdsRef.current.add(id);
        continue;
      }

      if (seenIdsRef.current.has(id)) continue;
      seenIdsRef.current.add(id);
      foundNew = true;

      if (getBrowserNotificationPermission() !== 'granted') continue;

      if (shouldSuppressStaffNotification({
        pathname: location.pathname,
        search: location.search,
        kind: row.kind,
        entityId: row.entity_id,
        floatingChatOpen: floatingContext.open,
        floatingChatConversationId: floatingContext.conversationId,
      })) {
        continue;
      }

      showBrowserNotification({
        tag: `staff-notif-${id}`,
        title: row.title || 'New message',
        body: row.body || '',
        onClick: () => {
          if (row.kind === 'chat_message' && row.entity_id) {
            if (window.location.pathname === '/desk/chat') {
              navigate(`/desk/chat?conversation=${row.entity_id}`);
            } else {
              window.dispatchEvent(new CustomEvent(TEAM_CHAT_OPEN_EVENT, {
                detail: { conversationId: row.entity_id },
              }));
            }
            return;
          }
          if (row.kind === 'client_chat_escalation' && row.entity_id) {
            navigate(`/desk/client-chat?thread=${row.entity_id}`);
          }
        },
      });
    }

    if (!seededRef.current) {
      seededRef.current = true;
    }

    return foundNew;
  }, [floatingContext, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (MOCK_MODE || !session?.token || user?.role === 'client') {
      return undefined;
    }

    const poll = () => {
      fetchStaffNotifications(30)
        .then(({ rows }) => {
          if (processRows(rows)) {
            dispatchStaffNotificationsRefresh();
          }
        })
        .catch(() => {});
    };

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [processRows, session?.token, user?.role]);
}

import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { fetchClientChatThread } from '../modules/client/services/clientChatService';
import {
  getBrowserNotificationPermission,
  showBrowserNotification,
  shouldSuppressClientChatNotification,
  truncatePreview,
} from '../utils/browserNotifications';

const POLL_MS = 20000;
const MOCK_MODE = !import.meta.env.VITE_API_BASE_URL;

export function useClientBrowserNotifications() {
  const { session, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const seededRef = useRef(false);
  const lastMsgIdRef = useRef(0);

  useEffect(() => {
    seededRef.current = false;
    lastMsgIdRef.current = 0;
  }, [session?.token]);

  useEffect(() => {
    if (MOCK_MODE || !session?.token || user?.role !== 'client') {
      return undefined;
    }

    const poll = () => {
      const afterId = seededRef.current ? lastMsgIdRef.current : 0;

      fetchClientChatThread({ afterId })
        .then(({ messages }) => {
          const rows = Array.isArray(messages) ? messages : [];

          if (!seededRef.current) {
            if (rows.length > 0) {
              lastMsgIdRef.current = Math.max(...rows.map((row) => Number(row.id)));
            }
            seededRef.current = true;
            return;
          }

          if (rows.length === 0) return;

          for (const message of rows) {
            const id = Number(message.id);
            if (id > 0) {
              lastMsgIdRef.current = Math.max(lastMsgIdRef.current, id);
            }

            if ((message.sender_kind || '') !== 'staff') continue;
            if (getBrowserNotificationPermission() !== 'granted') continue;
            if (shouldSuppressClientChatNotification(location.pathname)) continue;

            showBrowserNotification({
              tag: `client-msg-${id}`,
              title: message.sender_name || 'CA Team',
              body: truncatePreview(message.body_text),
              onClick: () => navigate('/client/chat'),
            });
          }
        })
        .catch(() => {});
    };

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [location.pathname, navigate, session?.token, user?.role]);
}

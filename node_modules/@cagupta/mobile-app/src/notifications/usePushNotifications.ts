import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../auth/AuthContext';
import { useDeepLink } from '../navigation/DeepLinkContext';
import { pushPayloadUrl, registerForPushNotificationsAsync } from './pushNotifications';

/**
 * Scaffold: register for push when authenticated and route notification taps via deep links.
 * Backend token registration is deferred until an API endpoint exists.
 */
export function usePushNotifications() {
  const { isAuthenticated } = useAuth();
  const { handleIncomingUrl } = useDeepLink();

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    registerForPushNotificationsAsync().then(({ expoPushToken, reason }) => {
      if (cancelled) return;
      if (expoPushToken) {
        // Future: POST /api/auth/push-token { token, platform }
        console.warn('[push] Expo push token registered (local scaffold):', expoPushToken);
      } else if (reason) {
        console.warn('[push] Token unavailable:', reason);
      }
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = pushPayloadUrl(response.notification.request.content.data as Record<string, unknown>);
      if (url) handleIncomingUrl(url);
    });

    return () => {
      cancelled = true;
      responseSub.remove();
    };
  }, [isAuthenticated, handleIncomingUrl]);
}

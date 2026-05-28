import { useAuth } from '../auth/AuthContext';
import { useClientBrowserNotifications } from '../hooks/useClientBrowserNotifications';
import { useStaffBrowserNotifications } from '../hooks/useStaffBrowserNotifications';

export default function BrowserNotificationManager() {
  const { isAuthenticated, loading } = useAuth();

  useStaffBrowserNotifications();
  useClientBrowserNotifications();

  if (loading || !isAuthenticated) {
    return null;
  }

  return null;
}

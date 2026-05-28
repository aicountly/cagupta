import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
import {
  parseMobileDeepLink,
  portalKeyForRole,
  type MobileDeepLinkRoute,
  type PortalKey,
} from '@cagupta/shared-constants';
import { useAuth } from '../auth/AuthContext';

interface DeepLinkContextValue {
  loginPortal: PortalKey | null;
  pendingRoute: MobileDeepLinkRoute | null;
  consumePendingRoute: () => MobileDeepLinkRoute | null;
  handleIncomingUrl: (url: string | null | undefined) => void;
}

const DeepLinkContext = createContext<DeepLinkContextValue | null>(null);

export function DeepLinkProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [loginPortal, setLoginPortal] = useState<PortalKey | null>(null);
  const [pendingRoute, setPendingRoute] = useState<MobileDeepLinkRoute | null>(null);

  const handleIncomingUrl = useCallback(
    (url: string | null | undefined) => {
      const link = parseMobileDeepLink(url);
      if (!link) return;

      if (link.type === 'login') {
        if (link.portal) setLoginPortal(link.portal);
        return;
      }

      if (!isAuthenticated) {
        setLoginPortal(link.portal);
        setPendingRoute(link);
        return;
      }

      const userPortal = portalKeyForRole(user?.role);
      if (link.portal === userPortal) {
        setPendingRoute(link);
      } else {
        Alert.alert(
          'Wrong portal',
          'This link is for a different portal. Sign out and open it from the correct app section.',
        );
      }
    },
    [isAuthenticated, user?.role],
  );

  useEffect(() => {
    Linking.getInitialURL().then(handleIncomingUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleIncomingUrl(url));
    return () => sub.remove();
  }, [handleIncomingUrl]);

  const consumePendingRoute = useCallback(() => {
    const next = pendingRoute;
    if (next) setPendingRoute(null);
    return next;
  }, [pendingRoute]);

  const value = useMemo(
    () => ({
      loginPortal,
      pendingRoute,
      consumePendingRoute,
      handleIncomingUrl,
    }),
    [loginPortal, pendingRoute, consumePendingRoute, handleIncomingUrl],
  );

  return <DeepLinkContext.Provider value={value}>{children}</DeepLinkContext.Provider>;
}

export function useDeepLink() {
  const ctx = useContext(DeepLinkContext);
  if (!ctx) throw new Error('useDeepLink must be used within DeepLinkProvider');
  return ctx;
}

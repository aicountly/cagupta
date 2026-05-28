import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { PortalKey } from '@cagupta/shared-constants';
import { useDeepLink } from './DeepLinkContext';

type Nav = {
  navigate: (screen: string, params?: Record<string, unknown>) => void;
};

function navigateCoreRoute(navigation: Nav, path: string) {
  if (path === 'inbox' || path === 'desk/inbox') {
    navigation.navigate('More', { screen: 'Inbox' });
    return;
  }
  if (path === 'profile') {
    navigation.navigate('More', { screen: 'Profile' });
    return;
  }
  if (path === 'services' || path.startsWith('services')) {
    navigation.navigate('Services');
    return;
  }
  if (path === 'clients' || path === 'contacts') {
    navigation.navigate('Clients');
    return;
  }
  if (path === '' || path === 'home' || path === 'dashboard') {
    navigation.navigate('Home');
    return;
  }
  if (path.startsWith('service/')) {
    const id = path.split('/')[1];
    if (id) navigation.navigate('CoreServiceDetail', { id });
    return;
  }
  navigation.navigate('Home');
}

function navigateClientRoute(navigation: Nav, path: string) {
  if (path.startsWith('service/')) {
    const id = path.split('/')[1];
    if (id) navigation.navigate('ClientServiceDetail', { id });
    return;
  }
  if (path === 'chat') {
    navigation.navigate('ClientChat');
    return;
  }
  if (path === 'profile') {
    navigation.navigate('ClientProfile');
    return;
  }
  if (path === 'ledger') {
    navigation.navigate('ClientLedger');
    return;
  }
  if (path === 'completed' || path === 'done') {
    navigation.navigate('ClientCompleted');
    return;
  }
  navigation.navigate('ClientActive');
}

function navigateAssociateRoute(navigation: Nav, path: string) {
  if (path === 'chat') navigation.navigate('AssociateMore', { screen: 'AssociateChat' });
  else if (path === 'profile') navigation.navigate('AssociateMore', { screen: 'AssociateProfile' });
  else if (path === 'rewards') navigation.navigate('AssociateMore', { screen: 'AssociateRewards' });
  else if (path === 'bank') navigation.navigate('AssociateMore', { screen: 'AssociateBank' });
  else if (path === 'invite') navigation.navigate('AssociateMore', { screen: 'AssociateInvite' });
  else if (path === 'services') navigation.navigate('AssociateServices');
  else if (path === 'commissions') navigation.navigate('AssociateCommissions');
  else if (path === 'payouts') navigation.navigate('AssociatePayouts');
  else navigation.navigate('AssociateDashboard');
}

function navigatePartnerRoute(navigation: Nav, path: string) {
  if (path === 'chat') navigation.navigate('PartnerChat');
  else if (path === 'profile') navigation.navigate('PartnerProfile');
  else if (path === 'assignments' || path === 'tasks') navigation.navigate('PartnerAssignments');
  else if (path === 'payouts') navigation.navigate('PartnerPayouts');
  else if (path === 'bank') navigation.navigate('PartnerBank');
  else navigation.navigate('PartnerDashboard');
}

/** Consume a pending deep link and navigate within the active portal navigator. */
export function usePortalDeepLink(portal: PortalKey) {
  const navigation = useNavigation<Nav>();
  const { pendingRoute, consumePendingRoute } = useDeepLink();

  useEffect(() => {
    if (!pendingRoute || pendingRoute.portal !== portal) return;
    const route = consumePendingRoute();
    if (!route) return;

    switch (portal) {
      case 'staff':
        navigateCoreRoute(navigation, route.path);
        break;
      case 'client':
        navigateClientRoute(navigation, route.path);
        break;
      case 'associate':
        navigateAssociateRoute(navigation, route.path);
        break;
      case 'partner':
        navigatePartnerRoute(navigation, route.path);
        break;
      default:
        break;
    }
  }, [portal, pendingRoute, consumePendingRoute, navigation]);
}

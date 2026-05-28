import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PartnerDashboardScreen from '../portals/partner/screens/PartnerDashboardScreen';
import PartnerAssignmentsScreen from '../portals/partner/screens/PartnerAssignmentsScreen';
import PartnerPayoutsScreen from '../portals/partner/screens/PartnerPayoutsScreen';
import PartnerBankScreen from '../portals/partner/screens/PartnerBankScreen';
import PartnerChatScreen from '../portals/partner/screens/PartnerChatScreen';
import PartnerProfileScreen from '../portals/partner/screens/PartnerProfileScreen';
import { ProtectedScreen } from '../components/ProtectedScreen';
import { Pressable, Text } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { usePortalDeepLink } from './usePortalDeepLink';

export type PartnerStackParamList = {
  PartnerTabs: undefined;
};

export type PartnerTabParamList = {
  PartnerDashboard: undefined;
  PartnerAssignments: undefined;
  PartnerPayouts: undefined;
  PartnerBank: undefined;
  PartnerChat: undefined;
  PartnerProfile: undefined;
};

const Stack = createNativeStackNavigator<PartnerStackParamList>();
const Tab = createBottomTabNavigator<PartnerTabParamList>();

const PARTNER_ACCENT = '#ea580c';

function SignOutButton() {
  const { logout } = useAuth();
  return (
    <Pressable onPress={() => logout()} style={{ marginRight: 12 }}>
      <Text style={{ color: PARTNER_ACCENT, fontWeight: '600' }}>Sign out</Text>
    </Pressable>
  );
}

function PartnerTabs() {
  usePortalDeepLink('partner');
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: PARTNER_ACCENT,
        headerShown: true,
        headerRight: () => <SignOutButton />,
      }}
    >
      <Tab.Screen
        name="PartnerDashboard"
        component={PartnerDashboardScreen}
        options={{ title: 'Dashboard', tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="PartnerAssignments"
        component={PartnerAssignmentsScreen}
        options={{ title: 'My assignments', tabBarLabel: 'Tasks' }}
      />
      <Tab.Screen
        name="PartnerPayouts"
        component={PartnerPayoutsScreen}
        options={{ title: 'Payouts', tabBarLabel: 'Payouts' }}
      />
      <Tab.Screen
        name="PartnerBank"
        component={PartnerBankScreen}
        options={{ title: 'Bank / KYC', tabBarLabel: 'Bank' }}
      />
      <Tab.Screen
        name="PartnerChat"
        component={PartnerChatScreen}
        options={{ title: 'Team chat', tabBarLabel: 'Chat' }}
      />
      <Tab.Screen
        name="PartnerProfile"
        component={PartnerProfileScreen}
        options={{ title: 'My profile', tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

export default function PartnerNavigator() {
  return (
    <ProtectedScreen mode="partnerOnly">
      <Stack.Navigator>
        <Stack.Screen
          name="PartnerTabs"
          component={PartnerTabs}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </ProtectedScreen>
  );
}

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ClientActiveServicesScreen from '../portals/client/screens/ClientActiveServicesScreen';
import ClientCompletedServicesScreen from '../portals/client/screens/ClientCompletedServicesScreen';
import ClientLedgerScreen from '../portals/client/screens/ClientLedgerScreen';
import ClientChatScreen from '../portals/client/screens/ClientChatScreen';
import ClientProfileScreen from '../portals/client/screens/ClientProfileScreen';
import ClientServiceDetailScreen from '../portals/client/screens/ClientServiceDetailScreen';
import { ProtectedScreen } from '../components/ProtectedScreen';
import { Pressable, Text } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { usePortalDeepLink } from './usePortalDeepLink';

export type ClientStackParamList = {
  ClientTabs: undefined;
  ClientServiceDetail: { id: string };
};

export type ClientTabParamList = {
  ClientActive: undefined;
  ClientCompleted: undefined;
  ClientLedger: undefined;
  ClientChat: undefined;
  ClientProfile: undefined;
};

export type ClientTabNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<ClientTabParamList>,
  NativeStackNavigationProp<ClientStackParamList>
>;

const Stack = createNativeStackNavigator<ClientStackParamList>();
const Tab = createBottomTabNavigator<ClientTabParamList>();

function SignOutButton() {
  const { logout } = useAuth();
  return (
    <Pressable onPress={() => logout()} style={{ marginRight: 12 }}>
      <Text style={{ color: '#15803d', fontWeight: '600' }}>Sign out</Text>
    </Pressable>
  );
}

function ClientTabs() {
  usePortalDeepLink('client');
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#15803d',
        headerShown: true,
        headerRight: () => <SignOutButton />,
      }}
    >
      <Tab.Screen
        name="ClientActive"
        component={ClientActiveServicesScreen}
        options={{ title: 'Active services', tabBarLabel: 'Active' }}
      />
      <Tab.Screen
        name="ClientCompleted"
        component={ClientCompletedServicesScreen}
        options={{ title: 'Completed services', tabBarLabel: 'Done' }}
      />
      <Tab.Screen
        name="ClientLedger"
        component={ClientLedgerScreen}
        options={{ title: 'Ledger', tabBarLabel: 'Ledger' }}
      />
      <Tab.Screen
        name="ClientChat"
        component={ClientChatScreen}
        options={{ title: 'Chat', tabBarLabel: 'Chat' }}
      />
      <Tab.Screen
        name="ClientProfile"
        component={ClientProfileScreen}
        options={{ title: 'Profile', tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

export default function ClientNavigator() {
  return (
    <ProtectedScreen mode="clientOnly">
      <Stack.Navigator>
        <Stack.Screen
          name="ClientTabs"
          component={ClientTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ClientServiceDetail"
          component={ClientServiceDetailScreen}
          options={{ title: 'Service details' }}
        />
      </Stack.Navigator>
    </ProtectedScreen>
  );
}

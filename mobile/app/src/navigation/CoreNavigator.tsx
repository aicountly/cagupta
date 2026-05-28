import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DashboardScreen from '../portals/core/screens/DashboardScreen';
import ContactsScreen from '../portals/core/screens/ContactsScreen';
import ServicesScreen from '../portals/core/screens/ServicesScreen';
import CoreServiceDetailScreen from '../portals/core/screens/CoreServiceDetailScreen';
import MoreScreen from '../portals/core/screens/MoreScreen';
import CoreProfileScreen from '../portals/core/screens/CoreProfileScreen';
import CoreInboxScreen from '../portals/core/screens/CoreInboxScreen';
import { ProtectedScreen } from '../components/ProtectedScreen';
import { Pressable, Text } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { usePortalDeepLink } from './usePortalDeepLink';

export type CoreStackParamList = {
  CoreTabs: undefined;
  CoreServiceDetail: { id: string };
};

export type CoreMoreStackParamList = {
  MoreHome: undefined;
  Profile: undefined;
  Inbox: undefined;
};

export type CoreTabParamList = {
  Home: undefined;
  Clients: undefined;
  Services: undefined;
  More: undefined;
};

const Stack = createNativeStackNavigator<CoreStackParamList>();
const MoreStack = createNativeStackNavigator<CoreMoreStackParamList>();
const Tab = createBottomTabNavigator<CoreTabParamList>();

const CORE_ACCENT = '#2563eb';

function SignOutButton() {
  const { logout } = useAuth();
  return (
    <Pressable onPress={() => logout()} style={{ marginRight: 12 }}>
      <Text style={{ color: CORE_ACCENT, fontWeight: '600' }}>Sign out</Text>
    </Pressable>
  );
}

function MoreStackNavigator() {
  return (
    <MoreStack.Navigator>
      <MoreStack.Screen
        name="MoreHome"
        component={MoreScreen}
        options={{ title: 'More', headerRight: () => <SignOutButton /> }}
      />
      <MoreStack.Screen
        name="Profile"
        component={CoreProfileScreen}
        options={{ title: 'My profile' }}
      />
      <MoreStack.Screen
        name="Inbox"
        component={CoreInboxScreen}
        options={{ title: 'Inbox & tickets' }}
      />
    </MoreStack.Navigator>
  );
}

function CoreTabs() {
  usePortalDeepLink('staff');
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: CORE_ACCENT,
        headerShown: true,
        headerRight: () => <SignOutButton />,
      }}
    >
      <Tab.Screen name="Home" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Clients" component={ContactsScreen} options={{ title: 'Contacts' }} />
      <Tab.Screen name="Services" component={ServicesScreen} options={{ title: 'Services' }} />
      <Tab.Screen
        name="More"
        component={MoreStackNavigator}
        options={{ headerShown: false, title: 'More' }}
      />
    </Tab.Navigator>
  );
}

export default function CoreNavigator() {
  return (
    <ProtectedScreen mode="staffOnly">
      <Stack.Navigator>
        <Stack.Screen
          name="CoreTabs"
          component={CoreTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="CoreServiceDetail"
          component={CoreServiceDetailScreen}
          options={{ title: 'Service details' }}
        />
      </Stack.Navigator>
    </ProtectedScreen>
  );
}

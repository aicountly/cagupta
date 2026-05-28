import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AssociateDashboardScreen from '../portals/associate/screens/AssociateDashboardScreen';
import AssociateServicesScreen from '../portals/associate/screens/AssociateServicesScreen';
import AssociateCommissionsScreen from '../portals/associate/screens/AssociateCommissionsScreen';
import AssociatePayoutsScreen from '../portals/associate/screens/AssociatePayoutsScreen';
import AssociateRewardsScreen from '../portals/associate/screens/AssociateRewardsScreen';
import AssociateBankScreen from '../portals/associate/screens/AssociateBankScreen';
import AssociateInviteScreen from '../portals/associate/screens/AssociateInviteScreen';
import AssociateChatScreen from '../portals/associate/screens/AssociateChatScreen';
import AssociateProfileScreen from '../portals/associate/screens/AssociateProfileScreen';
import AssociateMoreScreen from '../portals/associate/screens/AssociateMoreScreen';
import { ProtectedScreen } from '../components/ProtectedScreen';
import { Pressable, Text } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { usePortalDeepLink } from './usePortalDeepLink';

export type AssociateStackParamList = {
  AssociateTabs: undefined;
};

export type AssociateMoreStackParamList = {
  AssociateMoreHome: undefined;
  AssociateRewards: undefined;
  AssociateChat: undefined;
  AssociateBank: undefined;
  AssociateInvite: undefined;
  AssociateProfile: undefined;
};

export type AssociateTabParamList = {
  AssociateDashboard: undefined;
  AssociateServices: undefined;
  AssociateCommissions: undefined;
  AssociatePayouts: undefined;
  AssociateMore: undefined;
};

const Stack = createNativeStackNavigator<AssociateStackParamList>();
const MoreStack = createNativeStackNavigator<AssociateMoreStackParamList>();
const Tab = createBottomTabNavigator<AssociateTabParamList>();

const ASSOCIATE_ACCENT = '#7c3aed';

function SignOutButton() {
  const { logout } = useAuth();
  return (
    <Pressable onPress={() => logout()} style={{ marginRight: 12 }}>
      <Text style={{ color: ASSOCIATE_ACCENT, fontWeight: '600' }}>Sign out</Text>
    </Pressable>
  );
}

function AssociateMoreStackNavigator() {
  return (
    <MoreStack.Navigator>
      <MoreStack.Screen
        name="AssociateMoreHome"
        component={AssociateMoreScreen}
        options={{ title: 'More', headerRight: () => <SignOutButton /> }}
      />
      <MoreStack.Screen name="AssociateRewards" component={AssociateRewardsScreen} options={{ title: 'Rewards' }} />
      <MoreStack.Screen name="AssociateChat" component={AssociateChatScreen} options={{ title: 'Team chat' }} />
      <MoreStack.Screen name="AssociateBank" component={AssociateBankScreen} options={{ title: 'Bank / KYC' }} />
      <MoreStack.Screen name="AssociateInvite" component={AssociateInviteScreen} options={{ title: 'Invite associate' }} />
      <MoreStack.Screen name="AssociateProfile" component={AssociateProfileScreen} options={{ title: 'My profile' }} />
    </MoreStack.Navigator>
  );
}

function AssociateTabs() {
  usePortalDeepLink('associate');
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: ASSOCIATE_ACCENT,
        headerShown: true,
        headerRight: () => <SignOutButton />,
      }}
    >
      <Tab.Screen
        name="AssociateDashboard"
        component={AssociateDashboardScreen}
        options={{ title: 'Dashboard', tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="AssociateServices"
        component={AssociateServicesScreen}
        options={{ title: 'My services', tabBarLabel: 'Services' }}
      />
      <Tab.Screen
        name="AssociateCommissions"
        component={AssociateCommissionsScreen}
        options={{ title: 'Commissions', tabBarLabel: 'Commissions' }}
      />
      <Tab.Screen
        name="AssociatePayouts"
        component={AssociatePayoutsScreen}
        options={{ title: 'Payout requests', tabBarLabel: 'Payouts' }}
      />
      <Tab.Screen
        name="AssociateMore"
        component={AssociateMoreStackNavigator}
        options={{ title: 'More', tabBarLabel: 'More', headerShown: false }}
      />
    </Tab.Navigator>
  );
}

export default function AssociateNavigator() {
  return (
    <ProtectedScreen mode="associateOnly">
      <Stack.Navigator>
        <Stack.Screen
          name="AssociateTabs"
          component={AssociateTabs}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </ProtectedScreen>
  );
}

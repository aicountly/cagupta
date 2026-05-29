import React from 'react';

import { ActivityIndicator, View } from 'react-native';

import { NavigationContainer } from '@react-navigation/native';

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { mobileNavigatorForRole } from '@cagupta/shared-constants';

import { useAuth } from '../auth/AuthContext';

import LoginScreen from '../screens/LoginScreen';

import CoreNavigator from './CoreNavigator';

import AssociateNavigator from './AssociateNavigator';

import PartnerNavigator from './PartnerNavigator';

import ClientNavigator from './ClientNavigator';

import { DeepLinkProvider } from './DeepLinkContext';

import { linking } from './linking';

import { usePushNotifications } from '../notifications/usePushNotifications';



const Stack = createNativeStackNavigator();



function AppPortalNavigator() {

  const { user } = useAuth();

  usePushNotifications();

  const nav = mobileNavigatorForRole(user?.role);



  switch (nav) {

    case 'Associate':

      return <AssociateNavigator />;

    case 'Partner':

      return <PartnerNavigator />;

    case 'Client':

      return <ClientNavigator />;

    default:

      return <CoreNavigator />;

  }

}



function NavigationTree() {

  const { isAuthenticated, loading } = useAuth();



  if (loading) {

    return (

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>

        <ActivityIndicator size="large" color="#2563eb" />

      </View>

    );

  }



  return (

    <NavigationContainer linking={linking}>

      <Stack.Navigator screenOptions={{ headerShown: false }}>

        {isAuthenticated ? (

          <Stack.Screen name="App" component={AppPortalNavigator} />

        ) : (

          <Stack.Screen name="Login" component={LoginScreen} />

        )}

      </Stack.Navigator>

    </NavigationContainer>

  );

}



export default function RootNavigator() {

  return (

    <DeepLinkProvider>

      <NavigationTree />

    </DeepLinkProvider>

  );

}


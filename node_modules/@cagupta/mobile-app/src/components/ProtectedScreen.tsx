import React from 'react';

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';

import { theme } from '../theme/portalTheme';



type GuardMode = 'staffOnly' | 'associateOnly' | 'partnerOnly' | 'clientOnly';



const MODE_MESSAGES: Record<GuardMode, string> = {

  staffOnly: 'This area is for Core (staff) accounts only.',

  associateOnly: 'This area is for Associate accounts only.',

  partnerOnly: 'This area is for Partner accounts only.',

  clientOnly: 'This area is for My CA client accounts only.',

};



interface ProtectedScreenProps {

  children: React.ReactNode;

  mode?: GuardMode;

}



function AccessDenied({ message }: { message: string }) {

  const { logout } = useAuth();

  return (

    <View style={styles.denied}>

      <Text style={styles.deniedTitle}>Wrong portal</Text>

      <Text style={styles.deniedText}>{message}</Text>

      <Pressable onPress={() => logout()} style={styles.deniedBtn}>

        <Text style={styles.deniedBtnText}>Sign out and switch portal</Text>

      </Pressable>

    </View>

  );

}



export function ProtectedScreen({ children, mode }: ProtectedScreenProps) {

  const { user, loading } = useAuth();

  const role = user?.role || '';



  if (loading) {

    return (

      <View style={styles.center}>

        <ActivityIndicator size="large" color="#2563eb" />

      </View>

    );

  }



  if (mode === 'staffOnly' && ['associate', 'partner', 'client'].includes(role)) {

    return <AccessDenied message={MODE_MESSAGES.staffOnly} />;

  }

  if (mode === 'associateOnly' && role !== 'associate') {

    return <AccessDenied message={MODE_MESSAGES.associateOnly} />;

  }

  if (mode === 'partnerOnly' && role !== 'partner') {

    return <AccessDenied message={MODE_MESSAGES.partnerOnly} />;

  }

  if (mode === 'clientOnly' && role !== 'client') {

    return <AccessDenied message={MODE_MESSAGES.clientOnly} />;

  }



  return <>{children}</>;

}



const styles = StyleSheet.create({

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  denied: {

    flex: 1,

    alignItems: 'center',

    justifyContent: 'center',

    padding: 24,

    backgroundColor: theme.bg,

  },

  deniedTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 8 },

  deniedText: { fontSize: 14, color: theme.muted, textAlign: 'center', lineHeight: 20, marginBottom: 20 },

  deniedBtn: {

    paddingHorizontal: 20,

    paddingVertical: 12,

    borderRadius: 8,

    backgroundColor: '#2563eb',

  },

  deniedBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

});


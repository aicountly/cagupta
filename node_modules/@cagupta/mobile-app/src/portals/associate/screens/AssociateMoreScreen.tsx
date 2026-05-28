import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../../auth/AuthContext';
import { theme } from '../../../theme/portalTheme';
import type { AssociateMoreStackParamList } from '../../../navigation/AssociateNavigator';

const ASSOCIATE_ACCENT = '#7c3aed';

type MoreNav = NativeStackNavigationProp<AssociateMoreStackParamList, 'AssociateMoreHome'>;

interface MenuItemProps {
  label: string;
  subtitle?: string;
  onPress: () => void;
}

function MenuItem({ label, subtitle, onPress }: MenuItemProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
      <View style={styles.menuItemText}>
        <Text style={styles.menuLabel}>{label}</Text>
        {subtitle ? <Text style={styles.menuSubtitle}>{subtitle}</Text> : null}
      </View>
      <Text style={styles.menuChevron}>›</Text>
    </Pressable>
  );
}

export default function AssociateMoreScreen() {
  const navigation = useNavigation<MoreNav>();
  const { user } = useAuth();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More</Text>
        {user?.name ? <Text style={styles.headerSub}>{user.name}</Text> : null}
      </View>

      <View style={styles.sectionCard}>
        <MenuItem
          label="Rewards"
          subtitle="Points and redemption"
          onPress={() => navigation.navigate('AssociateRewards')}
        />
        <MenuItem
          label="Team chat"
          subtitle="Messages with the office"
          onPress={() => navigation.navigate('AssociateChat')}
        />
        <MenuItem
          label="Bank / KYC"
          subtitle="Payout account details"
          onPress={() => navigation.navigate('AssociateBank')}
        />
        <MenuItem
          label="Invite associate"
          subtitle="Refer a colleague"
          onPress={() => navigation.navigate('AssociateInvite')}
        />
        <MenuItem
          label="My profile"
          subtitle="Account settings"
          onPress={() => navigation.navigate('AssociateProfile')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: theme.text },
  headerSub: { fontSize: 13, color: ASSOCIATE_ACCENT, fontWeight: '600', marginTop: 4 },
  sectionCard: {
    backgroundColor: theme.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  menuItemPressed: { backgroundColor: '#f8fafc' },
  menuItemText: { flex: 1 },
  menuLabel: { fontSize: 15, fontWeight: '600', color: theme.text },
  menuSubtitle: { fontSize: 12, color: theme.muted, marginTop: 2 },
  menuChevron: { fontSize: 22, color: '#cbd5e1', fontWeight: '300' },
});

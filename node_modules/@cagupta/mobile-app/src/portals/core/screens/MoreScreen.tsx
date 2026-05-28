import React from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ROLE_LABELS } from '@cagupta/shared-constants';
import { useAuth } from '../../../auth/AuthContext';
import { theme } from '../../../theme/portalTheme';
import type { CoreMoreStackParamList } from '../../../navigation/CoreNavigator';

const CORE_ACCENT = '#2563eb';

type MoreNav = NativeStackNavigationProp<CoreMoreStackParamList, 'MoreHome'>;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface MenuItemProps {
  label: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
}

function MenuItem({ label, subtitle, onPress, danger }: MenuItemProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
      <View style={styles.menuItemText}>
        <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
        {subtitle ? <Text style={styles.menuSubtitle}>{subtitle}</Text> : null}
      </View>
      {!danger ? <Text style={styles.menuChevron}>›</Text> : null}
    </Pressable>
  );
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function showWebOnlyAlert(feature: string) {
  Alert.alert(
    'Web portal',
    `${feature} is available on the full web portal. Open the CA Office portal in your browser for full admin features.`,
  );
}

export default function MoreScreen() {
  const navigation = useNavigation<MoreNav>();
  const { user, logout, hasPermission, hasAnyPermission } = useAuth();

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Sign in to view account options.</Text>
      </View>
    );
  }

  const roleLabel = ROLE_LABELS[user.role] || user.role || 'User';
  const initials = user.initials || getInitials(user.name || '?');
  const canInbox = hasPermission('settings.view');
  const canChat = hasPermission('chat.use');
  const canClientChat = hasPermission('client.chat.manage');
  const canManageUsers = hasAnyPermission(['users.manage', 'users.delegate']);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user.name}</Text>
          <Text style={styles.profileRole}>{roleLabel}</Text>
          <Text style={styles.profileEmail}>{user.email}</Text>
        </View>
      </View>

      <MenuSection title="Account">
        <MenuItem
          label="My profile"
          subtitle="Name, avatar, password"
          onPress={() => navigation.navigate('Profile')}
        />
      </MenuSection>

      <MenuSection title="Desk">
        {canInbox ? (
          <MenuItem
            label="Inbox & tickets"
            subtitle="Support tickets and inbound mail"
            onPress={() => navigation.navigate('Inbox')}
          />
        ) : null}
        {canChat ? (
          <MenuItem
            label="Team chat"
            subtitle="Coming soon on mobile"
            onPress={() => showWebOnlyAlert('Team chat')}
          />
        ) : null}
        {canClientChat ? (
          <MenuItem
            label="Client chat"
            subtitle="Coming soon on mobile"
            onPress={() => showWebOnlyAlert('Client chat')}
          />
        ) : null}
        {!canInbox && !canChat && !canClientChat ? (
          <Text style={styles.noAccess}>No desk features available for your role.</Text>
        ) : null}
      </MenuSection>

      <MenuSection title="Administration">
        <MenuItem
          label="Settings"
          subtitle="Firm profile, integrations, service config"
          onPress={() => showWebOnlyAlert('Settings')}
        />
        {canManageUsers ? (
          <MenuItem
            label="User management"
            subtitle="Staff accounts and invitations"
            onPress={() => showWebOnlyAlert('User management')}
          />
        ) : null}
      </MenuSection>

      <Pressable
        onPress={() => logout()}
        style={({ pressed }) => [styles.signOutBtn, pressed && styles.signOutBtnPressed]}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      <Text style={styles.footer}>CA Rahul Gupta Office · Core portal</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { color: theme.muted, textAlign: 'center' },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: theme.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: CORE_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 17, fontWeight: '700', color: theme.text },
  profileRole: { fontSize: 13, color: CORE_ACCENT, fontWeight: '600', marginTop: 2 },
  profileEmail: { fontSize: 12, color: theme.muted, marginTop: 4 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },
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
  menuLabelDanger: { color: theme.danger },
  menuSubtitle: { fontSize: 12, color: theme.muted, marginTop: 2 },
  menuChevron: { fontSize: 22, color: '#cbd5e1', fontWeight: '300' },
  noAccess: { padding: 16, fontSize: 13, color: theme.muted },
  signOutBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    alignItems: 'center',
  },
  signOutBtnPressed: { opacity: 0.85 },
  signOutText: { color: theme.danger, fontSize: 15, fontWeight: '700' },
  footer: { textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 8 },
});

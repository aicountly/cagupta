import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ROLE_LABELS } from '@cagupta/shared-constants';
import { useAuth } from '../../../auth/AuthContext';
import { theme } from '../../../theme/portalTheme';

interface ClientUser {
  name?: string;
  role?: string;
  entity_type?: string;
  id?: number | string;
  email?: string;
}

export default function ClientProfileScreen() {
  const { user } = useAuth();
  const u = user as ClientUser | null;
  const roleLabel = u?.role ? (ROLE_LABELS[u.role] || u.role) : '—';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <ProfileRow label="Name" value={u?.name} />
        <ProfileRow label="Email" value={u?.email} />
        <ProfileRow label="Role" value={roleLabel} />
        <ProfileRow label="Entity type" value={u?.entity_type} />
        <ProfileRow label="Entity id" value={u?.id != null ? String(u.id) : undefined} />
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <Text style={styles.hint}>Portal theme customization is available on the web app.</Text>
      </View>
    </ScrollView>
  );
}

function ProfileRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, gap: 16 },
  card: {
    backgroundColor: theme.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
  },
  row: { marginBottom: 12 },
  label: { fontSize: 12, color: theme.muted, marginBottom: 4 },
  value: { fontSize: 16, color: theme.text, fontWeight: '500' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 8 },
  hint: { fontSize: 13, color: theme.muted, lineHeight: 20 },
});

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { clientPortal } from '../../../adapters/apiClient';
import { theme } from '../../../theme/portalTheme';
import type { ClientStackParamList } from '../../../navigation/ClientNavigator';

interface ServiceDetail {
  service_type?: string;
  status?: string;
  due_date?: string;
  financial_year?: string;
  description?: string;
  notes?: string;
}

export default function ClientServiceDetailScreen() {
  const route = useRoute<RouteProp<ClientStackParamList, 'ClientServiceDetail'>>();
  const { id } = route.params;
  const [row, setRow] = useState<ServiceDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clientPortal
      .getService(id)
      .then((d) => setRow(d as ServiceDetail | null))
      .catch((e: Error) => setError(e.message || 'Failed to load service'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#15803d" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!row) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Service not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <DetailRow label="Service" value={row.service_type} />
        <DetailRow label="Status" value={row.status} />
        <DetailRow label="Due date" value={row.due_date} />
        <DetailRow label="Financial year" value={row.financial_year} />
        <DetailRow label="Details" value={row.description || row.notes} />
      </View>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  card: {
    backgroundColor: theme.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
  },
  row: { marginBottom: 12 },
  label: { fontSize: 12, color: theme.muted, marginBottom: 4 },
  value: { fontSize: 15, color: theme.text, fontWeight: '500' },
  error: { color: theme.danger, padding: 16 },
  empty: { color: theme.muted, padding: 16, textAlign: 'center' },
});

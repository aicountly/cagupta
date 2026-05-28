import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { EngagementRow } from '@cagupta/shared-services';
import { engagementsService } from '../../../adapters/apiClient';
import { theme } from '../../../theme/portalTheme';
import type { CoreStackParamList } from '../../../navigation/CoreNavigator';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  not_started: { bg: '#f3f4f6', color: '#374151' },
  in_progress: { bg: '#dbeafe', color: '#1e40af' },
  pending_info: { bg: '#fef3c7', color: '#92400e' },
  review: { bg: '#ede9fe', color: '#6d28d9' },
  completed: { bg: '#dcfce7', color: '#166534' },
  cancelled: { bg: '#fee2e2', color: '#991b1b' },
};

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtInr(value: number | null): string {
  if (value == null) return '—';
  return Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

export default function CoreServiceDetailScreen() {
  const route = useRoute<RouteProp<CoreStackParamList, 'CoreServiceDetail'>>();
  const { id } = route.params;
  const [row, setRow] = useState<EngagementRow | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    engagementsService
      .getEngagement(id)
      .then(setRow)
      .catch((e: Error) => setError(e.message || 'Failed to load service'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
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
        <Text style={styles.empty}>Service engagement not found.</Text>
      </View>
    );
  }

  const sc = STATUS_COLORS[row.status] || STATUS_COLORS.not_started;
  const serviceLine = [row.type, row.engagementTypeName, row.categoryName].filter(Boolean).join(' · ') || '—';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.client}>{row.clientName}</Text>
        <Text style={styles.service}>#{row.id} · {serviceLine}</Text>
        <View style={[styles.badge, { backgroundColor: sc.bg }]}>
          <Text style={[styles.badgeText, { color: sc.color }]}>{formatStatusLabel(row.status)}</Text>
        </View>
        <DetailRow label="Period" value={row.relevantPeriodLabel || row.financialYear} />
        <DetailRow label="Assigned to" value={row.assignedTo} />
        <DetailRow label="Due date" value={row.dueDate} />
        <DetailRow label="Fee agreed" value={row.feeAgreed != null ? `₹${fmtInr(row.feeAgreed)}` : null} />
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
  client: { fontSize: 18, fontWeight: '700', color: theme.text },
  service: { fontSize: 14, color: '#2563eb', marginTop: 6, marginBottom: 12 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginBottom: 16 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  row: { marginBottom: 12 },
  label: { fontSize: 12, color: theme.muted, marginBottom: 4 },
  value: { fontSize: 15, color: theme.text, fontWeight: '500' },
  error: { color: theme.danger, padding: 16 },
  empty: { color: theme.muted, padding: 16, textAlign: 'center' },
});

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { associatePortal } from '../../../adapters/apiClient';
import { theme } from '../../../theme/portalTheme';

const ASSOCIATE_ACCENT = '#7c3aed';

interface AssociateDashboardData {
  services_total?: number;
  ytd_commission_total?: number | string;
  available_balance?: number | string;
  pending_payouts?: number;
  primary_bank_status?: string;
}

function fmtInr(value: unknown): string {
  return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export default function AssociateDashboardScreen() {
  const [data, setData] = useState<AssociateDashboardData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    associatePortal
      .getDashboard()
      .then((d) => setData(d as AssociateDashboardData))
      .catch((e: Error) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={ASSOCIATE_ACCENT} />
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

  if (!data) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>No dashboard data.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.grid}>
        <StatCard label="Services linked" value={data.services_total ?? 0} />
        <StatCard label="YTD commission (₹)" value={fmtInr(data.ytd_commission_total)} />
        <StatCard label="Available balance (₹)" value={fmtInr(data.available_balance)} />
        <StatCard label="Pending payout requests" value={data.pending_payouts ?? 0} />
        <StatCard label="Primary bank KYC" value={data.primary_bank_status || 'none'} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: theme.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  statLabel: { fontSize: 12, color: theme.muted, marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: '700', color: theme.text },
  error: { color: theme.danger, padding: 16 },
  empty: { color: theme.muted, padding: 16, textAlign: 'center' },
});

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { formatRupeeKpiLakhAbbrev } from '@cagupta/shared-services';
import { dashboardService } from '../../../adapters/apiClient';
import { theme } from '../../../theme/portalTheme';

const CORE_ACCENT = '#2563eb';

interface DashboardStats {
  activeClients?: number | string;
  activeServices?: number | string;
  unbilledServices?: number | string;
  pendingTasks?: number | string;
  totalOutstanding?: number | string;
  documentsThisMonth?: number | string;
  appointmentsToday?: number | string;
}

interface RawEngagement {
  id?: number | string;
  status?: string;
  client_name?: string;
  organization_name?: string;
  tasks?: unknown;
}

interface RawInvoice {
  id?: number | string;
  invoice_number?: string;
  client_name?: string;
  total?: number | string;
  total_amount?: number | string;
  amount_paid?: number | string;
  status?: string;
}

interface RawAppointment {
  id?: number | string;
  client_name?: string;
  title?: string;
  description?: string;
  event_date?: string;
  date?: string;
  start_time?: string;
  event_type?: string;
  mode?: string;
  status?: string;
}

interface PendingTask {
  id?: string | number;
  title?: string;
  clientName?: string;
  dueDate?: string;
  priority?: string;
}

const METRIC_CARDS = [
  { key: 'activeClients', label: 'Active Clients', icon: '👥', tab: 'Clients' as const },
  { key: 'activeServices', label: 'Active Services', icon: '📋', tab: 'Services' as const },
  { key: 'unbilledServices', label: 'Unbilled (due)', icon: '🧾' },
  { key: 'pendingTasks', label: 'Pending Tasks', icon: '✅', tab: 'Services' as const },
  { key: 'outstandingAmount', label: 'Outstanding', icon: '💰' },
  { key: 'documentsThisMonth', label: 'Documents (month)', icon: '📂' },
  { key: 'appointmentsToday', label: 'Appts today', icon: '📅' },
];

type CoreTabParamList = {
  Home: undefined;
  Clients: undefined;
  Services: undefined;
  More: undefined;
};

function parseTasks(raw: unknown): Array<Record<string, unknown>> {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function extractPendingTasks(engagements: RawEngagement[]): PendingTask[] {
  return engagements
    .filter((e) => e.status !== 'completed')
    .flatMap((e) => {
      const clientName = e.client_name || e.organization_name || 'Unknown';
      return parseTasks(e.tasks)
        .filter((t) => t.status !== 'done')
        .map((t) => ({
          id: t.id as string | number | undefined,
          title: String(t.title || 'Task'),
          clientName,
          dueDate: String(t.dueDate || t.due_date || ''),
          priority: String(t.priority || ''),
        }));
    })
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
    .slice(0, 4);
}

function fmtInr(value: unknown): string {
  return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

export default function DashboardScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<CoreTabParamList>>();
  const [stats, setStats] = useState<DashboardStats>({});
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [invoices, setInvoices] = useState<RawInvoice[]>([]);
  const [appointments, setAppointments] = useState<RawAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      dashboardService.getStats().catch(() => ({})),
      dashboardService.getEngagements({ perPage: 100 }).catch(() => []),
      dashboardService.getInvoices({ perPage: 100 }).catch(() => []),
      dashboardService.getAppointments({ perPage: 100 }).catch(() => []),
    ])
      .then(([s, eng, inv, appt]) => {
        setStats(s as DashboardStats);
        setTasks(extractPendingTasks(eng as RawEngagement[]));
        setInvoices(
          (inv as RawInvoice[]).filter((i) =>
            ['sent', 'partially_paid', 'overdue'].includes(String(i.status || '')),
          ),
        );
        setAppointments(
          (appt as RawAppointment[]).filter((a) => a.status !== 'cancelled').slice(0, 5),
        );
      })
      .catch((e: Error) => setError(e.message || 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const metricValues = useMemo(() => {
    const outstandingDisplay = (() => {
      if (loading) return '…';
      const n = stats.totalOutstanding;
      if (typeof n !== 'number') return String(n ?? '—');
      return formatRupeeKpiLakhAbbrev(n).short;
    })();

    return {
      activeClients: loading ? '…' : String(stats.activeClients ?? '—'),
      activeServices: loading ? '…' : String(stats.activeServices ?? '—'),
      unbilledServices: loading ? '…' : String(stats.unbilledServices ?? '0'),
      pendingTasks: loading ? '…' : String(stats.pendingTasks ?? '—'),
      outstandingAmount: outstandingDisplay,
      documentsThisMonth: loading ? '…' : String(stats.documentsThisMonth ?? '—'),
      appointmentsToday: loading ? '…' : String(stats.appointmentsToday ?? '—'),
    };
  }, [loading, stats]);

  function onMetricPress(tab?: keyof CoreTabParamList) {
    if (tab) navigation.navigate(tab);
  }

  if (loading && !stats.activeClients) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={CORE_ACCENT} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.grid}>
        {METRIC_CARDS.map((card) => (
          <Pressable
            key={card.key}
            onPress={() => onMetricPress(card.tab)}
            style={({ pressed }) => [styles.statCard, pressed && card.tab && styles.statCardPressed]}
          >
            <Text style={styles.statIcon}>{card.icon}</Text>
            <Text style={styles.statLabel}>{card.label}</Text>
            <Text style={styles.statValue}>{metricValues[card.key as keyof typeof metricValues]}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pending & overdue tasks</Text>
        {tasks.length === 0 ? (
          <Text style={styles.empty}>No pending tasks.</Text>
        ) : (
          tasks.map((t, i) => (
            <View key={String(t.id ?? i)} style={styles.row}>
              <Text style={styles.rowTitle}>{t.title}</Text>
              <Text style={styles.rowMeta}>
                {t.clientName}
                {t.dueDate ? ` · Due ${t.dueDate}` : ''}
                {t.priority ? ` · ${t.priority}` : ''}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pending invoices</Text>
        {invoices.length === 0 ? (
          <Text style={styles.empty}>No pending invoices.</Text>
        ) : (
          invoices.map((inv) => {
            const total = Number(inv.total ?? inv.total_amount ?? 0);
            const paid = Number(inv.amount_paid ?? 0);
            return (
              <View key={String(inv.id)} style={styles.row}>
                <Text style={styles.rowTitle}>{inv.invoice_number || `Invoice #${inv.id}`}</Text>
                <Text style={styles.rowMeta}>
                  {inv.client_name || 'Unknown'} · ₹{fmtInr(total - paid)} · {inv.status}
                </Text>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Upcoming appointments</Text>
        {appointments.length === 0 ? (
          <Text style={styles.empty}>No upcoming appointments.</Text>
        ) : (
          appointments.map((a) => (
            <View key={String(a.id)} style={styles.row}>
              <Text style={styles.rowTitle}>{a.client_name || a.title || 'Appointment'}</Text>
              <Text style={styles.rowMeta}>
                {a.description || a.title || ''} — {a.event_date || a.date || ''}{' '}
                {a.start_time || ''} ({a.event_type || a.mode || '—'}) · {a.status}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  statCard: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: theme.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  statCardPressed: { opacity: 0.85 },
  statIcon: { fontSize: 22, marginBottom: 6 },
  statLabel: { fontSize: 12, color: theme.muted, marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: '700', color: theme.text },
  section: {
    backgroundColor: theme.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 12 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowTitle: { fontSize: 14, fontWeight: '600', color: theme.text },
  rowMeta: { fontSize: 12, color: theme.muted, marginTop: 4, lineHeight: 18 },
  empty: { color: theme.muted, fontSize: 13 },
  error: { color: theme.danger, marginBottom: 12 },
});

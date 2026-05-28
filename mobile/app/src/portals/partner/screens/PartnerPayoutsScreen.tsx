import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { partnerPortal } from '../../../adapters/apiClient';
import { theme } from '../../../theme/portalTheme';

const PARTNER_ACCENT = '#ea580c';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#fef3c7', color: '#92400e' },
  approved: { bg: '#dbeafe', color: '#1e40af' },
  paid: { bg: '#dcfce7', color: '#166534' },
  rejected: { bg: '#fee2e2', color: '#991b1b' },
};

const TAB_OPTIONS = [
  { value: 'requests', label: 'Requests' },
  { value: 'accruals', label: 'Earnings' },
  { value: 'cycles', label: 'Cycles' },
  { value: 'new', label: 'Request' },
] as const;

type TabKey = (typeof TAB_OPTIONS)[number]['value'];

interface PayoutRequest {
  id: number | string;
  requested_amount?: number | string;
  status?: string;
  created_at?: string;
}

interface AccrualRow {
  id: number | string;
  service_id?: number;
  service_title?: string;
  accrual_date?: string;
  rate_percent?: number | string;
  amount?: number | string;
}

interface CycleRow {
  period_start?: string;
  period_end?: string;
  cycle_anchor?: string;
  disbursal_due_on?: string;
  cycle?: { status?: string };
  partner_summary?: { total?: number | string; line_count?: number };
}

function fmtInr(value: unknown): string {
  return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN');
  } catch {
    return iso;
  }
}

function anchorLabel(a?: string): string {
  if (a === 'd08') return '→ 8th';
  if (a === 'd15') return '→ 15th';
  if (a === 'd23') return '→ 23rd';
  if (a === 'eom') return 'Month-end';
  return a || '—';
}

export default function PartnerPayoutsScreen() {
  const [tab, setTab] = useState<TabKey>('requests');
  const [requests, setRequests] = useState<PayoutRequest[]>([]);
  const [accruals, setAccruals] = useState<AccrualRow[]>([]);
  const [cycleRows, setCycleRows] = useState<CycleRow[]>([]);
  const [cycleYear, setCycleYear] = useState(() => String(new Date().getFullYear()));
  const [cyclesLoading, setCyclesLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadBase = useCallback(() => {
    setError('');
    setLoading(true);
    Promise.all([
      partnerPortal.getPayoutRequests().then((rows) => setRequests(Array.isArray(rows) ? rows : [])),
      partnerPortal.getAccruals().then((rows) => setAccruals(Array.isArray(rows) ? rows : [])),
    ])
      .catch((e: Error) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const loadCycles = useCallback(() => {
    const year = Number(cycleYear) || new Date().getFullYear();
    setCyclesLoading(true);
    partnerPortal
      .getPayoutCycles(year)
      .then((rows) => setCycleRows(Array.isArray(rows) ? rows : []))
      .catch(() => setCycleRows([]))
      .finally(() => setCyclesLoading(false));
  }, [cycleYear]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (tab === 'cycles') loadCycles();
  }, [tab, loadCycles]);

  async function handleSubmit() {
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await partnerPortal.postPayoutRequest({ max_amount: val });
      setAmount('');
      setTab('requests');
      loadBase();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  function renderRequest({ item: r }: { item: PayoutRequest }) {
    const sc = STATUS_COLORS[r.status || 'pending'] || STATUS_COLORS.pending;
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.flex1}>
            <Text style={styles.amount}>₹{fmtInr(r.requested_amount)}</Text>
            <Text style={styles.meta}>{fmtDate(r.created_at)}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.badgeText, { color: sc.color }]}>{r.status}</Text>
          </View>
        </View>
      </View>
    );
  }

  function renderAccrual({ item: a }: { item: AccrualRow }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.flex1}>
            <Text style={styles.title}>{a.service_title || `Service #${a.service_id}`}</Text>
            <Text style={styles.meta}>
              {fmtDate(a.accrual_date)}
              {a.rate_percent ? ` · ${a.rate_percent}%` : ''}
            </Text>
          </View>
          <Text style={styles.amount}>₹{fmtInr(a.amount)}</Text>
        </View>
      </View>
    );
  }

  function renderCycle({ item: r }: { item: CycleRow }) {
    const st = r.cycle?.status ?? '—';
    const ps = r.partner_summary || {};
    return (
      <View style={styles.card}>
        <Text style={styles.title}>
          {r.period_start} → {r.period_end}
        </Text>
        <Text style={styles.meta}>Anchor: {anchorLabel(r.cycle_anchor)}</Text>
        <Text style={styles.meta}>Due: {r.disbursal_due_on || '—'}</Text>
        <View style={styles.cardRow}>
          <Text style={styles.meta}>Cycle: {st}</Text>
          <Text style={styles.amount}>₹{fmtInr(ps.total)}</Text>
        </View>
        <Text style={styles.meta}>Lines: {ps.line_count ?? 0}</Text>
      </View>
    );
  }

  const listEmpty = (msg: string) =>
    !loading ? <Text style={styles.empty}>{msg}</Text> : null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        style={styles.tabsBar}
      >
        {TAB_OPTIONS.map((opt) => {
          const active = tab === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setTab(opt.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {tab === 'new' && (
        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Maximum amount (₹)</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="e.g. 5000"
            placeholderTextColor={theme.muted}
            style={styles.input}
          />
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={[styles.submitBtn, submitting && styles.btnDisabled]}
          >
            <Text style={styles.submitBtnText}>
              {submitting ? 'Submitting…' : 'Submit Payout Request'}
            </Text>
          </Pressable>
        </ScrollView>
      )}

      {tab === 'requests' && (
        loading && requests.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={PARTNER_ACCENT} />
          </View>
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderRequest}
            contentContainerStyle={styles.list}
            ListEmptyComponent={listEmpty('No payout requests yet.')}
          />
        )
      )}

      {tab === 'accruals' && (
        loading && accruals.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={PARTNER_ACCENT} />
          </View>
        ) : (
          <FlatList
            data={accruals}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderAccrual}
            contentContainerStyle={styles.list}
            ListEmptyComponent={listEmpty('No earnings yet.')}
          />
        )
      )}

      {tab === 'cycles' && (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.hint}>
            Office payout calendar (8th, 15th, 23rd, month-end). Amounts show your share for each
            period once a cycle is finalised, or eligible accrued earnings for open periods.
          </Text>
          <View style={styles.yearRow}>
            <Text style={styles.label}>Year</Text>
            <TextInput
              value={cycleYear}
              onChangeText={setCycleYear}
              keyboardType="number-pad"
              style={styles.yearInput}
            />
            <Pressable onPress={loadCycles} style={styles.refreshBtn}>
              <Text style={styles.refreshBtnText}>Refresh</Text>
            </Pressable>
          </View>
          {cyclesLoading ? (
            <ActivityIndicator size="large" color={PARTNER_ACCENT} style={{ marginTop: 24 }} />
          ) : cycleRows.length === 0 ? (
            <Text style={styles.empty}>No periods for this year.</Text>
          ) : (
            cycleRows.map((r) => (
              <View key={`${r.period_start}-${r.period_end}`}>{renderCycle({ item: r })}</View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  tabsBar: { flexGrow: 0, backgroundColor: theme.white, borderBottomWidth: 1, borderBottomColor: theme.border },
  tabs: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.white,
  },
  chipActive: { borderColor: PARTNER_ACCENT, borderWidth: 2, backgroundColor: '#fff7ed' },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.text },
  chipTextActive: { color: PARTNER_ACCENT },
  list: { padding: 16, paddingBottom: 24 },
  formContent: { padding: 16, gap: 12 },
  card: {
    backgroundColor: theme.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 10,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  flex1: { flex: 1 },
  title: { fontSize: 14, fontWeight: '600', color: theme.text },
  amount: { fontSize: 15, fontWeight: '700', color: theme.text },
  meta: { fontSize: 12, color: theme.muted, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: theme.text },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    fontSize: 14,
    backgroundColor: theme.white,
    color: theme.text,
  },
  submitBtn: {
    paddingVertical: 12,
    backgroundColor: PARTNER_ACCENT,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.7 },
  hint: { fontSize: 13, color: theme.muted, marginBottom: 12, lineHeight: 18 },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  yearInput: {
    width: 96,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    fontSize: 14,
    backgroundColor: theme.white,
    color: theme.text,
  },
  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.white,
  },
  refreshBtnText: { fontSize: 13, fontWeight: '600', color: theme.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: theme.danger, paddingHorizontal: 16, paddingTop: 8 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 24 },
});

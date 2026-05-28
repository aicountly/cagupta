import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { associatePortal } from '../../../adapters/apiClient';
import { theme } from '../../../theme/portalTheme';

const ASSOCIATE_ACCENT = '#7c3aed';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#fef3c7', color: '#92400e' },
  approved: { bg: '#dbeafe', color: '#1e40af' },
  paid: { bg: '#dcfce7', color: '#166534' },
  rejected: { bg: '#fee2e2', color: '#991b1b' },
};

interface PayoutRequest {
  id: number | string;
  requested_amount?: number | string;
  status?: string;
  created_at?: string;
  fast_track?: boolean;
}

function fmtInr(value: unknown): string {
  return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

export default function AssociatePayoutsScreen() {
  const [rows, setRows] = useState<PayoutRequest[]>([]);
  const [avail, setAvail] = useState(0);
  const [maxAmount, setMaxAmount] = useState('');
  const [fast, setFast] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(() => {
    setError('');
    setLoading(true);
    Promise.all([
      associatePortal.getPayoutRequests().then((r) => setRows(Array.isArray(r) ? r : [])),
      associatePortal.getDashboard().then((d) => {
        const data = d as { available_balance?: number | string };
        setAvail(Number(data.available_balance || 0));
      }),
    ])
      .catch((e: Error) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSubmit() {
    setError('');
    setMsg('');
    const n = parseFloat(maxAmount);
    if (!Number.isFinite(n) || n <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await associatePortal.postPayoutRequest({ max_amount: n, fast_track: fast });
      const allocated = (res as { allocated_amount?: number | string }).allocated_amount;
      setMsg(`Request submitted. Allocated ₹${fmtInr(allocated)}.`);
      setMaxAmount('');
      setFast(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  }

  function renderItem({ item: r }: { item: PayoutRequest }) {
    const sc = STATUS_COLORS[r.status || 'pending'] || STATUS_COLORS.pending;
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.flex1}>
            <Text style={styles.amount}>₹{fmtInr(r.requested_amount)}</Text>
            <Text style={styles.meta}>{fmtDate(r.created_at)}</Text>
            {r.fast_track ? <Text style={styles.fastTag}>Fast track</Text> : null}
          </View>
          <View style={[styles.badge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.badgeText, { color: sc.color }]}>{r.status}</Text>
          </View>
        </View>
      </View>
    );
  }

  const formHeader = (
    <View style={styles.formCard}>
      <Text style={styles.balanceText}>
        Available balance: <Text style={styles.balanceStrong}>₹{fmtInr(avail)}</Text>
      </Text>
      <TextInput
        value={maxAmount}
        onChangeText={setMaxAmount}
        keyboardType="decimal-pad"
        placeholder="Max amount to withdraw"
        placeholderTextColor={theme.muted}
        style={styles.input}
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Fast track</Text>
        <Switch
          value={fast}
          onValueChange={setFast}
          trackColor={{ false: theme.border, true: '#c4b5fd' }}
          thumbColor={fast ? ASSOCIATE_ACCENT : theme.white}
        />
      </View>
      <Pressable
        onPress={handleSubmit}
        disabled={submitting}
        style={[styles.submitBtn, submitting && styles.btnDisabled]}
      >
        <Text style={styles.submitBtnText}>{submitting ? 'Submitting…' : 'Request payout'}</Text>
      </Pressable>
      {msg ? <Text style={styles.msgOk}>{msg}</Text> : null}
      {error ? <Text style={styles.msgErr}>{error}</Text> : null}
      <Text style={styles.hint}>
        We allocate open commission lines (FIFO) up to your limit. Amount may be less than requested
        if lines do not match exactly.
      </Text>
    </View>
  );

  if (loading && rows.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        {formHeader}
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ASSOCIATE_ACCENT} />
        </View>
      </ScrollView>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      ListHeaderComponent={formHeader}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>No payout requests yet.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, flexGrow: 1 },
  list: { padding: 16, paddingBottom: 24 },
  formCard: {
    backgroundColor: theme.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 16,
  },
  balanceText: { fontSize: 14, color: theme.text, marginBottom: 12 },
  balanceStrong: { fontWeight: '700' },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    fontSize: 14,
    backgroundColor: theme.white,
    color: theme.text,
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  switchLabel: { fontSize: 13, fontWeight: '600', color: theme.text },
  submitBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: ASSOCIATE_ACCENT,
    alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.7 },
  msgOk: { color: '#16a34a', fontSize: 13, marginTop: 10 },
  msgErr: { color: theme.danger, fontSize: 13, marginTop: 10 },
  hint: { fontSize: 11, color: theme.muted, marginTop: 10, lineHeight: 16 },
  card: {
    backgroundColor: theme.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 10,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  flex1: { flex: 1, paddingRight: 8 },
  amount: { fontSize: 15, fontWeight: '700', color: theme.text },
  meta: { fontSize: 12, color: theme.muted, marginTop: 2 },
  fastTag: { fontSize: 11, color: ASSOCIATE_ACCENT, fontWeight: '600', marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  center: { alignItems: 'center', paddingVertical: 32 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 8 },
});

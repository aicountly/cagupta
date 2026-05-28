import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { associatePortal } from '../../../adapters/apiClient';
import { theme } from '../../../theme/portalTheme';

const ASSOCIATE_ACCENT = '#7c3aed';

interface CommissionRow {
  id: number | string;
  accrual_date?: string;
  accrual_type?: string;
  invoice_number?: string;
  invoice_txn_id?: number | string;
  amount?: number | string;
  status?: string;
}

interface CommissionsMeta {
  pagination?: { period_total?: number | string };
}

function fmtInr(value: unknown): string {
  return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

export default function AssociateCommissionsScreen() {
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [meta, setMeta] = useState<CommissionsMeta>({});
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setError('');
    setLoading(true);
    associatePortal
      .getCommissions({
        dateFrom: from || undefined,
        dateTo: to || undefined,
        perPage: 100,
      })
      .then((r) => {
        setRows(Array.isArray(r.rows) ? (r.rows as CommissionRow[]) : []);
        setMeta((r.meta as CommissionsMeta) || {});
      })
      .catch((e: Error) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const periodTotal = meta.pagination?.period_total;

  function renderItem({ item: r }: { item: CommissionRow }) {
    const invoice = r.invoice_number || (r.invoice_txn_id != null ? String(r.invoice_txn_id) : '—');
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.date}>{r.accrual_date || '—'}</Text>
          <Text style={styles.amount}>₹{fmtInr(r.amount)}</Text>
        </View>
        <Text style={styles.meta}>Type: {r.accrual_type || '—'}</Text>
        <Text style={styles.meta}>Invoice: {invoice}</Text>
        <Text style={styles.meta}>Status: {r.status || '—'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        <View style={styles.dateField}>
          <Text style={styles.filterLabel}>From</Text>
          <TextInput
            value={from}
            onChangeText={setFrom}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.muted}
            style={styles.input}
            autoCapitalize="none"
          />
        </View>
        <View style={styles.dateField}>
          <Text style={styles.filterLabel}>To</Text>
          <TextInput
            value={to}
            onChangeText={setTo}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.muted}
            style={styles.input}
            autoCapitalize="none"
          />
        </View>
        <Pressable onPress={load} style={styles.applyBtn}>
          <Text style={styles.applyBtnText}>Apply</Text>
        </Pressable>
      </View>

      {periodTotal != null && (
        <Text style={styles.periodTotal}>
          Period total (accrued): ₹{fmtInr(periodTotal)}
        </Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ASSOCIATE_ACCENT} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            !loading ? <Text style={styles.empty}>No rows.</Text> : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 16,
    paddingBottom: 8,
    backgroundColor: theme.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    alignItems: 'flex-end',
  },
  dateField: { flexGrow: 1, minWidth: 120 },
  filterLabel: { fontSize: 12, fontWeight: '600', color: theme.text, marginBottom: 4 },
  input: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    fontSize: 14,
    backgroundColor: theme.white,
    color: theme.text,
  },
  applyBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: ASSOCIATE_ACCENT,
  },
  applyBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  periodTotal: {
    fontWeight: '700',
    fontSize: 14,
    color: theme.text,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  list: { padding: 16, paddingBottom: 24 },
  card: {
    backgroundColor: theme.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 10,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 14, fontWeight: '600', color: theme.text },
  amount: { fontSize: 15, fontWeight: '700', color: theme.text },
  meta: { fontSize: 12, color: theme.muted, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: theme.danger, paddingHorizontal: 16, paddingTop: 8 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 24 },
});

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { clientPortal } from '../../../adapters/apiClient';
import { FilterChips } from '../components/FilterChips';
import { theme } from '../../../theme/portalTheme';

interface LedgerRow {
  id?: number | string;
  date?: string;
  narration?: string;
  debit?: number | string;
  credit?: number | string;
  balance?: number | string;
}

interface ClientOrg {
  id: number | string;
  name: string;
}

interface ClientMe {
  available_organizations?: ClientOrg[];
}

const LEDGER_CLASS_OPTIONS = [
  { value: 'regular', label: 'Regular' },
  { value: 'memorandum', label: 'Memorandum' },
  { value: 'optional', label: 'Optional' },
];

const LEDGER_VIEW_OPTIONS = [
  { value: 'consolidated', label: 'Consolidated' },
  { value: 'fees', label: 'Fees' },
  { value: 'reimbursement', label: 'Reimbursement' },
];

function fmtAmount(v: number | string | undefined): string {
  return Number(v || 0).toFixed(2);
}

export default function ClientLedgerScreen() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [me, setMe] = useState<ClientMe | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState('');
  const [ledgerClass, setLedgerClass] = useState('regular');
  const [ledgerView, setLedgerView] = useState('consolidated');

  useEffect(() => {
    clientPortal.getMe().then((d) => setMe(d as ClientMe)).catch(() => setMe(null));
  }, []);

  const loadLedger = useCallback(() => {
    setLoading(true);
    setError('');
    clientPortal
      .getLedger({
        organizationId: orgId || undefined,
        ledgerClass,
        ledgerView,
      })
      .then((d) => setRows(Array.isArray(d) ? (d as LedgerRow[]) : []))
      .catch((e: Error) => setError(e.message || 'Failed to load ledger'))
      .finally(() => setLoading(false));
  }, [orgId, ledgerClass, ledgerView]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const orgOptions = [
    { value: '', label: 'My contact ledger' },
    ...(me?.available_organizations?.map((o) => ({
      value: String(o.id),
      label: o.name,
    })) ?? []),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        <FilterChips
          label="Ledger"
          options={LEDGER_CLASS_OPTIONS}
          value={ledgerClass}
          onChange={setLedgerClass}
        />
        <FilterChips
          label="View"
          options={LEDGER_VIEW_OPTIONS}
          value={ledgerView}
          onChange={setLedgerView}
        />
        {orgOptions.length > 1 && (
          <FilterChips
            label="Organization"
            options={orgOptions}
            value={orgId}
            onChange={setOrgId}
          />
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#15803d" />
        </View>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>No ledger entries found.</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item, index) => `${item.id ?? 'row'}-${index}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.date}>{item.date || '—'}</Text>
              <Text style={styles.narration}>{item.narration || '—'}</Text>
              <View style={styles.amountRow}>
                <Text style={styles.amount}>Dr {fmtAmount(item.debit)}</Text>
                <Text style={styles.amount}>Cr {fmtAmount(item.credit)}</Text>
                <Text style={styles.balance}>Bal {fmtAmount(item.balance)}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  filters: { padding: 16, paddingBottom: 8, backgroundColor: theme.white, borderBottomWidth: 1, borderBottomColor: theme.border },
  list: { padding: 16 },
  card: {
    backgroundColor: theme.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    marginBottom: 10,
  },
  date: { fontSize: 12, color: theme.muted, marginBottom: 4 },
  narration: { fontSize: 15, fontWeight: '600', color: theme.text, marginBottom: 8 },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  amount: { fontSize: 13, color: theme.muted },
  balance: { fontSize: 13, color: '#15803d', fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: theme.danger, paddingHorizontal: 16, paddingTop: 8 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 32, paddingHorizontal: 16 },
});

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { associatePortal } from '../../../adapters/apiClient';
import { theme } from '../../../theme/portalTheme';

const ASSOCIATE_ACCENT = '#7c3aed';

interface CatalogItem {
  catalog_key: string;
  label?: string;
}

interface LedgerRow {
  id: number | string;
  delta_points?: number;
  label?: string;
  kind?: string;
  created_at?: string;
}

interface RedemptionRow {
  id: number | string;
  catalog_key?: string;
  points?: number;
  status?: string;
}

interface RewardsData {
  balance_points?: number;
  catalog?: CatalogItem[];
  ledger?: LedgerRow[];
  redemptions?: RedemptionRow[];
}

export default function AssociateRewardsScreen() {
  const [data, setData] = useState<RewardsData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pts, setPts] = useState('');
  const [catalogKey, setCatalogKey] = useState('amazon_voucher');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setError('');
    setLoading(true);
    associatePortal
      .getRewards()
      .then((d) => {
        const rewards = d as RewardsData;
        setData(rewards);
        const catalog = rewards.catalog || [];
        if (catalog.length > 0) {
          setCatalogKey((prev) =>
            catalog.some((c) => c.catalog_key === prev) ? prev : catalog[0].catalog_key,
          );
        }
      })
      .catch((e: Error) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit() {
    setError('');
    setSubmitting(true);
    try {
      await associatePortal.postRedeem({
        catalog_key: catalogKey,
        points: parseInt(pts, 10) || 0,
      });
      setPts('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Redemption failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={ASSOCIATE_ACCENT} />
      </View>
    );
  }

  const catalog = data?.catalog || [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Points balance</Text>
        <Text style={styles.balanceValue}>{data?.balance_points ?? 0}</Text>
        <Text style={styles.balanceHint}>₹1 per point at redemption</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Request redemption</Text>
        <Text style={styles.label}>Reward</Text>
        <View style={styles.chips}>
          {catalog.map((c) => {
            const active = catalogKey === c.catalog_key;
            return (
              <Pressable
                key={c.catalog_key}
                onPress={() => setCatalogKey(c.catalog_key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {c.label || c.catalog_key}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.label}>Points</Text>
        <TextInput
          value={pts}
          onChangeText={setPts}
          keyboardType="number-pad"
          placeholder="Points to redeem"
          placeholderTextColor={theme.muted}
          style={styles.input}
        />
        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={[styles.submitBtn, submitting && styles.btnDisabled]}
        >
          <Text style={styles.submitBtnText}>{submitting ? 'Submitting…' : 'Submit'}</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Statement</Text>
      <View style={styles.card}>
        {(data?.ledger || []).length === 0 ? (
          <Text style={styles.empty}>No ledger entries yet.</Text>
        ) : (
          (data?.ledger || []).map((row) => (
            <View key={String(row.id)} style={styles.listRow}>
              <Text style={styles.listRowText}>
                <Text style={styles.bold}>
                  {row.delta_points != null && row.delta_points > 0 ? '+' : ''}
                  {row.delta_points}
                </Text>
                {' · '}{row.label || row.kind}
                {' · '}{row.created_at}
              </Text>
            </View>
          ))
        )}
      </View>

      <Text style={styles.sectionTitle}>Requests</Text>
      <View style={styles.card}>
        {(data?.redemptions || []).length === 0 ? (
          <Text style={styles.empty}>No redemption requests yet.</Text>
        ) : (
          (data?.redemptions || []).map((r) => (
            <View key={String(r.id)} style={styles.listRow}>
              <Text style={styles.listRowText}>
                {r.catalog_key} · {r.points} pts · <Text style={styles.bold}>{r.status}</Text>
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
  balanceCard: {
    backgroundColor: theme.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 16,
  },
  balanceLabel: { fontSize: 12, color: theme.muted },
  balanceValue: { fontSize: 26, fontWeight: '800', color: theme.text, marginTop: 4 },
  balanceHint: { fontSize: 12, color: theme.muted, marginTop: 4 },
  card: {
    backgroundColor: theme.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 8 },
  label: { fontSize: 12, fontWeight: '600', color: theme.text, marginBottom: 6, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.white,
  },
  chipActive: { borderColor: ASSOCIATE_ACCENT, borderWidth: 2, backgroundColor: '#f5f3ff' },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.text },
  chipTextActive: { color: ASSOCIATE_ACCENT },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    fontSize: 14,
    backgroundColor: theme.white,
    color: theme.text,
    marginTop: 4,
  },
  submitBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: ASSOCIATE_ACCENT,
    alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.7 },
  listRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  listRowText: { fontSize: 13, color: theme.text },
  bold: { fontWeight: '700' },
  error: { color: theme.danger, marginBottom: 12 },
  empty: { color: theme.muted, fontSize: 13, paddingVertical: 8 },
});

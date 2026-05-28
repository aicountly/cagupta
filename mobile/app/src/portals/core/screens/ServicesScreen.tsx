import React, { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CoreStackParamList } from '../../../navigation/CoreNavigator';
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
import type { EngagementRow } from '@cagupta/shared-services';
import { engagementsService } from '../../../adapters/apiClient';
import { theme } from '../../../theme/portalTheme';

const CORE_ACCENT = '#2563eb';
const PER_PAGE = 20;

const FILTER_OPTIONS = [
  { value: 'pending_on_me', label: 'Pending with me' },
  { value: 'all', label: 'All' },
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'pending_info', label: 'Pending info' },
  { value: 'review', label: 'Review' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

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

export default function ServicesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CoreStackParamList>>();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('pending_on_me');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<EngagementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    engagementsService
      .getEngagementsWithMeta({ page, perPage: PER_PAGE, search, status: filter })
      .then(({ engagements, total: t, lastPage: lp }) => {
        setRows(engagements);
        setTotal(t);
        setLastPage(Math.max(1, lp));
      })
      .catch((e: Error) => setError(e.message || 'Failed to load services'))
      .finally(() => setLoading(false));
  }, [page, search, filter]);

  useEffect(() => {
    load();
  }, [load]);

  function renderItem({ item: s }: { item: EngagementRow }) {
    const sc = STATUS_COLORS[s.status] || STATUS_COLORS.not_started;
    const serviceLine = [s.type, s.engagementTypeName, s.categoryName].filter(Boolean).join(' · ') || '—';
    const period = s.relevantPeriodLabel || s.financialYear || '—';

    return (
      <Pressable
        onPress={() => navigation.navigate('CoreServiceDetail', { id: String(s.id) })}
        style={styles.card}
      >
        <View style={styles.cardHeader}>
          <View style={styles.flex1}>
            <Text style={styles.client}>{s.clientName}</Text>
            <Text style={styles.service}>#{s.id} · {serviceLine}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.badgeText, { color: sc.color }]}>{formatStatusLabel(s.status)}</Text>
          </View>
        </View>
        <Text style={styles.meta}>Period: {period}</Text>
        <Text style={styles.meta}>Assigned: {s.assignedTo || '—'}</Text>
        <Text style={styles.meta}>
          Due: {s.dueDate || '—'}
          {s.feeAgreed != null ? ` · Fee ₹${fmtInr(s.feeAgreed)}` : ''}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TextInput
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search client or service…"
          placeholderTextColor={theme.muted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => { setFilter(opt.value); setPage(1); }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {!loading && total > 0 ? (
          <Text style={styles.count}>{total} engagement{total === 1 ? '' : 's'}</Text>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={CORE_ACCENT} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            !loading ? <Text style={styles.empty}>No service engagements match your filters.</Text> : null
          }
        />
      )}

      {lastPage > 1 && (
        <View style={styles.pagination}>
          <Pressable
            disabled={page <= 1}
            onPress={() => setPage((p) => p - 1)}
            style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
          >
            <Text style={styles.pageBtnText}>← Prev</Text>
          </Pressable>
          <Text style={styles.pageInfo}>Page {page} of {lastPage}</Text>
          <Pressable
            disabled={page >= lastPage}
            onPress={() => setPage((p) => p + 1)}
            style={[styles.pageBtn, page >= lastPage && styles.pageBtnDisabled]}
          >
            <Text style={styles.pageBtnText}>Next →</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  toolbar: {
    padding: 16,
    paddingBottom: 8,
    backgroundColor: theme.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: 10,
  },
  searchInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    fontSize: 14,
    backgroundColor: theme.white,
    color: theme.text,
  },
  filters: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.white,
  },
  chipActive: { borderColor: CORE_ACCENT, borderWidth: 2, backgroundColor: '#eff6ff' },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.text },
  chipTextActive: { color: CORE_ACCENT },
  count: { fontSize: 12, color: theme.muted },
  list: { padding: 16, paddingBottom: 8 },
  card: {
    backgroundColor: theme.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  flex1: { flex: 1, paddingRight: 8 },
  client: { fontSize: 15, fontWeight: '700', color: theme.text },
  service: { fontSize: 13, color: CORE_ACCENT, marginTop: 4 },
  meta: { fontSize: 12, color: theme.muted, marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: theme.danger, paddingHorizontal: 16, paddingTop: 8 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 24, paddingHorizontal: 16 },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.white,
  },
  pageBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: theme.border },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { fontSize: 13, color: theme.text },
  pageInfo: { fontSize: 13, color: theme.muted },
});

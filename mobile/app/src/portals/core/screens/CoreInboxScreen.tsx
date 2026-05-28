import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SupportTicketRow } from '@cagupta/shared-services';
import { inboxService } from '../../../adapters/apiClient';
import { useAuth } from '../../../auth/AuthContext';
import { theme } from '../../../theme/portalTheme';

const CORE_ACCENT = '#2563eb';
const PER_PAGE = 20;

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
] as const;

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  open: { bg: '#dbeafe', color: '#1e40af' },
  in_progress: { bg: '#fef3c7', color: '#92400e' },
  resolved: { bg: '#dcfce7', color: '#166534' },
  closed: { bg: '#f1f5f9', color: '#64748b' },
};

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CoreInboxScreen() {
  const { hasPermission } = useAuth();
  const canView = hasPermission('settings.view');

  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<SupportTicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    inboxService
      .getSupportTicketsWithMeta({ page, perPage: PER_PAGE, status: filter })
      .then(({ tickets, total: t, lastPage: lp }) => {
        setRows(tickets);
        setTotal(t);
        setLastPage(Math.max(1, lp));
      })
      .catch((e: Error) => setError(e.message || 'Failed to load tickets'))
      .finally(() => setLoading(false));
  }, [page, filter, canView]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canView) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>You do not have permission to view the inbox.</Text>
      </View>
    );
  }

  function renderItem({ item: t }: { item: SupportTicketRow }) {
    const sc = STATUS_COLORS[t.status] || STATUS_COLORS.open;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.ticketId}>{t.publicId}</Text>
          <View style={[styles.badge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.badgeText, { color: sc.color }]}>{formatStatusLabel(t.status)}</Text>
          </View>
        </View>
        <Text style={styles.subject}>{t.subject}</Text>
        {t.clientName ? <Text style={styles.meta}>Client: {t.clientName}</Text> : null}
        {t.createdAt ? <Text style={styles.meta}>Created: {t.createdAt}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
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
          <Text style={styles.count}>{total} ticket{total === 1 ? '' : 's'}</Text>
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
            !loading ? <Text style={styles.empty}>No support tickets match your filters.</Text> : null
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  ticketId: { fontSize: 14, fontWeight: '700', color: theme.text },
  subject: { fontSize: 13, color: theme.text, lineHeight: 18 },
  meta: { fontSize: 12, color: theme.muted, marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
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

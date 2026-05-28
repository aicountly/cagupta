import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { partnerPortal } from '../../../adapters/apiClient';
import { theme } from '../../../theme/portalTheme';

const STATUS_LABELS: Record<string, string> = {
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  assigned: { bg: '#dbeafe', color: '#1e40af' },
  in_progress: { bg: '#fef3c7', color: '#92400e' },
  completed: { bg: '#dcfce7', color: '#166534' },
  cancelled: { bg: '#f3f4f6', color: '#374151' },
};

const FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];

interface AssignmentRow {
  id: number | string;
  service_id?: number;
  service_title?: string;
  status?: string;
  assigned_at?: string;
  assigned_by_name?: string;
  total_fee?: number | string;
  partner_payout_pct?: number | string;
  notes?: string;
}

interface Pagination {
  last_page?: number;
  current_page?: number;
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

export default function PartnerAssignmentsScreen() {
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({});
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    partnerPortal
      .getAssignments({ page, perPage: 20, status: filter || undefined })
      .then((d) => {
        setRows(Array.isArray(d.rows) ? (d.rows as AssignmentRow[]) : []);
        setPagination((d.pagination as Pagination) || {});
      })
      .catch((e: Error) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [page, filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStatusChange(id: number | string, newStatus: string) {
    setUpdatingId(id);
    setError('');
    try {
      await partnerPortal.patchAssignment(id, { status: newStatus });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setUpdatingId(null);
    }
  }

  function renderItem({ item: r }: { item: AssignmentRow }) {
    const sc = STATUS_COLORS[r.status || 'assigned'] || STATUS_COLORS.assigned;
    const busy = updatingId === r.id;

    return (
      <View style={styles.card}>
        <Text style={styles.title}>{r.service_title || `Service #${r.service_id}`}</Text>
        <Text style={styles.meta}>
          Assigned {fmtDate(r.assigned_at)}
          {r.assigned_by_name ? ` by ${r.assigned_by_name}` : ''}
        </Text>
        {r.total_fee != null && (
          <Text style={styles.fee}>
            Fee: ₹{fmtInr(r.total_fee)}
            {r.partner_payout_pct ? ` · Payout: ${r.partner_payout_pct}%` : ''}
          </Text>
        )}
        {r.notes ? <Text style={styles.notes}>{r.notes}</Text> : null}
        <View style={styles.actions}>
          <View style={[styles.badge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.badgeText, { color: sc.color }]}>
              {STATUS_LABELS[r.status || ''] || r.status}
            </Text>
          </View>
          {r.status === 'assigned' && (
            <Pressable
              style={[styles.actionBtn, styles.startBtn, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() => handleStatusChange(r.id, 'in_progress')}
            >
              <Text style={styles.actionBtnText}>Start</Text>
            </Pressable>
          )}
          {r.status === 'in_progress' && (
            <Pressable
              style={[styles.actionBtn, styles.completeBtn, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() => handleStatusChange(r.id, 'completed')}
            >
              <Text style={styles.actionBtnText}>Complete</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  const lastPage = pagination.last_page || 1;

  return (
    <View style={styles.flex}>
      <View style={styles.filters}>
        {FILTER_OPTIONS.map((opt) => {
          const active = filter === opt.value;
          return (
            <Pressable
              key={opt.value || 'all'}
              onPress={() => { setFilter(opt.value); setPage(1); }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#ea580c" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            !loading ? <Text style={styles.empty}>No assignments found.</Text> : null
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
  flex: { flex: 1, backgroundColor: theme.bg },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 16,
    paddingBottom: 8,
    backgroundColor: theme.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.white,
  },
  chipActive: { borderColor: '#ea580c', borderWidth: 2, backgroundColor: '#fff7ed' },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.text },
  chipTextActive: { color: '#ea580c' },
  list: { padding: 16, paddingBottom: 8 },
  card: {
    backgroundColor: theme.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 12,
  },
  title: { fontSize: 15, fontWeight: '700', color: theme.text },
  meta: { fontSize: 12, color: theme.muted, marginTop: 4 },
  fee: { fontSize: 13, color: '#334155', marginTop: 4 },
  notes: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  startBtn: { backgroundColor: '#ea580c' },
  completeBtn: { backgroundColor: '#16a34a' },
  btnDisabled: { opacity: 0.6 },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: theme.danger, paddingHorizontal: 16, paddingTop: 8 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 24 },
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

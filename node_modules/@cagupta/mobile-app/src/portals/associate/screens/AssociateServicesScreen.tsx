import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { associatePortal } from '../../../adapters/apiClient';
import { theme } from '../../../theme/portalTheme';

const ASSOCIATE_ACCENT = '#7c3aed';

interface ServiceRow {
  id: number | string;
  client_display?: string;
  service_type?: string;
  status?: string;
  commission_mode?: string;
}

interface Pagination {
  last_page?: number;
  current_page?: number;
}

export default function AssociateServicesScreen() {
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    associatePortal
      .getServices({ page, perPage: 20 })
      .then((d) => {
        setRows(Array.isArray(d.rows) ? (d.rows as ServiceRow[]) : []);
        setPagination((d.pagination as Pagination) || {});
      })
      .catch((e: Error) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  function renderItem({ item: s }: { item: ServiceRow }) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{s.client_display || '—'}</Text>
        <Text style={styles.meta}>Service #{s.id}</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Type</Text>
          <Text style={styles.value}>{s.service_type || '—'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <Text style={styles.value}>{s.status || '—'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Commission mode</Text>
          <Text style={styles.value}>{s.commission_mode || '—'}</Text>
        </View>
      </View>
    );
  }

  const lastPage = pagination.last_page || 1;

  return (
    <View style={styles.container}>
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
            !loading ? <Text style={styles.empty}>No linked engagements.</Text> : null
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
  meta: { fontSize: 12, color: theme.muted, marginTop: 4, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  label: { fontSize: 12, color: theme.muted },
  value: { fontSize: 13, fontWeight: '600', color: theme.text },
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

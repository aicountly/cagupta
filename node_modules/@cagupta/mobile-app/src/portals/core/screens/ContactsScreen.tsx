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
import type { ContactRow } from '@cagupta/shared-services';
import { contactsService } from '../../../adapters/apiClient';
import { theme } from '../../../theme/portalTheme';

const CORE_ACCENT = '#2563eb';
const PER_PAGE = 20;

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'prospect', label: 'Prospect' },
] as const;

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  active: { bg: '#dcfce7', color: '#166534' },
  inactive: { bg: '#f3f4f6', color: '#374151' },
  prospect: { bg: '#fef3c7', color: '#92400e' },
};

export default function ContactsScreen() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
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
    contactsService
      .getContactsWithMeta({ page, perPage: PER_PAGE, search, status: filter })
      .then(({ contacts: rows, total: t, lastPage: lp }) => {
        setContacts(rows);
        setTotal(t);
        setLastPage(Math.max(1, lp));
      })
      .catch((e: Error) => setError(e.message || 'Failed to load contacts'))
      .finally(() => setLoading(false));
  }, [page, search, filter]);

  useEffect(() => {
    load();
  }, [load]);

  function renderItem({ item: c }: { item: ContactRow }) {
    const sc = STATUS_COLORS[c.status] || STATUS_COLORS.active;
    const orgLabel =
      c.linkedOrgsCount > 1
        ? `${c.linkedOrgsCount} organisations`
        : c.organisation || '—';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.flex1}>
            <Text style={styles.code}>{c.clientCode}</Text>
            <Text style={styles.name}>
              {c.displayName}
              {c.reference ? ` (${c.reference})` : ''}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.badgeText, { color: sc.color }]}>{c.status}</Text>
          </View>
        </View>
        <Text style={styles.meta}>Org: {orgLabel}</Text>
        {c.groupName ? <Text style={styles.meta}>Group: {c.groupName}</Text> : null}
        <Text style={styles.meta}>
          {c.mobile || '—'}
          {c.pan ? ` · PAN ${c.pan}` : ''}
        </Text>
        <Text style={styles.meta}>
          {c.assignedManager ? `Manager: ${c.assignedManager}` : ''}
          {c.city ? `${c.assignedManager ? ' · ' : ''}${c.city}` : ''}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TextInput
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search name, mobile, PAN, email…"
          placeholderTextColor={theme.muted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.filters}>
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
        </View>
        {!loading && total > 0 ? (
          <Text style={styles.count}>{total} contact{total === 1 ? '' : 's'}</Text>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading && contacts.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={CORE_ACCENT} />
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            !loading ? <Text style={styles.empty}>No contacts found.</Text> : null
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
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  code: { fontSize: 11, color: theme.muted, fontFamily: 'monospace', marginBottom: 4 },
  name: { fontSize: 15, fontWeight: '700', color: CORE_ACCENT },
  meta: { fontSize: 12, color: theme.muted, marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
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

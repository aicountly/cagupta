import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme } from '../../../theme/portalTheme';

export interface ClientServiceRow {
  id: number | string;
  service_type?: string;
  status?: string;
  due_date?: string;
  updated_at?: string;
}

interface ClientServiceListProps {
  rows: ClientServiceRow[];
  loading: boolean;
  error: string;
  emptyMessage: string;
  dateField: 'due_date' | 'updated_at';
  dateLabel: string;
  onPressRow: (id: number | string) => void;
}

export function ClientServiceList({
  rows,
  loading,
  error,
  emptyMessage,
  dateField,
  dateLabel,
  onPressRow,
}: ClientServiceListProps) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#15803d" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => onPressRow(item.id)}
        >
          <Text style={styles.serviceType}>{item.service_type || '—'}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Status</Text>
            <Text style={styles.metaValue}>{item.status || '—'}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{dateLabel}</Text>
            <Text style={styles.metaValue}>{item[dateField] || '—'}</Text>
          </View>
          <Text style={styles.link}>View details →</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: theme.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    marginBottom: 12,
  },
  cardPressed: { opacity: 0.85 },
  serviceType: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 10 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  metaLabel: { fontSize: 13, color: theme.muted },
  metaValue: { fontSize: 13, color: theme.text, fontWeight: '500' },
  link: { marginTop: 8, fontSize: 13, color: '#15803d', fontWeight: '600' },
  error: { color: theme.danger, fontSize: 14 },
  empty: { color: theme.muted, fontSize: 14, textAlign: 'center', marginTop: 24 },
});

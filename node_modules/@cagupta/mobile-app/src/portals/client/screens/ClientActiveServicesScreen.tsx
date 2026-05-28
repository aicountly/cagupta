import React, { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { clientPortal } from '../../../adapters/apiClient';
import { ClientServiceList, type ClientServiceRow } from '../components/ClientServiceList';
import type { ClientTabNavigationProp } from '../../../navigation/ClientNavigator';

export default function ClientActiveServicesScreen() {
  const navigation = useNavigation<ClientTabNavigationProp>();
  const [rows, setRows] = useState<ClientServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    clientPortal
      .getServices({ group: 'active', perPage: 100 })
      .then((r) => setRows(Array.isArray(r.rows) ? (r.rows as ClientServiceRow[]) : []))
      .catch((e: Error) => setError(e.message || 'Failed to load services'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <ClientServiceList
      rows={rows}
      loading={loading}
      error={error}
      emptyMessage="No active services."
      dateField="due_date"
      dateLabel="Due date"
      onPressRow={(id) => navigation.navigate('ClientServiceDetail', { id: String(id) })}
    />
  );
}

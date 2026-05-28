import React, { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { clientPortal } from '../../../adapters/apiClient';
import { ClientServiceList, type ClientServiceRow } from '../components/ClientServiceList';
import type { ClientTabNavigationProp } from '../../../navigation/ClientNavigator';

export default function ClientCompletedServicesScreen() {
  const navigation = useNavigation<ClientTabNavigationProp>();
  const [rows, setRows] = useState<ClientServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    clientPortal
      .getServices({ group: 'completed', perPage: 100 })
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
      emptyMessage="No completed services."
      dateField="updated_at"
      dateLabel="Updated"
      onPressRow={(id) => navigation.navigate('ClientServiceDetail', { id: String(id) })}
    />
  );
}

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ClientLayout from '../../components/layout/ClientLayout';
import { getClientService } from '../../services/clientPortalService';

export default function ClientServiceDetails() {
  const { id } = useParams();
  const [row, setRow] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!id) return;
    getClientService(id).then(setRow).catch((e) => setErr(e.message || 'Failed to load service'));
  }, [id]);

  return (
    <ClientLayout title="Service details">
      {err && <div style={{ color: '#dc2626', marginBottom: 12 }}>{err}</div>}
      {!row && !err && <div style={{ color: '#64748b' }}>Loading…</div>}
      {row && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>
          <div style={{ marginBottom: 8 }}><strong>Service:</strong> {row.service_type || '-'}</div>
          <div style={{ marginBottom: 8 }}><strong>Status:</strong> {row.status || '-'}</div>
          <div style={{ marginBottom: 8 }}><strong>Due date:</strong> {row.due_date || '-'}</div>
          <div style={{ marginBottom: 8 }}><strong>Financial year:</strong> {row.financial_year || '-'}</div>
          <div style={{ marginBottom: 8 }}><strong>Details:</strong> {row.description || row.notes || '-'}</div>
        </div>
      )}
    </ClientLayout>
  );
}

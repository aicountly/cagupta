import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ClientLayout from '../../components/layout/ClientLayout';
import { getClientServices } from '../../services/clientPortalService';

export default function ClientActiveServices() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    getClientServices({ group: 'active', perPage: 100 }).then((r) => setRows(r.rows)).catch((e) => setErr(e.message || 'Failed'));
  }, []);

  return (
    <ClientLayout title="Active services">
      {err && <div style={{ color: '#dc2626', marginBottom: 12 }}>{err}</div>}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              <th style={{ padding: 10 }}>Service</th>
              <th style={{ padding: 10 }}>Status</th>
              <th style={{ padding: 10 }}>Due date</th>
              <th style={{ padding: 10 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: 10 }}>{s.service_type || '-'}</td>
                <td style={{ padding: 10 }}>{s.status || '-'}</td>
                <td style={{ padding: 10 }}>{s.due_date || '-'}</td>
                <td style={{ padding: 10 }}><Link to={`/client/services/${s.id}`}>View details</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !err && <div style={{ padding: 24, color: '#64748b' }}>No active services.</div>}
      </div>
    </ClientLayout>
  );
}

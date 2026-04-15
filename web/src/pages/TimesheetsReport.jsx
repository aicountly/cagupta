import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useStaffUsers } from '../hooks/useStaffUsers';
import { getTimeEntryReport, TIME_ACTIVITY_TYPES } from '../services/timeEntryService';

function monthBounds() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const last = new Date(y, d.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, '0')}` };
}

function fmtHours(mins) {
  const h = mins / 60;
  return h.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TimesheetsReport() {
  const { hasPermission } = useAuth();
  const { staffUsers } = useStaffUsers();
  const canView = hasPermission('services.view');
  const bounds = useMemo(() => monthBounds(), []);
  const [dateFrom, setDateFrom] = useState(bounds.from);
  const [dateTo, setDateTo] = useState(bounds.to);
  const [userId, setUserId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canView) return;
    setLoading(true);
    setError('');
    getTimeEntryReport({
      userId: userId || undefined,
      dateFrom,
      dateTo,
    })
      .then(setRows)
      .catch((e) => setError(e.message || 'Failed to load report.'))
      .finally(() => setLoading(false));
  }, [canView, dateFrom, dateTo, userId]);

  if (!canView) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: '#64748b' }}>You do not have permission to view timesheets.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0B1F3B', marginBottom: 8 }}>Timesheet report</h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, maxWidth: 720 }}>
        Billable and non-billable time by user, engagement, client, and client group (
        {TIME_ACTIVITY_TYPES.length} activity types available when logging time).
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 20 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' }}>
          User
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', minWidth: 200, fontSize: 13 }}
          >
            <option value="">All users</option>
            {staffUsers.map((s) => (
              <option key={s.id} value={String(s.id)}>{s.name}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' }}>
          From
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' }}>
          To
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
        </label>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              {['User', 'Engagement #', 'Service', 'Client', 'Group', 'Billable (h)', 'Non-billable (h)'].map((h) => (
                <th key={h} style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600, fontSize: 12, borderBottom: '2px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No time entries in this range.</td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.userId}-${r.serviceId}-${i}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{r.userName}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{r.serviceId}</td>
                  <td style={{ padding: '10px 12px' }}>{r.serviceType}</td>
                  <td style={{ padding: '10px 12px' }}>{r.clientName}</td>
                  <td style={{ padding: '10px 12px', color: r.groupName ? '#334155' : '#94a3b8' }}>{r.groupName || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{fmtHours(r.billableMinutes)}</td>
                  <td style={{ padding: '10px 12px' }}>{fmtHours(r.nonBillableMinutes)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useStaffUsers } from '../hooks/useStaffUsers';
import { getShiftTargetTimesheetReport } from '../services/timeEntryService';

function defaultWeekBounds() {
  const now = new Date();
  const day = now.getDay();
  const mondayDelta = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayDelta);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const toYmd = (d) => d.toISOString().slice(0, 10);
  return { from: toYmd(monday), to: toYmd(sunday) };
}

function fmtMinutes(mins) {
  const n = Math.max(0, Math.floor(Number(mins) || 0));
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export default function ShiftTargetTimesheetReport() {
  const { hasPermission } = useAuth();
  const { staffUsers } = useStaffUsers();
  const canView = hasPermission('services.view');
  const bounds = useMemo(() => defaultWeekBounds(), []);
  const [dateFrom, setDateFrom] = useState(bounds.from);
  const [dateTo, setDateTo] = useState(bounds.to);
  const [userId, setUserId] = useState('');
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canView) return;
    setLoading(true);
    getShiftTargetTimesheetReport({
      dateFrom,
      dateTo,
      userId: userId || undefined,
    })
      .then(({ meta: m, rows: r }) => {
        setMeta(m);
        setRows(r);
        setError('');
      })
      .catch((e) => setError(e.message || 'Failed to load report.'))
      .finally(() => setLoading(false));
  }, [canView, dateFrom, dateTo, userId]);

  const resetFilters = () => {
    setDateFrom(bounds.from);
    setDateTo(bounds.to);
    setUserId('');
  };

  if (!canView) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: '#64748b' }}>You do not have permission to view this report.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1280 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0B1F3B', marginBottom: 8 }}>Staff punch vs target</h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, maxWidth: 800 }}>
        Total punched time vs shift target for each active user (510 minutes per calendar day in the range,
        inclusive). <strong>Deficit</strong> and <strong>overtime</strong> are for the whole period (only one is
        non-zero per user). Matches the logic used for the daily super-admin email digest.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
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
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' }}>
          To
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
          />
        </label>
        <button
          type="button"
          onClick={resetFilters}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            background: '#fff',
            color: '#334155',
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {meta && !error && (
        <div
          style={{
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 13,
            color: '#0c4a6e',
            marginBottom: 16,
          }}
        >
          <strong>{meta.day_count}</strong> calendar day(s) × <strong>{meta.shift_target_minutes_per_day}</strong> min
          = <strong>{fmtMinutes(meta.total_target_minutes)}</strong> ({meta.total_target_minutes} min) total target
          per user · Range {meta.date_from} → {meta.date_to}
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              {['Name', 'Email', 'Billable', 'Non-billable', 'Total punched', 'Total target', 'Deficit', 'Overtime'].map((h) => (
                <th key={h} style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600, fontSize: 12, borderBottom: '2px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No rows for this range.</td>
              </tr>
            ) : (
              rows.map((r) => {
                const bill = Number(r.billable_minutes) || 0;
                const non = Number(r.non_billable_minutes) || 0;
                const punched = Number(r.total_punched_minutes) || 0;
                const target = Number(r.total_target_minutes) || 0;
                const deficit = Number(r.deficit_minutes) || 0;
                const overtime = Number(r.overtime_minutes) || 0;
                return (
                  <tr key={r.user_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{r.user_name || '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#475569' }}><small>{r.user_email || '—'}</small></td>
                    <td style={{ padding: '10px 12px' }}>{fmtMinutes(bill)} <span style={{ color: '#94a3b8' }}>({bill})</span></td>
                    <td style={{ padding: '10px 12px' }}>{fmtMinutes(non)} <span style={{ color: '#94a3b8' }}>({non})</span></td>
                    <td style={{ padding: '10px 12px' }}>{fmtMinutes(punched)} <span style={{ color: '#94a3b8' }}>({punched})</span></td>
                    <td style={{ padding: '10px 12px' }}>{fmtMinutes(target)} <span style={{ color: '#94a3b8' }}>({target})</span></td>
                    <td style={{ padding: '10px 12px', color: deficit > 0 ? '#b45309' : '#94a3b8' }}>
                      {fmtMinutes(deficit)} <span style={{ color: '#94a3b8' }}>({deficit})</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: overtime > 0 ? '#15803d' : '#94a3b8' }}>
                      {fmtMinutes(overtime)} <span style={{ color: '#94a3b8' }}>({overtime})</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

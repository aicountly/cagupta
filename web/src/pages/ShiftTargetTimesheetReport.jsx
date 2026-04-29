import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useStaffUsers } from '../hooks/useStaffUsers';
import { getShiftTargetTimesheetReport } from '../services/timeEntryService';
import DateRangeSelector from '../components/common/DateRangeSelector';
import { getPresetDates } from '../utils/datePresets';

const DEFAULT_PRESET = 'this_week';

function buildInitialState(searchParams) {
  const urlPreset   = searchParams.get('preset')  || '';
  const urlDateFrom = searchParams.get('dateFrom') || '';
  const urlDateTo   = searchParams.get('dateTo')   || '';
  const urlUserId   = searchParams.get('userId')   || '';

  if (urlPreset && urlDateFrom && urlDateTo) {
    return { preset: urlPreset, dateFrom: urlDateFrom, dateTo: urlDateTo, userId: urlUserId };
  }

  const preset = DEFAULT_PRESET;
  const { from, to } = getPresetDates(preset);
  return { preset, dateFrom: from, dateTo: to, userId: '' };
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initial = useMemo(() => buildInitialState(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [preset,   setPresetState] = useState(initial.preset);
  const [dateFrom, setDateFrom]    = useState(initial.dateFrom);
  const [dateTo,   setDateTo]      = useState(initial.dateTo);
  const [userId,   setUserId]      = useState(initial.userId);

  const [meta,    setMeta]    = useState(null);
  const [rows,    setRows]    = useState([]);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  function handlePresetChange(value) {
    setPresetState(value);
    if (value !== 'custom') {
      const dates = getPresetDates(value);
      if (dates) {
        setDateFrom(dates.from);
        setDateTo(dates.to);
      }
    }
  }

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

  function resetFilters() {
    const { from, to } = getPresetDates(DEFAULT_PRESET);
    setPresetState(DEFAULT_PRESET);
    setDateFrom(from);
    setDateTo(to);
    setUserId('');
  }

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
        Total punched time vs each user's individual daily target (default 510 minutes) for the selected date
        range, inclusive. <strong>Deficit</strong> and <strong>overtime</strong> are for the whole period (only
        one is non-zero per user). Matches the logic used for the daily super-admin email digest.
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

        <DateRangeSelector
          preset={preset}
          onPresetChange={handlePresetChange}
          dateFrom={dateFrom}
          onDateFromChange={setDateFrom}
          dateTo={dateTo}
          onDateToChange={setDateTo}
        />

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
          <strong>{meta.day_count}</strong> calendar day(s) · Range {meta.date_from} → {meta.date_to} · Target is
          per-user (see table)
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              {['Name', 'Email', 'Billable', 'Non-billable', 'Total punched', 'Daily target', 'Total target', 'Deficit', 'Overtime'].map((h) => (
                <th key={h} style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600, fontSize: 12, borderBottom: '2px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No rows for this range.</td>
              </tr>
            ) : (
              rows.map((r) => {
                const bill      = Number(r.billable_minutes) || 0;
                const non       = Number(r.non_billable_minutes) || 0;
                const punched   = Number(r.total_punched_minutes) || 0;
                const dailyTarget = Number(r.shift_target_minutes) || 510;
                const target    = Number(r.total_target_minutes) || 0;
                const deficit   = Number(r.deficit_minutes) || 0;
                const overtime  = Number(r.overtime_minutes) || 0;

                const params = new URLSearchParams({
                  userId: String(r.user_id || ''),
                  dateFrom,
                  dateTo,
                  preset: 'custom',
                });

                return (
                  <tr
                    key={r.user_id}
                    style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                    onClick={() => navigate(`/reports/timesheets?${params}`)}
                    title="View detailed Timesheet report for this user and period"
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#2563eb', textDecoration: 'underline dotted' }}>{r.user_name || '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#475569' }}><small>{r.user_email || '—'}</small></td>
                    <td style={{ padding: '10px 12px' }}>{fmtMinutes(bill)} <span style={{ color: '#94a3b8' }}>({bill})</span></td>
                    <td style={{ padding: '10px 12px' }}>{fmtMinutes(non)} <span style={{ color: '#94a3b8' }}>({non})</span></td>
                    <td style={{ padding: '10px 12px' }}>{fmtMinutes(punched)} <span style={{ color: '#94a3b8' }}>({punched})</span></td>
                    <td style={{ padding: '10px 12px' }}>{fmtMinutes(dailyTarget)} <span style={{ color: '#94a3b8' }}>({dailyTarget}/day)</span></td>
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

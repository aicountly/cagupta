import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../auth/AuthContext';
import { useStaffUsers } from '../hooks/useStaffUsers';
import { useTimesheetReportFilters } from '../hooks/useTimesheetReportFilters';
import { getTimesheetInsights, TIME_ACTIVITY_TYPES } from '../services/timeEntryService';

function fmtHours(mins) {
  const h = mins / 60;
  return h.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TimesheetsReport() {
  const { hasPermission } = useAuth();
  const { staffUsers } = useStaffUsers();
  const canView = hasPermission('services.view');
  const { filters, updateFilter, resetFilters } = useTimesheetReportFilters();
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');

  const rows = payload?.table || [];
  const summary = payload?.summary || {};
  const trendSeries = useMemo(
    () =>
      (payload?.series || []).map((s) => ({
        bucketStart: s.bucket_start,
        expected: Number(s.expected_billable) || 0,
      })),
    [payload],
  );
  const financeByClient = useMemo(
    () =>
      (payload?.breakdowns?.financeByClient || []).map((r) => ({
        clientName: r.client_name || 'Unknown',
        actual: Number(r.actual_billed) || 0,
        received: Number(r.received) || 0,
      })),
    [payload],
  );
  const employeeHours = useMemo(
    () =>
      (payload?.breakdowns?.employees || []).map((r) => ({
        userName: r.user_name || 'Unknown',
        billable: Number(r.billable_minutes) || 0,
        nonBillable: Number(r.non_billable_minutes) || 0,
      })),
    [payload],
  );
  const pieData = useMemo(
    () => [
      { name: 'Billable', value: Number(summary.billable_minutes) || 0 },
      { name: 'Non-billable', value: Number(summary.non_billable_minutes) || 0 },
    ],
    [summary],
  );

  useEffect(() => {
    if (!canView) return;
    getTimesheetInsights({
      userId: filters.userId || undefined,
      clientId: filters.clientId || undefined,
      organizationId: filters.organizationId || undefined,
      serviceId: filters.serviceId || undefined,
      groupId: filters.groupId || undefined,
      billableType: filters.billableType,
      bucket: filters.bucket,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    })
      .then((data) => {
        setPayload(data);
        setError('');
      })
      .catch((e) => setError(e.message || 'Failed to load report.'))
  }, [canView, filters]);

  const loading = !payload && !error;

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
        360-degree time-sheet insights with employee utilization, client billing realization, and trends (
        {TIME_ACTIVITY_TYPES.length} activity types available when logging time).
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 20 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' }}>
          User
          <select
            value={filters.userId}
            onChange={(e) => updateFilter('userId', e.target.value)}
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
          <input type="date" value={filters.dateFrom} onChange={(e) => updateFilter('dateFrom', e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' }}>
          To
          <input type="date" value={filters.dateTo} onChange={(e) => updateFilter('dateTo', e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' }}>
          Bucket
          <select value={filters.bucket} onChange={(e) => updateFilter('bucket', e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', minWidth: 130, fontSize: 13 }}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' }}>
          Type
          <select value={filters.billableType} onChange={(e) => updateFilter('billableType', e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', minWidth: 140, fontSize: 13 }}>
            <option value="all">All</option>
            <option value="billable">Billable</option>
            <option value="non_billable">Non-billable</option>
          </select>
        </label>
        <button type="button" onClick={resetFilters} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer' }}>Reset</button>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Expected billable', value: Number(summary.expected_billable || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
          { label: 'Actual billed', value: Number(summary.actual_billed || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
          { label: 'Received', value: Number(summary.received || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
          { label: 'Outstanding', value: Number(summary.outstanding || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
        ].map((kpi) => (
          <div key={kpi.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{kpi.label}</div>
            <div style={{ fontSize: 20, color: '#0f172a', fontWeight: 700 }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 12, minHeight: 280 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8 }}>Billable vs non-billable mix</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={85} fill="#2563eb" />
              <Tooltip formatter={(value) => fmtHours(Number(value) || 0)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 12, minHeight: 280 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8 }}>Expected billable trend</div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucketStart" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="expected" stroke="#2563eb" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 12, minHeight: 300 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8 }}>Employee contribution (minutes)</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={employeeHours}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="userName" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="billable" stackId="a" fill="#2563eb" />
              <Bar dataKey="nonBillable" stackId="a" fill="#94a3b8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 12, minHeight: 300 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8 }}>Client actual billed vs received</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={financeByClient}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="clientName" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="actual" fill="#0ea5e9" />
              <Bar dataKey="received" fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

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
                <tr key={`${r.user_id}-${r.service_id}-${i}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{r.user_name}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{r.service_id}</td>
                  <td style={{ padding: '10px 12px' }}>{r.service_type}</td>
                  <td style={{ padding: '10px 12px' }}>{r.client_name}</td>
                  <td style={{ padding: '10px 12px', color: r.group_name ? '#334155' : '#94a3b8' }}>{r.group_name || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{fmtHours(r.billable_minutes)}</td>
                  <td style={{ padding: '10px 12px' }}>{fmtHours(r.non_billable_minutes)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

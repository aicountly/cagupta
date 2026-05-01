import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Bell, AlertTriangle, Clock, CalendarDays, ExternalLink } from 'lucide-react';
import {
  getPendingFollowUps,
  updateServiceLog,
  sendLogReminder,
} from '../services/serviceLogService';

const DAYS_AHEAD = 30;

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d) {
  if (!d) return '—';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return d; }
}

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function classifyEntry(entry) {
  const today = todayStr();
  if (!entry.follow_up_date) return 'other';
  if (entry.follow_up_date < today)  return 'overdue';
  if (entry.follow_up_date === today) return 'today';
  return 'upcoming';
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PendingFollowUps() {
  const navigate  = useNavigate();
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [busy, setBusy]       = useState({});
  const [actionMsg, setActionMsg] = useState({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getPendingFollowUps({ daysAhead: DAYS_AHEAD });
      setRows(data);
    } catch (e) {
      setError(e.message || 'Failed to load pending follow-ups.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleResolve(entry) {
    const key = `resolve-${entry.id}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      await updateServiceLog(entry.service_id, entry.id, { resolve: true });
      setRows((prev) => prev.filter((r) => r.id !== entry.id));
      setActionMsg((m) => ({ ...m, [entry.id]: 'Resolved.' }));
    } catch (e) {
      setActionMsg((m) => ({ ...m, [entry.id]: e.message || 'Failed.' }));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  async function handleRemind(entry) {
    const key = `remind-${entry.id}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const updated = await sendLogReminder(entry.service_id, entry.id);
      setRows((prev) => prev.map((r) => r.id === entry.id ? { ...r, reminder_sent_at: updated?.reminder_sent_at } : r));
      setActionMsg((m) => ({ ...m, [entry.id]: 'Reminder sent!' }));
    } catch (e) {
      setActionMsg((m) => ({ ...m, [entry.id]: e.message || 'Failed to send.' }));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  // Group by classification
  const overdue  = rows.filter((r) => classifyEntry(r) === 'overdue');
  const today    = rows.filter((r) => classifyEntry(r) === 'today');
  const upcoming = rows.filter((r) => classifyEntry(r) === 'upcoming');

  return (
    <div style={pageWrap}>
      {/* Page header */}
      <div style={pageHeader}>
        <div>
          <h1 style={pageTitle}>Pending Follow-ups</h1>
          <p style={pageSubtitle}>
            Unresolved follow-up log entries due within the next {DAYS_AHEAD} days, across all service engagements.
          </p>
        </div>
        <button type="button" onClick={fetchData} disabled={loading} style={btnRefresh}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div style={errBox}>{error}</div>}

      {/* Summary KPIs */}
      {!loading && (
        <div style={kpiRow}>
          <KpiCard label="Overdue"  count={overdue.length}  color="#dc2626" bg="#FFF1F2" Icon={AlertTriangle} />
          <KpiCard label="Due Today" count={today.length}   color="#d97706" bg="#FFFBEB" Icon={Clock} />
          <KpiCard label="Upcoming" count={upcoming.length} color="#2563eb" bg="#EFF6FF" Icon={CalendarDays} />
        </div>
      )}

      {loading && <div style={loadingMsg}>Loading follow-ups…</div>}

      {!loading && rows.length === 0 && !error && (
        <div style={emptyState}>
          <CheckCircle2 size={32} color="#22c55e" />
          <div style={{ fontWeight: 700, color: '#0B1F3B', fontSize: 15 }}>All caught up!</div>
          <div style={{ color: '#94a3b8', fontSize: 13 }}>No pending follow-ups due in the next {DAYS_AHEAD} days.</div>
        </div>
      )}

      {/* Overdue group */}
      {overdue.length > 0 && (
        <Group
          title="Overdue"
          color="#dc2626"
          bg="#FFF1F2"
          icon={<AlertTriangle size={15} color="#dc2626" />}
          entries={overdue}
          onResolve={handleResolve}
          onRemind={handleRemind}
          busy={busy}
          actionMsg={actionMsg}
          navigate={navigate}
        />
      )}

      {/* Due today group */}
      {today.length > 0 && (
        <Group
          title="Due Today"
          color="#d97706"
          bg="#FFFBEB"
          icon={<Clock size={15} color="#d97706" />}
          entries={today}
          onResolve={handleResolve}
          onRemind={handleRemind}
          busy={busy}
          actionMsg={actionMsg}
          navigate={navigate}
        />
      )}

      {/* Upcoming group */}
      {upcoming.length > 0 && (
        <Group
          title={`Upcoming (next ${DAYS_AHEAD} days)`}
          color="#2563eb"
          bg="#EFF6FF"
          icon={<CalendarDays size={15} color="#2563eb" />}
          entries={upcoming}
          onResolve={handleResolve}
          onRemind={handleRemind}
          busy={busy}
          actionMsg={actionMsg}
          navigate={navigate}
        />
      )}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, count, color, bg, Icon }) {
  return (
    <div style={{ ...kpiCard, borderTop: `3px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color }}>{count}</div>
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} color={color} />
        </div>
      </div>
    </div>
  );
}

// ── Group section ─────────────────────────────────────────────────────────────
function Group({ title, color, bg, icon, entries, onResolve, onRemind, busy, actionMsg, navigate }) {
  return (
    <div style={groupCard}>
      <div style={{ ...groupHeader, background: bg }}>
        {icon}
        <span style={{ fontWeight: 700, fontSize: 14, color }}>{title}</span>
        <span style={{
          marginLeft: 6, fontSize: 12, fontWeight: 700,
          background: color, color: '#fff',
          borderRadius: 10, padding: '1px 8px',
        }}>{entries.length}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {['Service', 'Client', 'Staff', 'Follow-up Date', 'Last Reminder', 'Note', 'Actions'].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const remindKey  = `remind-${entry.id}`;
              const resolveKey = `resolve-${entry.id}`;
              const canRemind  = entry.visibility === 'client' || entry.visibility === 'affiliate';
              return (
                <tr key={entry.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#0B1F3B' }}>
                      {entry.service_type}
                      {entry.financial_year && (
                        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>{entry.financial_year}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      <span style={statusPill}>{(entry.service_status || '').replace(/_/g, ' ')}</span>
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 13, color: '#334155' }}>
                      {entry.client_display_name || entry.client_name || '—'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12, color: '#64748b' }}>
                    {entry.assignee_names || '—'}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 13, fontWeight: 700, color }}>
                      {formatDate(entry.follow_up_date)}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12, color: '#94a3b8' }}>
                    {entry.reminder_sent_at ? formatDateTime(entry.reminder_sent_at) : '—'}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 220 }}>
                    <span style={{ fontSize: 12, color: '#334155', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {entry.message}
                    </span>
                    {actionMsg[entry.id] && (
                      <div style={{ fontSize: 11, color: '#16a34a', marginTop: 3 }}>{actionMsg[entry.id]}</div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        disabled={busy[resolveKey]}
                        onClick={() => onResolve(entry)}
                        style={actionBtn}
                        title="Mark resolved"
                      >
                        <CheckCircle2 size={13} />
                        Resolve
                      </button>
                      {canRemind && (
                        <button
                          type="button"
                          disabled={busy[remindKey]}
                          onClick={() => onRemind(entry)}
                          style={{ ...actionBtn, color: '#2563eb', borderColor: '#bfdbfe' }}
                          title="Send reminder to client"
                        >
                          <Bell size={13} />
                          Remind
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => navigate(`/services/${entry.service_id}`)}
                        style={{ ...actionBtn, color: '#F37920', borderColor: 'rgba(243,121,32,0.3)' }}
                        title="Open service"
                      >
                        <ExternalLink size={12} />
                        Open
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const pageWrap = { padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, background: '#F6F7FB', minHeight: '100%' };
const pageHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 };
const pageTitle = { margin: 0, fontSize: 22, fontWeight: 700, color: '#0B1F3B' };
const pageSubtitle = { margin: '6px 0 0', fontSize: 13, color: '#64748b' };
const btnRefresh = {
  padding: '8px 18px', background: '#fff', border: '1px solid #E6E8F0',
  borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569',
};
const errBox = {
  background: '#FFF1F2', border: '1px solid #fecdd3', borderRadius: 8,
  padding: '12px 16px', fontSize: 13, color: '#dc2626',
};
const kpiRow = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 };
const kpiCard = {
  background: '#fff', borderRadius: 12, padding: '18px 20px',
  border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
};
const loadingMsg = { fontSize: 13, color: '#64748b', textAlign: 'center', padding: 24 };
const emptyState = {
  background: '#fff', borderRadius: 14, border: '1px solid #E6E8F0',
  padding: 40, display: 'flex', flexDirection: 'column',
  alignItems: 'center', gap: 12, textAlign: 'center',
};
const groupCard = { background: '#fff', borderRadius: 14, border: '1px solid #E6E8F0', overflow: 'hidden' };
const groupHeader = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '12px 18px', borderBottom: '1px solid #E6E8F0',
};
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const thStyle = {
  textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b',
  textTransform: 'uppercase', letterSpacing: '0.04em',
  padding: '10px 14px', background: '#FAFBFD',
};
const tdStyle = { padding: '12px 14px', verticalAlign: 'top' };
const statusPill = {
  display: 'inline-block', padding: '1px 6px', borderRadius: 5,
  fontSize: 10, fontWeight: 700, background: '#F1F5F9', color: '#64748b',
  textTransform: 'capitalize',
};
const actionBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '4px 10px', background: '#F6F7FB', border: '1px solid #E6E8F0',
  borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#475569',
};

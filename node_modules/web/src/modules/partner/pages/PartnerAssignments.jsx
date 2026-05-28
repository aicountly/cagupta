import { useState, useEffect, useCallback } from 'react';
import PartnerLayout from '../components/PartnerLayout';
import { getPartnerAssignments, patchPartnerAssignment } from '../services/partnerPortalService';

const STATUS_LABELS = { assigned: 'Assigned', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' };
const STATUS_COLORS = {
  assigned: { bg: '#dbeafe', color: '#1e40af' },
  in_progress: { bg: '#fef3c7', color: '#92400e' },
  completed: { bg: '#dcfce7', color: '#166534' },
  cancelled: { bg: '#f3f4f6', color: '#374151' },
};

export default function PartnerAssignments() {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [filter, setFilter] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setErr('');
    getPartnerAssignments({ page, perPage: 20, status: filter || undefined })
      .then((d) => { setRows(d.rows); setPagination(d.pagination); })
      .catch((e) => setErr(e.message || 'Failed'))
      .finally(() => setLoading(false));
  }, [page, filter]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(id, newStatus) {
    try {
      await patchPartnerAssignment(id, { status: newStatus });
      load();
    } catch (e) {
      setErr(e.message || 'Update failed');
    }
  }

  return (
    <PartnerLayout title="My Assignments">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['', 'assigned', 'in_progress', 'completed'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setFilter(s); setPage(1); }}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: filter === s ? '2px solid #ea580c' : '1px solid #e2e8f0',
              background: filter === s ? '#fff7ed' : '#fff', color: '#0f172a',
            }}
          >
            {s === '' ? 'All' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      {err && <div style={{ color: '#dc2626', marginBottom: 12 }}>{err}</div>}
      {loading && <div style={{ color: '#64748b' }}>Loading…</div>}
      {!loading && rows.length === 0 && <div style={{ color: '#94a3b8' }}>No assignments found.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((r) => {
          const sc = STATUS_COLORS[r.status] || STATUS_COLORS.assigned;
          return (
            <div key={r.id} style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{r.service_title || `Service #${r.service_id}`}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    Assigned {new Date(r.assigned_at).toLocaleDateString('en-IN')}
                    {r.assigned_by_name ? ` by ${r.assigned_by_name}` : ''}
                  </div>
                  {r.total_fee && (
                    <div style={{ fontSize: 13, color: '#334155', marginTop: 4 }}>
                      Fee: ₹{Number(r.total_fee).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      {r.partner_payout_pct ? ` · Payout: ${r.partner_payout_pct}%` : ''}
                    </div>
                  )}
                  {r.notes && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{r.notes}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: sc.bg, color: sc.color,
                  }}>
                    {STATUS_LABELS[r.status] || r.status}
                  </span>
                  {r.status === 'assigned' && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(r.id, 'in_progress')}
                      style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                        background: '#ea580c', color: '#fff', border: 'none', cursor: 'pointer',
                      }}
                    >
                      Start
                    </button>
                  )}
                  {r.status === 'in_progress' && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(r.id, 'completed')}
                      style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                        background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer',
                      }}
                    >
                      Complete
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {(pagination.last_page || 1) > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0', cursor: 'pointer' }}>← Prev</button>
          <span style={{ padding: '6px 0', fontSize: 13, color: '#64748b' }}>Page {page} of {pagination.last_page}</span>
          <button disabled={page >= (pagination.last_page || 1)} onClick={() => setPage((p) => p + 1)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0', cursor: 'pointer' }}>Next →</button>
        </div>
      )}
    </PartnerLayout>
  );
}

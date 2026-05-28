import { useCallback, useEffect, useState } from 'react';
import { History, ChevronDown } from 'lucide-react';
import {
  fetchMasterAuditLog,
  formatMasterAuditAction,
  summarizeSnapshotDiff,
} from '../services/masterAuditService';

const card = {
  background: '#fff',
  borderRadius: 14,
  boxShadow: '0 1px 4px rgba(0,0,0,.06)',
  border: '1px solid #E6E8F0',
  overflow: 'hidden',
};

function formatTs(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

/**
 * @param {{ entityType: 'contact'|'organization'|'client_group', entityId: number, collapsible?: boolean }} props
 */
export default function MasterChangeLogSection({ entityType, entityId, collapsible = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(!collapsible);

  const load = useCallback(() => {
    if (!entityId) return;
    setLoading(true);
    setErr('');
    fetchMasterAuditLog(entityType, entityId)
      .then(setRows)
      .catch((e) => { setErr(e.message || 'Failed to load change log'); setRows([]); })
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  useEffect(() => { load(); }, [load]);

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#0B1F3B' }}>
      <History size={14} color="var(--portal-primary)" />
      Change log
    </div>
  );

  const body = (
    <>
      <p style={{ fontSize: 12, color: '#94a3b8', margin: collapsible ? '12px 0 16px' : '0 0 16px' }}>
        Track who changed this master record and what was updated.
      </p>
      {err && <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 12 }}>{err}</div>}
      {loading ? (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading change log…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>No changes recorded yet.</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((row) => {
            const before = row.before_snapshot || row.beforeSnapshot;
            const after = row.after_snapshot || row.afterSnapshot;
            const diffs = summarizeSnapshotDiff(before, after);
            const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
            return (
              <li
                key={String(row.id)}
                style={{
                  borderLeft: '3px solid var(--portal-primary)',
                  paddingLeft: 14,
                  paddingBottom: 12,
                  borderBottom: '1px solid #f1f5f9',
                }}
              >
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                  {formatTs(row.created_at || row.createdAt)}
                  {' · '}
                  <span style={{ fontWeight: 600, color: '#475569' }}>{row.actor_name || 'System'}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1F3B', marginBottom: 6 }}>
                  {formatMasterAuditAction(row.action)}
                </div>
                {meta.approval_id != null && (
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                    Approval #{meta.approval_id}
                    {meta.reject_reason ? ` — ${meta.reject_reason}` : ''}
                  </div>
                )}
                {diffs.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                    {diffs.slice(0, 8).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                    {diffs.length > 8 && <li>…and {diffs.length - 8} more</li>}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  if (collapsible) {
    return (
      <div style={card}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          {header}
          <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
        {open && <div style={{ padding: '0 18px 18px', borderTop: '1px solid #F1F5F9' }}>{body}</div>}
      </div>
    );
  }

  return (
    <div style={{ ...card, padding: 20 }}>
      {header}
      <div style={{ marginTop: 12 }}>{body}</div>
    </div>
  );
}

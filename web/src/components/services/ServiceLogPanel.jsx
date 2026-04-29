import { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Pin } from 'lucide-react';
import { getServiceLogs } from '../../services/serviceLogService';
import ServiceLogEntry from './ServiceLogEntry';
import AddLogModal from './AddLogModal';

/**
 * ServiceLogPanel — activity log feed for a single service engagement.
 *
 * Props:
 *   serviceId    {number|string}  — the engagement id
 *   isSuperAdmin {boolean}        — enables delete actions
 *   canEdit      {boolean}        — enables pin, resolve, remind actions
 */
export default function ServiceLogPanel({ serviceId, isSuperAdmin = false, canEdit = false }) {
  const [entries, setEntries]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!serviceId) return;
    setLoading(true);
    setError('');
    try {
      const rows = await getServiceLogs(serviceId);
      setEntries(rows);
    } catch (e) {
      setError(e.message || 'Failed to load activity log.');
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  function handleCreated(newEntry) {
    setEntries((prev) => {
      // Insert at top (pinned entries re-sorted client-side)
      const next = [newEntry, ...prev];
      return sortEntries(next);
    });
  }

  function handleUpdated(updated) {
    setEntries((prev) => {
      const next = prev.map((e) => (String(e.id) === String(updated.id) ? updated : e));
      return sortEntries(next);
    });
  }

  function handleDeleted(deletedId) {
    setEntries((prev) => prev.filter((e) => String(e.id) !== String(deletedId)));
  }

  const pinned   = entries.filter((e) => e.is_pinned);
  const unpinned = entries.filter((e) => !e.is_pinned);

  return (
    <div style={panelWrap}>
      {/* Header */}
      <div style={panelHeader}>
        <div style={headerLeft}>
          <span style={headerTitle}>Activity Log</span>
          <span style={countBadge}>{entries.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={fetchLogs} disabled={loading} style={iconBtn} title="Refresh">
            <RefreshCw size={14} style={{ color: '#64748b' }} />
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              style={btnAdd}
            >
              <Plus size={14} />
              Add Entry
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={panelBody}>
        {loading && (
          <div style={emptyState}>Loading activity log…</div>
        )}

        {!loading && error && (
          <div style={errBox}>{error}</div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div style={emptyState}>
            No activity logged yet.
            {canEdit && (
              <button type="button" onClick={() => setShowAddModal(true)} style={emptyAddBtn}>
                <Plus size={13} /> Add the first entry
              </button>
            )}
          </div>
        )}

        {/* Pinned entries section */}
        {!loading && pinned.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={sectionLabel}>
              <Pin size={12} style={{ marginRight: 5 }} />
              Pinned
            </div>
            <div style={entryList}>
              {pinned.map((e) => (
                <ServiceLogEntry
                  key={e.id}
                  entry={e}
                  serviceId={serviceId}
                  isSuperAdmin={isSuperAdmin}
                  canEdit={canEdit}
                  onUpdated={handleUpdated}
                  onDeleted={handleDeleted}
                />
              ))}
            </div>
          </div>
        )}

        {/* All other entries */}
        {!loading && unpinned.length > 0 && (
          <div style={entryList}>
            {unpinned.map((e) => (
              <ServiceLogEntry
                key={e.id}
                entry={e}
                serviceId={serviceId}
                isSuperAdmin={isSuperAdmin}
                canEdit={canEdit}
                onUpdated={handleUpdated}
                onDeleted={handleDeleted}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add log modal */}
      {showAddModal && (
        <AddLogModal
          serviceId={serviceId}
          onClose={() => setShowAddModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

// Sort: pinned first, then by created_at desc
function sortEntries(arr) {
  return [...arr].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

// ── Styles ────────────────────────────────────────────────────────────────────
const panelWrap = {
  display: 'flex', flexDirection: 'column', gap: 0,
  background: '#F6F7FB', borderRadius: 12,
  border: '1px solid #E6E8F0', overflow: 'hidden',
};
const panelHeader = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '14px 18px', background: '#fff', borderBottom: '1px solid #E6E8F0',
};
const headerLeft = { display: 'flex', alignItems: 'center', gap: 8 };
const headerTitle = { fontSize: 14, fontWeight: 700, color: '#0B1F3B' };
const countBadge = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: '#F1F5F9', color: '#64748b',
  fontSize: 11, fontWeight: 700, minWidth: 20, height: 20,
  borderRadius: 10, padding: '0 6px',
};
const iconBtn = {
  background: 'none', border: '1px solid #E6E8F0', borderRadius: 7,
  cursor: 'pointer', padding: '5px 8px', display: 'flex', alignItems: 'center',
};
const btnAdd = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '7px 14px', background: '#F37920', color: '#fff',
  border: 'none', borderRadius: 8, cursor: 'pointer',
  fontSize: 13, fontWeight: 600,
  boxShadow: '0 2px 6px rgba(243,121,32,0.25)',
};
const panelBody = { padding: '16px', display: 'flex', flexDirection: 'column', gap: 0, minHeight: 80 };
const sectionLabel = {
  fontSize: 11, fontWeight: 700, color: '#F37920',
  textTransform: 'uppercase', letterSpacing: '0.05em',
  display: 'flex', alignItems: 'center',
  marginBottom: 8,
};
const entryList = { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 };
const emptyState = {
  fontSize: 13, color: '#94a3b8', textAlign: 'center',
  padding: '28px 16px', display: 'flex', flexDirection: 'column',
  alignItems: 'center', gap: 10,
};
const emptyAddBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '8px 16px', background: '#F37920', color: '#fff',
  border: 'none', borderRadius: 8, cursor: 'pointer',
  fontSize: 13, fontWeight: 600,
};
const errBox = {
  background: '#FFF1F2', border: '1px solid #fecdd3', borderRadius: 8,
  padding: '10px 14px', fontSize: 13, color: '#dc2626',
};

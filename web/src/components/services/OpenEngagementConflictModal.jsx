import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';

const overlay = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,23,42,0.35)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};
const card = {
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  minWidth: 360,
  maxWidth: 480,
  width: '100%',
};
const header = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '14px 20px',
  borderBottom: '1px solid #F0F2F8',
};
const closeBtn = {
  background: '#F6F7FB',
  border: '1px solid #E6E8F0',
  borderRadius: 6,
  cursor: 'pointer',
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#64748b',
};
const body = { padding: '16px 20px 20px', fontSize: 13, color: '#334155', lineHeight: 1.5 };
const dl = { margin: '12px 0 0', display: 'grid', gap: 8 };
const row = { display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, alignItems: 'start' };
const dt = { fontWeight: 600, color: '#475569' };
const actions = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid #F0F2F8' };
const btnPrimary = {
  padding: '8px 16px',
  background: '#F37920',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};
const btnSecondary = {
  padding: '8px 14px',
  background: '#f8fafc',
  color: '#475569',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};

/**
 * @param {{ open: boolean, existing: Record<string, unknown>|null, onClose: () => void }} props
 */
export default function OpenEngagementConflictModal({ open, existing, onClose }) {
  const navigate = useNavigate();
  if (!open || !existing) return null;

  const id = existing.id;
  const idStr = id != null ? String(id) : '';
  const clientName = String(existing.client_name ?? existing.clientName ?? '—');
  const typeLabel = String(
    existing.engagement_type_name ?? existing.engagementTypeName ?? existing.service_type ?? existing.type ?? '—'
  );
  const serviceType = String(existing.service_type ?? existing.type ?? '');
  const status = String(existing.status ?? '—');
  const assignees = String(existing.assignee_names ?? existing.assigneeNames ?? existing.assigned_to_name ?? '—');

  function goToEngagement() {
    if (!idStr) return;
    onClose();
    navigate(`/services/${idStr}`);
  }

  return (
    <div style={overlay} role="presentation" onClick={onClose}>
      <div style={card} role="dialog" aria-modal="true" aria-labelledby="open-eng-conflict-title" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <span id="open-eng-conflict-title" style={{ fontSize: 14, fontWeight: 700, color: '#0B1F3B' }}>
            Open engagement already exists
          </span>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div style={body}>
          <p style={{ margin: 0 }}>
            You cannot create another engagement of this type for this client and assignee while the following record is still open.
            Set its status to <strong>completed</strong> or <strong>cancelled</strong> first, then try again.
          </p>
          <dl style={dl}>
            <div style={row}>
              <dt style={dt}>Engagement #</dt>
              <dd style={{ margin: 0 }}>{idStr || '—'}</dd>
            </div>
            <div style={row}>
              <dt style={dt}>Client</dt>
              <dd style={{ margin: 0 }}>{clientName}</dd>
            </div>
            <div style={row}>
              <dt style={dt}>Engagement type</dt>
              <dd style={{ margin: 0 }}>{typeLabel}</dd>
            </div>
            {serviceType && serviceType !== typeLabel ? (
              <div style={row}>
                <dt style={dt}>Service label</dt>
                <dd style={{ margin: 0 }}>{serviceType}</dd>
              </div>
            ) : null}
            <div style={row}>
              <dt style={dt}>Status</dt>
              <dd style={{ margin: 0 }}>{status}</dd>
            </div>
            <div style={row}>
              <dt style={dt}>Assignees</dt>
              <dd style={{ margin: 0 }}>{assignees}</dd>
            </div>
          </dl>
          <div style={actions}>
            <button type="button" style={btnSecondary} onClick={onClose}>
              Close
            </button>
            {idStr ? (
              <button type="button" style={btnPrimary} onClick={goToEngagement}>
                Open engagement
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

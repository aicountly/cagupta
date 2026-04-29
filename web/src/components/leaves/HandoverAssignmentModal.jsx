/**
 * HandoverAssignmentModal
 *
 * Shown when an admin clicks "Manage Handover" on a leave record.
 * Displays every service belonging to the on-leave employee and lets the admin
 * pick a substitute user for each one (partial allotment supported).
 * Already-assigned services show the current temp-user name and a Revoke button.
 */

import { useState, useEffect } from 'react';
import { getAllEngagements } from '../../services/engagementService';
import { createHandover, revokeAssignment } from '../../services/leaveService';

export default function HandoverAssignmentModal({ leave, staffUsers, onClose, onSaved }) {
  const [services, setServices]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [revoking, setRevoking]     = useState(null); // assignment id being revoked
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');

  // assignments: map service_id → { temp_user_id, existing_assignment }
  const [selections, setSelections] = useState({});

  const leaveUserId = Number(leave.user_id);

  // Build existing assignments map keyed by service_id for quick lookup
  const existingByService = {};
  (leave.assignments || []).forEach((a) => {
    existingByService[a.service_id] = a;
  });

  useEffect(() => {
    setLoading(true);
    getAllEngagements({ userId: leaveUserId })
      .then((data) => {
        const open = data.filter((s) => !['completed', 'cancelled'].includes(s.status));
        setServices(open);
        // Pre-fill selections from existing un-revoked assignments
        const init = {};
        open.forEach((s) => {
          const existing = existingByService[s.id];
          if (existing && !existing.revoked_at) {
            init[s.id] = String(existing.temp_user_id);
          } else {
            init[s.id] = '';
          }
        });
        setSelections(init);
      })
      .catch(() => setError('Failed to load services.'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaveUserId]);

  function setUserForService(serviceId, userId) {
    setSelections((prev) => ({ ...prev, [serviceId]: userId }));
  }

  async function handleSave() {
    setError('');
    setSuccess('');
    const assignments = Object.entries(selections)
      .filter(([, uid]) => uid !== '')
      .map(([sid, uid]) => ({ service_id: Number(sid), temp_user_id: Number(uid) }));

    if (!assignments.length) {
      setError('Select at least one substitute user for a service.');
      return;
    }

    setSaving(true);
    try {
      await createHandover(leave.id, assignments);
      setSuccess('Handover saved successfully.');
      onSaved?.();
    } catch (err) {
      setError(err.message || 'Failed to save handover.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(assignment) {
    if (!window.confirm(`Revoke temporary charge for "${assignment.service_type || 'this service'}"?`)) return;
    setRevoking(assignment.id);
    setError('');
    try {
      await revokeAssignment(leave.id, assignment.id);
      setSuccess('Handover revoked for that service.');
      onSaved?.();
      // Update local assignment list so the row clears immediately
      setSelections((prev) => ({ ...prev, [assignment.service_id]: '' }));
      // Mark in existingByService so the row re-renders as unassigned
      existingByService[assignment.service_id] = { ...assignment, revoked_at: new Date().toISOString() };
    } catch (err) {
      setError(err.message || 'Failed to revoke.');
    } finally {
      setRevoking(null);
    }
  }

  const eligibleStaff = staffUsers.filter((u) => Number(u.id) !== leaveUserId && u.is_active !== false);

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0B1F3B' }}>
              Manage Handover
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
              {leave.user_name} is on leave {leave.start_date} – {leave.end_date}
            </div>
          </div>
          <button onClick={onClose} style={styles.closeBtn} type="button">✕</button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {error   && <div style={styles.errorBanner}>{error}</div>}
          {success && <div style={styles.successBanner}>{success}</div>}

          {loading ? (
            <div style={{ color: '#64748b', fontSize: 13 }}>Loading services…</div>
          ) : services.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: 13 }}>
              No open services found for {leave.user_name}.
            </div>
          ) : (
            <>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>
                Select a substitute user for each service you want to hand over.
                Services left blank will not be handed over.
              </p>

              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Service</th>
                    <th style={styles.th}>Client</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Assign To</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((svc) => {
                    const existing = existingByService[svc.id];
                    const isActive = existing && !existing.revoked_at;
                    const isRevoking = revoking === existing?.id;

                    return (
                      <tr key={svc.id} style={isActive ? styles.rowActive : styles.row}>
                        <td style={styles.td}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#0B1F3B' }}>
                            {svc.type || svc.service_type}
                          </div>
                          {svc.financialYear && (
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{svc.financialYear}</div>
                          )}
                        </td>
                        <td style={styles.td}>
                          <span style={{ fontSize: 13, color: '#334155' }}>
                            {svc.clientName || svc.client_name}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <StatusPill status={svc.status} />
                        </td>
                        <td style={styles.td}>
                          {isActive ? (
                            <div style={{ fontSize: 13, color: '#0B1F3B', fontWeight: 600 }}>
                              {existing.temp_user_name}
                              <div style={{ fontSize: 11, color: '#55B848', fontWeight: 500, marginTop: 2 }}>
                                Assigned
                              </div>
                            </div>
                          ) : (
                            <select
                              value={selections[svc.id] || ''}
                              onChange={(e) => setUserForService(svc.id, e.target.value)}
                              style={styles.select}
                            >
                              <option value="">(not handed over)</option>
                              {eligibleStaff.map((u) => (
                                <option key={u.id} value={String(u.id)}>{u.name}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          {isActive && (
                            <button
                              type="button"
                              disabled={isRevoking}
                              onClick={() => handleRevoke(existing)}
                              style={styles.revokeBtn}
                            >
                              {isRevoking ? 'Revoking…' : 'Revoke'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            style={styles.saveBtn}
          >
            {saving ? 'Saving…' : 'Save Handover'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    not_started:  { bg: '#f1f5f9', color: '#475569' },
    in_progress:  { bg: '#dbeafe', color: '#1d4ed8' },
    pending_info: { bg: '#fef3c7', color: '#92400e' },
    review:       { bg: '#ede9fe', color: '#5b21b6' },
    completed:    { bg: '#dcfce7', color: '#166534' },
    cancelled:    { bg: '#f3f4f6', color: '#6b7280' },
  };
  const c = map[status] || { bg: '#f1f5f9', color: '#475569' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 8,
      fontSize: 11, fontWeight: 600, background: c.bg, color: c.color,
    }}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: 16, width: '90%', maxWidth: 840,
    maxHeight: '90vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 48px rgba(0,0,0,0.18)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '20px 24px 16px', borderBottom: '1px solid #E6E8F0',
  },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 18, cursor: 'pointer',
    color: '#94a3b8', lineHeight: 1, padding: '0 0 0 12px',
  },
  body: {
    padding: '20px 24px', overflowY: 'auto', flex: 1,
  },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 10,
    padding: '16px 24px', borderTop: '1px solid #E6E8F0',
  },
  errorBanner: {
    background: '#fee2e2', color: '#991b1b', borderRadius: 8,
    padding: '10px 14px', fontSize: 13, marginBottom: 14,
  },
  successBanner: {
    background: '#dcfce7', color: '#166534', borderRadius: 8,
    padding: '10px 14px', fontSize: 13, marginBottom: 14,
  },
  table: {
    width: '100%', borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.04em',
    padding: '8px 12px', borderBottom: '2px solid #E6E8F0',
  },
  td: {
    padding: '12px 12px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle',
  },
  row: { background: '#fff' },
  rowActive: { background: '#f0fdf4' },
  select: {
    padding: '6px 10px', border: '1px solid #E6E8F0', borderRadius: 8,
    fontSize: 13, background: '#fff', color: '#334155', outline: 'none',
    cursor: 'pointer', minWidth: 180,
  },
  revokeBtn: {
    padding: '5px 12px', border: '1px solid #fca5a5', borderRadius: 8,
    background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 600,
    cursor: 'pointer',
  },
  cancelBtn: {
    padding: '8px 20px', border: '1px solid #E6E8F0', borderRadius: 8,
    background: '#fff', color: '#334155', fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '8px 20px', border: 'none', borderRadius: 8,
    background: '#F37920', color: '#fff', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', boxShadow: '0 2px 8px rgba(243,121,32,0.30)',
  },
};

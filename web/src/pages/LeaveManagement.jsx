/**
 * LeaveManagement page — /admin/leaves
 *
 * Admin view to:
 *   - List all staff leave records
 *   - Create a new leave period for an employee
 *   - Open HandoverAssignmentModal to manage per-service temp handovers
 *   - Cancel a leave (revokes all handovers)
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useStaffUsers } from '../hooks/useStaffUsers';
import { getLeaves, createLeave, updateLeave } from '../services/leaveService';
import HandoverAssignmentModal from '../components/leaves/HandoverAssignmentModal';
import { Plus, Users, Calendar, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    active:    { bg: '#dcfce7', color: '#166534', label: 'Active' },
    cancelled: { bg: '#f3f4f6', color: '#6b7280', label: 'Cancelled' },
  };
  const c = map[status] || { bg: '#f1f5f9', color: '#475569', label: status };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 10,
      fontSize: 12, fontWeight: 600, background: c.bg, color: c.color,
    }}>
      {c.label}
    </span>
  );
}

// ── Create Leave Modal ────────────────────────────────────────────────────────

function CreateLeaveModal({ staffUsers, onClose, onCreated }) {
  const [form, setForm]     = useState({ user_id: '', start_date: '', end_date: '', reason: '' });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.user_id) { setError('Select an employee.'); return; }
    if (!form.start_date || !form.end_date) { setError('Both dates are required.'); return; }

    setSaving(true);
    try {
      const leave = await createLeave({
        user_id:    Number(form.user_id),
        start_date: form.start_date,
        end_date:   form.end_date,
        reason:     form.reason || undefined,
      });
      onCreated(leave);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create leave.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...modal, maxWidth: 480 }}>
        <div style={modalHeader}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>Mark Employee on Leave</span>
          <button onClick={onClose} style={closeBtn} type="button">✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
          {error && <div style={errorBanner}>{error}</div>}

          <label style={labelStyle}>Employee *</label>
          <select value={form.user_id} onChange={(e) => set('user_id', e.target.value)} style={inputStyle} required>
            <option value="">Select employee…</option>
            {staffUsers
              .filter((u) => u.is_active !== false)
              .sort((a, b) => String(a.name).localeCompare(String(b.name)))
              .map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
          </select>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
            <div>
              <label style={labelStyle}>Leave Start *</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => set('start_date', e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Leave End *</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => set('end_date', e.target.value)}
                min={form.start_date || undefined}
                style={inputStyle}
                required
              />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Reason (optional)</label>
            <textarea
              value={form.reason}
              onChange={(e) => set('reason', e.target.value)}
              style={{ ...inputStyle, height: 72, resize: 'vertical' }}
              placeholder="e.g. Annual leave, Medical…"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>Cancel</button>
            <button type="submit" disabled={saving} style={primaryBtnStyle}>
              {saving ? 'Creating…' : 'Create Leave'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Leave row (expandable) ────────────────────────────────────────────────────

function LeaveRow({ leave, staffUsers, onRefresh }) {
  const [expanded, setExpanded]     = useState(false);
  const [showHandover, setShowHandover] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const assignmentCount       = leave.assignment_count ?? 0;
  const activeAssignmentCount = leave.active_assignment_count ?? 0;

  async function handleCancel() {
    if (!window.confirm(`Cancel this leave for ${leave.user_name}? All handovers will be revoked.`)) return;
    setCancelling(true);
    try {
      await updateLeave(leave.id, { status: 'cancelled' });
      onRefresh();
    } catch (err) {
      alert(err.message || 'Failed to cancel leave.');
    } finally {
      setCancelling(false);
    }
  }

  const isCancelled = leave.status === 'cancelled';

  return (
    <>
      <tr style={tableRow}>
        <td style={td}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#0B1F3B' }}>{leave.user_name}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{leave.user_email}</div>
        </td>
        <td style={td}>
          <div style={{ fontSize: 13, color: '#334155' }}>
            {leave.start_date} – {leave.end_date}
          </div>
        </td>
        <td style={td}>
          <StatusBadge status={leave.status} />
        </td>
        <td style={td}>
          <span style={{ fontSize: 13, color: activeAssignmentCount > 0 ? '#166534' : '#94a3b8' }}>
            {activeAssignmentCount} active / {assignmentCount} total
          </span>
        </td>
        <td style={{ ...td, textAlign: 'right' }}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
            {!isCancelled && (
              <>
                <button
                  type="button"
                  onClick={() => setShowHandover(true)}
                  style={outlineBtnStyle}
                >
                  Manage Handover
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  style={dangerBtnStyle}
                >
                  {cancelling ? 'Cancelling…' : 'Cancel Leave'}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={iconBtnStyle}
              title={expanded ? 'Hide details' : 'Show details'}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded details row */}
      {expanded && (
        <tr>
          <td colSpan={5} style={{ padding: '0 0 12px 16px', background: '#F8FAFC' }}>
            <div style={{ paddingTop: 12 }}>
              {leave.reason && (
                <div style={{ fontSize: 13, color: '#475569', marginBottom: 10 }}>
                  <strong>Reason:</strong> {leave.reason}
                </div>
              )}
              {assignmentCount === 0 ? (
                <div style={{ fontSize: 13, color: '#94a3b8' }}>No handovers configured yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Service', 'Client', 'Assigned To', 'Status'].map((h) => (
                        <th key={h} style={{ ...th, fontSize: 11, padding: '6px 10px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(leave.assignments || []).map((a) => (
                      <tr key={a.id}>
                        <td style={{ padding: '6px 10px', color: '#0B1F3B', fontWeight: 500 }}>
                          {a.service_type}
                        </td>
                        <td style={{ padding: '6px 10px', color: '#334155' }}>{a.client_name}</td>
                        <td style={{ padding: '6px 10px', color: '#334155' }}>{a.temp_user_name}</td>
                        <td style={{ padding: '6px 10px' }}>
                          {a.revoked_at ? (
                            <span style={{ color: '#9ca3af', fontSize: 12 }}>Revoked</span>
                          ) : (
                            <span style={{ color: '#166534', fontSize: 12, fontWeight: 600 }}>Active</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}

      {showHandover && (
        <HandoverAssignmentModal
          leave={leave}
          staffUsers={staffUsers}
          onClose={() => setShowHandover(false)}
          onSaved={() => { onRefresh(); setShowHandover(false); }}
        />
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LeaveManagement() {
  const { user } = useAuth();
  const { staffUsers } = useStaffUsers();
  const [leaves, setLeaves]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showCreate, setShowCreate]   = useState(false);
  const [filterStatus, setFilterStatus] = useState('active');
  const [error, setError]             = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getLeaves({ status: filterStatus })
      .then(setLeaves)
      .catch((err) => setError(err.message || 'Failed to load leaves.'))
      .finally(() => setLoading(false));
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  function handleCreated(leave) {
    setLeaves((prev) => [leave, ...prev]);
    load();
  }

  return (
    <div style={pageWrap}>
      {/* Page header */}
      <div style={pageHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={iconWrap}><Users size={20} color="#F37920" /></div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#0B1F3B' }}>Leave Management</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
              Mark employees on leave and manage temporary service handovers
            </div>
          </div>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} style={primaryBtnStyle}>
          <Plus size={15} />
          Mark on Leave
        </button>
      </div>

      {/* Filter bar */}
      <div style={toolbar}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Calendar size={14} color="#64748b" />
          <span style={{ fontSize: 13, color: '#64748b' }}>Show:</span>
          {[
            { value: 'active',    label: 'Active Leaves' },
            { value: 'cancelled', label: 'Cancelled' },
            { value: '',          label: 'All' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilterStatus(opt.value)}
              style={{
                ...filterTabBtn,
                background: filterStatus === opt.value ? '#F37920' : '#fff',
                color:      filterStatus === opt.value ? '#fff' : '#475569',
                borderColor: filterStatus === opt.value ? '#F37920' : '#E6E8F0',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={errorBanner}>
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Table */}
      <div style={card}>
        {loading ? (
          <div style={{ fontSize: 13, color: '#64748b', padding: 20 }}>Loading…</div>
        ) : leaves.length === 0 ? (
          <div style={{ fontSize: 13, color: '#94a3b8', padding: 20, textAlign: 'center' }}>
            No leave records found.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E6E8F0' }}>
                {['Employee', 'Period', 'Status', 'Handovers', ''].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaves.map((leave) => (
                <LeaveRow
                  key={leave.id}
                  leave={leave}
                  staffUsers={staffUsers}
                  onRefresh={load}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateLeaveModal
          staffUsers={staffUsers}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageWrap = {
  padding: '24px', display: 'flex', flexDirection: 'column', gap: 20,
  background: '#F6F7FB', minHeight: '100%',
};
const pageHeader = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  background: '#fff', padding: '20px 24px', borderRadius: 14,
  border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
};
const iconWrap = {
  width: 44, height: 44, borderRadius: 12, background: '#FEF0E6',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};
const toolbar = {
  background: '#fff', padding: '12px 16px', borderRadius: 12,
  border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
};
const card = {
  background: '#fff', borderRadius: 14, border: '1px solid #E6E8F0',
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden',
};
const th = {
  textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b',
  textTransform: 'uppercase', letterSpacing: '0.04em',
  padding: '10px 16px',
};
const td = { padding: '14px 16px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle' };
const tableRow = { transition: 'background 0.15s' };

const primaryBtnStyle = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 18px', background: '#F37920', color: '#fff',
  border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
  boxShadow: '0 2px 8px rgba(243,121,32,0.30)',
};
const outlineBtnStyle = {
  padding: '6px 14px', border: '1px solid #E6E8F0', borderRadius: 8,
  background: '#fff', color: '#334155', fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
const dangerBtnStyle = {
  padding: '6px 14px', border: '1px solid #fca5a5', borderRadius: 8,
  background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
const iconBtnStyle = {
  background: 'none', border: '1px solid #E6E8F0', borderRadius: 8, cursor: 'pointer',
  padding: '5px 8px', display: 'flex', alignItems: 'center', color: '#64748b',
};
const filterTabBtn = {
  padding: '5px 14px', border: '1px solid', borderRadius: 8,
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
const cancelBtnStyle = {
  padding: '8px 18px', border: '1px solid #E6E8F0', borderRadius: 8,
  background: '#fff', color: '#334155', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const errorBanner = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: '#fee2e2', color: '#991b1b', borderRadius: 8,
  padding: '10px 14px', fontSize: 13,
};

// Modal shared styles
const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modal = {
  background: '#fff', borderRadius: 16, width: '90%',
  maxHeight: '90vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 24px 48px rgba(0,0,0,0.18)', overflow: 'hidden',
};
const modalHeader = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '20px 24px 16px', borderBottom: '1px solid #E6E8F0',
};
const closeBtn = {
  background: 'none', border: 'none', fontSize: 18, cursor: 'pointer',
  color: '#94a3b8', lineHeight: 1, padding: '0 0 0 12px',
};
const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#475569',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em',
};
const inputStyle = {
  width: '100%', padding: '8px 12px', border: '1px solid #E6E8F0', borderRadius: 8,
  fontSize: 13, color: '#0B1F3B', background: '#fff', outline: 'none',
  boxSizing: 'border-box',
};

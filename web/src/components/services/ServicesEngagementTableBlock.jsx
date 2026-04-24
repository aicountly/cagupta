import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTask, deleteEngagement, requestServiceDeleteOtp, updateEngagement } from '../../services/engagementService';
import StatusBadge from '../common/StatusBadge';
import DateInput from '../common/DateInput';
import { isEngagementOverdue } from '../../utils/serviceKpiFilters';
import { Plus, Pencil, FolderOpen, X, Trash2 } from 'lucide-react';

const ROW_STATUS_OPTIONS = ['not_started', 'in_progress', 'pending_info', 'review', 'completed', 'cancelled'];

function formatStatusLabel(s) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function AddTaskModal({ onClose, onSave }) {
  const [form, setForm] = useState({ title: '', assignedTo: '', dueDate: '', priority: 'medium' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.title.trim()) return;
    onSave(form);
    onClose();
  };
  return (
    <div style={overlayStyle}>
      <div style={taskModalStyle}>
        <div style={taskModalHeader}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0B1F3B' }}>➕ Add Task</span>
          <button onClick={onClose} type="button" style={taskModalClose}><X size={14} /></button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={taskLabelStyle}>
            Task Title *
            <input type="text" style={taskInputStyle} placeholder="e.g. Collect Form 16" value={form.title} onChange={e => set('title', e.target.value)} />
          </label>
          <label style={taskLabelStyle}>
            Assigned To
            <input type="text" style={taskInputStyle} placeholder="Staff name" value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={taskLabelStyle}>
              Due Date
              <DateInput style={taskInputStyle} value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
            </label>
            <label style={taskLabelStyle}>
              Priority
              <select style={taskInputStyle} value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
        </div>
        <div style={{ padding: '10px 20px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={taskBtnSecondary}>Cancel</button>
          <button type="button" onClick={handleSave} style={taskBtnPrimary}>Add Task</button>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ icon: Icon, title, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...actionBtn, background: hover ? '#FEF0E6' : '#F6F7FB', borderColor: hover ? 'rgba(243,121,32,0.4)' : '#E6E8F0', color: hover ? '#F37920' : '#64748b' }}
    >
      <Icon size={13} />
    </button>
  );
}

/**
 * @param {object} props
 * @param {object[]} props.rows
 * @param {function} props.setAllServices
 * @param {boolean} props.canEditService
 * @param {boolean} props.canDeleteService
 * @param {string} [props.emptyMessage]
 * @param {object[]} [props.allServicesForSelection] Full list to resolve `expandServiceId` (e.g. when filtered rows omit the id)
 * @param {string|number|null} [props.expandServiceId] Select this id in the side panel when it appears
 * @param {function} [props.onExpandConsumed]
 */
export default function ServicesEngagementTableBlock({
  rows,
  setAllServices,
  canEditService,
  canDeleteService,
  emptyMessage = 'No service engagements match your filters.',
  allServicesForSelection,
  expandServiceId,
  onExpandConsumed,
}) {
  const navigate = useNavigate();
  const [selectedService, setSelectedService] = useState(null);
  const [hoverRow, setHoverRow] = useState(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState(null);
  const [deleteOtp, setDeleteOtp] = useState('');
  const [deleteOtpSent, setDeleteOtpSent] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [requestingDeleteOtp, setRequestingDeleteOtp] = useState(false);

  useEffect(() => {
    if (expandServiceId == null) return;
    const list = (allServicesForSelection && allServicesForSelection.length > 0)
      ? allServicesForSelection
      : rows;
    if (!list.length) return;
    const found = list.find((s) => String(s.id) === String(expandServiceId));
    if (found) setSelectedService(found);
    onExpandConsumed?.();
  }, [expandServiceId, allServicesForSelection, rows, onExpandConsumed]);

  function handleAddTask(taskData) {
    if (!selectedService) return;
    createTask(selectedService.id, taskData)
      .then((updated) => {
        setAllServices((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        setSelectedService(updated);
      })
      .catch(() => {});
  }

  async function handleRowStatusChange(s, nextStatus) {
    if (!canEditService || nextStatus === s.status) return;
    if (nextStatus === 'cancelled') {
      const ok = window.confirm(`Mark this engagement as Cancelled for ${s.clientName}?`);
      if (!ok) return;
    }
    try {
      const updated = await updateEngagement(s.id, { status: nextStatus });
      setAllServices((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setSelectedService((cur) => (cur && cur.id === updated.id ? updated : cur));
    } catch {
      /* optional toast */
    }
  }

  function openDeleteModal(s) {
    setServiceToDelete(s);
    setDeleteOtp('');
    setDeleteOtpSent(false);
    setDeleteErr('');
  }

  async function sendRowDeleteOtp() {
    if (!serviceToDelete) return;
    setRequestingDeleteOtp(true);
    setDeleteErr('');
    try {
      await requestServiceDeleteOtp(serviceToDelete.id);
      setDeleteOtpSent(true);
    } catch (e) {
      setDeleteErr(e.message || 'Failed to send OTP.');
    } finally {
      setRequestingDeleteOtp(false);
    }
  }

  async function confirmRowDelete() {
    if (!serviceToDelete) return;
    if (!deleteOtp.trim()) {
      setDeleteErr('Enter the superadmin OTP.');
      return;
    }
    setDeleteBusy(true);
    setDeleteErr('');
    try {
      await deleteEngagement(serviceToDelete.id, { superadminOtp: deleteOtp.trim() });
      setAllServices((prev) => prev.filter((x) => x.id !== serviceToDelete.id));
      setSelectedService((cur) => (cur && cur.id === serviceToDelete.id ? null : cur));
      setServiceToDelete(null);
    } catch (e) {
      setDeleteErr(e.message || 'Delete failed.');
    } finally {
      setDeleteBusy(false);
    }
  }

  const serviceTasks = selectedService
    ? (Array.isArray(selectedService.tasks) ? selectedService.tasks : [])
    : [];
  const completedTasks = serviceTasks.filter((t) => t.status === 'done').length;
  const progress = serviceTasks.length ? Math.round((completedTasks / serviceTasks.length) * 100) : 0;

  return (
    <>
      {showAddTask && selectedService && (
        <AddTaskModal onClose={() => setShowAddTask(false)} onSave={handleAddTask} />
      )}
      {serviceToDelete && (
        <div style={deleteEngOverlayStyle}>
          <div style={deleteEngModalStyle}>
            <div style={deleteEngHeaderStyle}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#b91c1c' }}>Delete service engagement</span>
              <button type="button" onClick={() => setServiceToDelete(null)} style={deleteEngCloseStyle}>✕</button>
            </div>
            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: '#334155', margin: 0 }}>
                Permanently delete <strong>{serviceToDelete.clientName}</strong> — {serviceToDelete.type || 'service'}? This cannot be undone.
              </p>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Request a superadmin OTP, then enter it to confirm.</p>
              {deleteErr && <div style={{ color: '#dc2626', fontSize: 13 }}>{deleteErr}</div>}
              <button type="button" style={deleteEngBtnSecondary} disabled={requestingDeleteOtp} onClick={sendRowDeleteOtp}>
                {requestingDeleteOtp && !deleteOtpSent ? 'Sending…' : 'Request superadmin OTP'}
              </button>
              {deleteOtpSent && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>Code sent</span>}
              <label style={deleteEngLabelStyle}>
                Superadmin OTP *
                <input
                  type="text"
                  style={deleteEngInputStyle}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={deleteOtp}
                  onChange={(e) => setDeleteOtp(e.target.value.replace(/\s/g, ''))}
                />
              </label>
            </div>
            <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setServiceToDelete(null)} style={deleteEngBtnSecondary}>Cancel</button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={confirmRowDelete}
                style={{ ...deleteEngBtnPrimary, background: '#b91c1c' }}
              >
                {deleteBusy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: selectedService ? '1fr 380px' : '1fr', gap: 16 }}>
        <div style={tableCard}>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  {['Client', 'Service', 'FY', 'Assigned To', 'Due Date', 'Fee', 'Status', 'Actions'].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((s, idx) => {
                  const isActive = selectedService?.id === s.id;
                  const isHover = hoverRow === s.id;
                  const isOdd = idx % 2 === 0;
                  const isOverdue = isEngagementOverdue(s);
                  let rowBg = isOdd ? '#FAFBFD' : '#ffffff';
                  if (isActive) rowBg = '#FEF0E6';
                  else if (isHover) rowBg = '#FFF5EE';
                  return (
                    <tr
                      key={s.id}
                      style={{ ...trStyle, background: rowBg, cursor: 'pointer' }}
                      onClick={() => setSelectedService(isActive ? null : s)}
                      onMouseEnter={() => setHoverRow(s.id)}
                      onMouseLeave={() => setHoverRow(null)}
                    >
                      <td style={tdStyle}>
                        <div style={clientCell}>
                          <div style={clientAvatar}>{s.clientName[0]}</div>
                          <span style={{ fontWeight: 600, color: '#0B1F3B' }}>{s.clientName}</span>
                        </div>
                      </td>
                      <td style={tdStyle}><span style={serviceTag}>{s.type}</span></td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{s.financialYear}</td>
                      <td style={tdStyle}>{s.assignedTo}</td>
                      <td style={{ ...tdStyle, color: isOverdue ? '#ef4444' : '#334155', fontWeight: isOverdue ? 600 : 400 }}>
                        {s.dueDate}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: '#0B1F3B' }}>
                        {s.feeAgreed != null && !Number.isNaN(Number(s.feeAgreed))
                          ? `₹${Number(s.feeAgreed).toLocaleString('en-IN')}`
                          : '—'}
                      </td>
                      <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                        {canEditService ? (
                          <select
                            value={s.status}
                            onChange={(e) => handleRowStatusChange(s, e.target.value)}
                            style={rowStatusSelectStyle}
                            title="Status"
                          >
                            {ROW_STATUS_OPTIONS.map((st) => (
                              <option key={st} value={st}>{formatStatusLabel(st)}</option>
                            ))}
                          </select>
                        ) : (
                          <StatusBadge status={s.status} />
                        )}
                      </td>
                      <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <ActionBtn icon={Pencil} title="Manage" onClick={() => navigate(`/services/${s.id}`)} />
                          <ActionBtn icon={FolderOpen} title="View Files" onClick={() => navigate(`/services/${s.id}/files`)} />
                          {canDeleteService && (
                            <ActionBtn icon={Trash2} title="Delete" onClick={() => openDeleteModal(s)} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                      {emptyMessage}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={tableFooter}>
            <span>{rows.length} engagement{rows.length !== 1 ? 's' : ''}</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Live Data</span>
          </div>
        </div>

        {selectedService && (
          <div style={sidePanel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0B1F3B' }}>{selectedService.type}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{selectedService.clientName} · {selectedService.financialYear}</div>
              </div>
              <button type="button" onClick={() => setSelectedService(null)} style={closeBtn}>
                <X size={14} />
              </button>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                <span style={{ fontWeight: 500 }}>Progress</span>
                <span style={{ fontWeight: 600, color: '#0B1F3B' }}>{completedTasks}/{serviceTasks.length} tasks</span>
              </div>
              <div style={progressTrack}>
                <div style={{ ...progressFill, width: `${progress}%` }} />
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{progress}% complete</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#0B1F3B' }}>Tasks</span>
              <button type="button" style={btnSecondary} onClick={() => setShowAddTask(true)}><Plus size={12} /> Add Task</button>
            </div>

            {serviceTasks.length === 0 && (
              <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No tasks yet.</div>
            )}
            {serviceTasks.map((t) => (
              <div key={t.id} style={taskRow}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1, minWidth: 0 }}>
                    <div style={{ ...taskDot, background: t.status === 'done' ? '#55B848' : t.status === 'in_progress' ? '#F37920' : '#e2e8f0', marginTop: 4, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: t.status === 'done' ? 400 : 600, textDecoration: t.status === 'done' ? 'line-through' : 'none', color: t.status === 'done' ? '#94a3b8' : '#1e293b' }}>
                      {t.title}
                    </span>
                  </div>
                  <StatusBadge status={t.priority} />
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, paddingLeft: 20 }}>{t.assignedTo} · Due: {t.dueDate}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

const tableCard = { background: '#fff', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = {
  textAlign: 'left', padding: '12px 14px',
  color: '#64748b', fontWeight: 600, fontSize: 11,
  borderBottom: '2px solid #F0F2F8',
  background: '#F8FAFC',
  whiteSpace: 'nowrap',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  position: 'sticky', top: 0, zIndex: 1,
};
const tdStyle = { padding: '12px 14px', color: '#334155', verticalAlign: 'middle', whiteSpace: 'nowrap', borderBottom: '1px solid #F0F2F8' };
const trStyle = { transition: 'background 0.12s' };

const clientCell = { display: 'flex', alignItems: 'center', gap: 9 };
const clientAvatar = {
  width: 28, height: 28, borderRadius: 8,
  background: 'linear-gradient(135deg, #F37920 0%, #f5a623 100%)',
  color: '#fff', fontWeight: 700, fontSize: 11,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};
const serviceTag = {
  background: '#FEF0E6', color: '#C25A0A',
  padding: '2px 8px', borderRadius: 5,
  fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
};
const actionBtn = {
  width: 28, height: 28,
  border: '1px solid',
  borderRadius: 6,
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.15s',
  padding: 0,
};
const tableFooter = {
  padding: '10px 16px',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  borderTop: '1px solid #F0F2F8',
  fontSize: 12, color: '#94a3b8', fontWeight: 500,
};

const sidePanel = { background: '#fff', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', padding: 20, overflowY: 'auto', alignSelf: 'start' };
const closeBtn = { background: '#F6F7FB', border: '1px solid #E6E8F0', borderRadius: 6, cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0 };
const progressTrack = { height: 7, background: '#E6E8F0', borderRadius: 99, overflow: 'hidden' };
const progressFill = { height: '100%', background: 'linear-gradient(90deg, #55B848 0%, #7dcc72 100%)', borderRadius: 99, transition: 'width 0.4s ease' };
const taskRow = { padding: '10px 0', borderBottom: '1px solid #F6F7FB' };
const taskDot = { width: 8, height: 8, borderRadius: '50%' };

const selectStyle = { padding: '7px 12px', border: '1px solid #E6E8F0', borderRadius: 8, fontSize: 13, background: '#fff', color: '#334155', outline: 'none', cursor: 'pointer' };
const rowStatusSelectStyle = {
  ...selectStyle,
  padding: '5px 8px',
  fontSize: 12,
  maxWidth: 140,
  cursor: 'pointer',
};
const btnSecondary = { display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#FEF0E6', color: '#F37920', border: '1px solid rgba(243,121,32,0.35)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 };

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const taskModalStyle = { background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', minWidth: 400, maxWidth: 480, width: '100%' };
const taskModalHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #F0F2F8' };
const taskModalClose = { background: '#F6F7FB', border: '1px solid #E6E8F0', borderRadius: 6, cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' };
const taskLabelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' };
const taskInputStyle = { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, color: '#334155', outline: 'none' };
const taskBtnPrimary = { padding: '7px 14px', background: '#F37920', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const taskBtnSecondary = { padding: '7px 14px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 };

const deleteEngOverlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const deleteEngModalStyle = { background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', minWidth: 400, maxWidth: 480, width: '100%' };
const deleteEngHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #F0F2F8' };
const deleteEngCloseStyle = { background: '#F6F7FB', border: '1px solid #E6E8F0', borderRadius: 6, cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' };
const deleteEngLabelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' };
const deleteEngInputStyle = { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, color: '#334155', outline: 'none', width: '100%', boxSizing: 'border-box' };
const deleteEngBtnSecondary = { padding: '8px 14px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const deleteEngBtnPrimary = { padding: '8px 14px', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };

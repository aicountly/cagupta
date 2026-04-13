import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Plus, X, CheckSquare, Square } from 'lucide-react';
import DateInput from '../components/common/DateInput';
import { useStaffUsers } from '../hooks/useStaffUsers';
import { getEngagement, updateEngagement, createTask } from '../services/engagementService';

const STATUS_OPTIONS = ['not_started', 'in_progress', 'pending_info', 'review', 'completed', 'cancelled'];

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
          <button type="button" onClick={onClose} style={taskModalClose}><X size={14} /></button>
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

export default function ServiceEngagementEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { staffUsers } = useStaffUsers();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [serviceType, setServiceType] = useState('');
  const [fy, setFy] = useState('');
  const [status, setStatus] = useState('not_started');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [fee, setFee] = useState('');
  const [notes, setNotes] = useState('');
  const [tasks, setTasks] = useState([]);
  const [showAddTask, setShowAddTask] = useState(false);
  const [assigneeFallbackName, setAssigneeFallbackName] = useState('');

  const staffOptions = useMemo(() => {
    const list = [...staffUsers];
    if (assigneeId && !list.some(s => String(s.id) === String(assigneeId))) {
      list.unshift({
        id: assigneeId,
        name: assigneeFallbackName || `Assigned (ID ${assigneeId})`,
      });
    }
    return list;
  }, [staffUsers, assigneeId, assigneeFallbackName]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    getEngagement(id)
      .then(eng => {
        setServiceType(eng.type || '');
        setFy(eng.financialYear || '');
        setStatus(eng.status || 'not_started');
        setAssigneeId(eng.assignedToUserId != null ? String(eng.assignedToUserId) : '');
        setAssigneeFallbackName(eng.assignedToUserId ? (eng.assignedTo || `User #${eng.assignedToUserId}`) : '');
        setDueDate(eng.dueDate || '');
        setFee(eng.feeAgreed != null && !Number.isNaN(Number(eng.feeAgreed)) ? String(eng.feeAgreed) : '');
        setNotes(eng.notes || '');
        setTasks(Array.isArray(eng.tasks) ? eng.tasks.map(t => ({ ...t })) : []);
      })
      .catch(e => setError(e.message || 'Could not load engagement.'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    setError('');
    setToast('');
    try {
      await updateEngagement(id, {
        status,
        assignedTo: assigneeId === '' ? null : assigneeId,
        dueDate,
        feeAgreed: fee.trim() === '' ? null : fee,
        notes,
        tasks,
        type: serviceType.trim(),
        financialYear: fy.trim(),
      });
      setToast('Engagement saved');
      setTimeout(() => setToast(''), 2000);
    } catch (e) {
      setError(e.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  function handleAddTask(taskData) {
    if (!id) return;
    createTask(id, taskData)
      .then(updated => {
        setTasks(Array.isArray(updated.tasks) ? updated.tasks.map(t => ({ ...t })) : []);
        setToast('Task added');
        setTimeout(() => setToast(''), 1500);
      })
      .catch(e => setError(e.message || 'Could not add task.'));
  }

  function toggleTaskDone(taskId) {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const next = t.status === 'done' ? 'not_started' : 'done';
      return { ...t, status: next };
    }));
  }

  if (loading) {
    return (
      <div style={pageWrap}>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading engagement…</div>
      </div>
    );
  }

  if (error && !serviceType && !fy && tasks.length === 0) {
    return (
      <div style={pageWrap}>
        <div style={errBox}>{error}</div>
        <button type="button" style={btnSecondary} onClick={() => navigate('/services')}>Back to Services</button>
      </div>
    );
  }

  return (
    <div style={pageWrap}>
      {showAddTask && <AddTaskModal onClose={() => setShowAddTask(false)} onSave={handleAddTask} />}
      {toast && <div style={toastBar}>{toast}</div>}

      <div style={breadcrumbRow}>
        <span style={crumb} onClick={() => navigate('/')} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && navigate('/')}>Home</span>
        <ChevronRight size={13} color="#94a3b8" />
        <span style={crumb} onClick={() => navigate('/services')} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && navigate('/services')}>Services &amp; Tasks</span>
        <ChevronRight size={13} color="#94a3b8" />
        <span style={crumbActive}>Edit engagement</span>
      </div>

      <div style={pageTitle}>Edit Service Engagement</div>

      {error && <div style={errBox}>{error}</div>}

      <div style={formGrid}>
        <section style={sectionCard}>
          <div style={sectionTitle}>Client &amp; service</div>
          <div style={metaLine}><span style={metaKey}>Record</span> #{id}</div>
          <label style={fieldLabel}>
            Service type / description
            <input value={serviceType} onChange={e => setServiceType(e.target.value)} style={inputStyle} placeholder="e.g. ITR filing" />
          </label>
          <label style={{ ...fieldLabel, marginTop: 14 }}>
            Financial year
            <input value={fy} onChange={e => setFy(e.target.value)} style={inputStyle} placeholder="e.g. 2025-26" />
          </label>
        </section>

        <section style={sectionCard}>
          <div style={sectionTitle}>Engagement details</div>
          <div style={twoCol}>
            <label style={fieldLabel}>
              Status
              <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </label>
            <label style={fieldLabel}>
              Assigned to
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} style={selectStyle}>
                <option value="">Unassigned</option>
                {staffOptions.map(s => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ ...twoCol, marginTop: 14 }}>
            <label style={fieldLabel}>
              Due date
              <DateInput value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
            </label>
            <label style={fieldLabel}>
              Fee (₹)
              <div style={feeWrap}>
                <span style={feePrefix}>₹</span>
                <input
                  type="number"
                  min="0"
                  value={fee}
                  onChange={e => setFee(e.target.value)}
                  placeholder="0"
                  style={{ ...inputStyle, borderRadius: '0 8px 8px 0', borderLeft: 'none', paddingLeft: 8 }}
                />
              </div>
            </label>
          </div>
          <label style={{ ...fieldLabel, marginTop: 14 }}>
            Notes
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Optional notes…" style={textareaStyle} />
          </label>
        </section>

        <section style={sectionCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={sectionTitle}>Tasks</div>
            <button type="button" style={btnSmall} onClick={() => setShowAddTask(true)}><Plus size={14} /> Add task</button>
          </div>
          <p style={hint}>Check off items locally, then click <strong>Save changes</strong> to persist task status. New tasks are saved immediately.</p>
          {tasks.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>No tasks yet.</div>}
          {tasks.map((t, i) => (
            <div
              key={t.id || `task-${i}`}
              style={taskRow}
              role="button"
              tabIndex={0}
              onClick={() => t.id && toggleTaskDone(t.id)}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && t.id && toggleTaskDone(t.id)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
                <span style={{ marginTop: 2, flexShrink: 0, display: 'flex' }}>
                  {t.status === 'done' ? <CheckSquare size={18} color="#55B848" /> : <Square size={18} color="#94a3b8" />}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: t.status === 'done' ? 400 : 600, textDecoration: t.status === 'done' ? 'line-through' : 'none', color: t.status === 'done' ? '#94a3b8' : '#1e293b' }}>
                    {t.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    {[t.assignedTo, t.dueDate ? `Due ${t.dueDate}` : null].filter(Boolean).join(' · ') || ' '}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      </div>

      <div style={actionRow}>
        <button type="button" style={btnSecondary} onClick={() => navigate('/services')}>Cancel</button>
        <button type="button" style={btnPrimary} disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  );
}

const pageWrap = { padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, background: '#F6F7FB', minHeight: '100%' };
const breadcrumbRow = { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' };
const crumb = { fontSize: 12, color: '#94a3b8', fontWeight: 500, cursor: 'pointer' };
const crumbActive = { fontSize: 12, color: '#F37920', fontWeight: 600 };
const pageTitle = { fontSize: 22, fontWeight: 700, color: '#0B1F3B', lineHeight: 1.2 };
const formGrid = { display: 'flex', flexDirection: 'column', gap: 16 };
const sectionCard = {
  background: '#fff', borderRadius: 14, border: '1px solid #E6E8F0',
  padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
};
const sectionTitle = { fontSize: 14, fontWeight: 700, color: '#0B1F3B', marginBottom: 4 };
const metaLine = { fontSize: 12, color: '#64748b', marginBottom: 14 };
const metaKey = { fontWeight: 600, color: '#475569', marginRight: 6 };
const fieldLabel = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600, color: '#475569' };
const twoCol = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 };
const inputStyle = {
  width: '100%', padding: '8px 12px', border: '1px solid #E6E8F0', borderRadius: 8,
  fontSize: 13, color: '#334155', outline: 'none', background: '#fff', boxSizing: 'border-box',
};
const selectStyle = { ...inputStyle, cursor: 'pointer' };
const textareaStyle = { ...inputStyle, resize: 'vertical', fontFamily: 'inherit' };
const feeWrap = { display: 'flex', alignItems: 'center' };
const feePrefix = {
  padding: '8px 10px', background: '#F6F7FB', border: '1px solid #E6E8F0',
  borderRight: 'none', borderRadius: '8px 0 0 8px', fontSize: 13, color: '#64748b', fontWeight: 600, flexShrink: 0,
};
const hint = { fontSize: 12, color: '#64748b', margin: '0 0 12px', lineHeight: 1.45 };
const taskRow = {
  display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F0F2F8', cursor: 'pointer',
};
const btnSmall = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px',
  background: '#FEF0E6', color: '#F37920', border: '1px solid rgba(243,121,32,0.35)', borderRadius: 6,
  cursor: 'pointer', fontSize: 12, fontWeight: 600,
};
const actionRow = { display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 };
const btnPrimary = {
  padding: '10px 22px', background: '#F37920', color: '#fff', border: 'none', borderRadius: 8,
  cursor: 'pointer', fontSize: 14, fontWeight: 600, boxShadow: '0 2px 8px rgba(243,121,32,0.30)',
};
const btnSecondary = {
  padding: '10px 18px', background: '#fff', color: '#64748b', border: '1px solid #E6E8F0', borderRadius: 8,
  cursor: 'pointer', fontSize: 14, fontWeight: 600,
};
const errBox = { background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13 };
const toastBar = {
  position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
  background: '#0B1F3B', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
};

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const taskModalStyle = { background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', minWidth: 400, maxWidth: 480, width: '100%' };
const taskModalHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #F0F2F8' };
const taskModalClose = { background: '#F6F7FB', border: '1px solid #E6E8F0', borderRadius: 6, cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' };
const taskLabelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' };
const taskInputStyle = { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, color: '#334155', outline: 'none' };
const taskBtnPrimary = { padding: '7px 14px', background: '#F37920', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const taskBtnSecondary = { padding: '7px 14px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 };

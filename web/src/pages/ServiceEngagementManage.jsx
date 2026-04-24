import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Plus, X, CheckSquare, Square, Trash2, FolderOpen, History } from 'lucide-react';
import DateInput from '../components/common/DateInput';
import { localDateKey, engagementDueDateKey } from '../utils/serviceKpiFilters';
import { useStaffUsers } from '../hooks/useStaffUsers';
import { useAuth } from '../auth/AuthContext';
import {
  getEngagement,
  updateEngagement,
  createTask,
  deleteEngagement,
  requestServiceClientFacingOtp,
  getServiceAuditLog,
} from '../services/engagementService';
import { getApprovedAffiliates } from '../services/affiliateAdminService';
import { getTimeEntries, createTimeEntry, TIME_ACTIVITY_TYPES } from '../services/timeEntryService';

const STATUS_OPTIONS = ['not_started', 'in_progress', 'pending_info', 'review', 'completed', 'cancelled'];

const COMMISSION_MODE_LABELS = {
  referral_only: 'Referral only (tiered %)',
  direct_interaction: 'Direct interaction (50/50 split)',
};

function AuditMetaDetails({ row }) {
  let meta = row.metadata;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = {};
    }
  }
  if (!meta || typeof meta !== 'object') meta = {};
  const keys = Object.keys(meta).filter((k) => meta[k] != null && meta[k] !== '');
  if (keys.length === 0) {
    return <div style={{ fontSize: 12, color: '#94a3b8' }}>No extra detail.</div>;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#64748b' }}>
      {keys.slice(0, 6).map((k) => (
        <li key={k} style={{ marginBottom: 4 }}>
          <strong style={{ color: '#475569' }}>{k}:</strong>{' '}
          {typeof meta[k] === 'object' ? JSON.stringify(meta[k]) : String(meta[k])}
        </li>
      ))}
    </ul>
  );
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

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'team', label: 'Team' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'time', label: 'Time' },
  { id: 'activity', label: 'Activity' },
];

export default function ServiceEngagementManage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, session } = useAuth();
  const canDeleteService = hasPermission('services.delete');
  const canLogTimePermission = hasPermission('services.edit');
  const canManageTeamRates = hasPermission('users.manage');
  const { staffUsers } = useStaffUsers();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [serviceType, setServiceType] = useState('');
  const [fy, setFy] = useState('');
  const [status, setStatus] = useState('not_started');
  const [clientName, setClientName] = useState('');
  const [assigneeUserIds, setAssigneeUserIds] = useState([]);
  const [tab, setTab] = useState('overview');
  const [auditRows, setAuditRows] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [initialDueDate, setInitialDueDate] = useState('');
  const [fee, setFee] = useState('');
  const [notes, setNotes] = useState('');
  const [tasks, setTasks] = useState([]);
  const [billingClosure, setBillingClosure] = useState(null);
  const [timeEntries, setTimeEntries] = useState([]);
  const [timeLoading, setTimeLoading] = useState(false);
  const [timeError, setTimeError] = useState('');
  const [timeSaving, setTimeSaving] = useState(false);
  const [timeForm, setTimeForm] = useState(() => ({
    workDate: new Date().toISOString().slice(0, 10),
    durationMinutes: '60',
    activityType: 'client_work',
    isBillable: true,
    taskId: '',
    notes: '',
    userId: '',
  }));
  const [showAddTask, setShowAddTask] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [referringAffiliateUserId, setReferringAffiliateUserId] = useState('');
  const [commissionMode, setCommissionMode] = useState('referral_only');
  const [clientFacingRestricted, setClientFacingRestricted] = useState(false);
  const [initialClientFacing, setInitialClientFacing] = useState(false);
  const [cfOtp, setCfOtp] = useState('');
  const [requestingCfOtp, setRequestingCfOtp] = useState(false);
  const [approvedAffiliates, setApprovedAffiliates] = useState([]);

  const canLogTime = useMemo(() => {
    if (['completed', 'cancelled'].includes(status)) return false;
    const bc = billingClosure || '';
    if (['built', 'non_billable'].includes(bc)) return false;
    return true;
  }, [status, billingClosure]);

  const openTasksForTime = useMemo(
    () => tasks.filter((t) => t.id && t.status !== 'done'),
    [tasks],
  );

  const staffOptionsForTeam = useMemo(() => {
    const list = [...staffUsers];
    const seen = new Set(list.map((u) => String(u.id)));
    for (const uid of assigneeUserIds) {
      if (!seen.has(String(uid))) {
        seen.add(String(uid));
        list.push({ id: uid, name: `User #${uid}` });
      }
    }
    return list;
  }, [staffUsers, assigneeUserIds]);

  function toggleTeamMember(userId) {
    const idStr = String(userId);
    setAssigneeUserIds((prev) => {
      const has = prev.some((x) => String(x) === idStr);
      if (has) return prev.filter((x) => String(x) !== idStr);
      return [...prev, Number(userId)];
    });
  }

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    getEngagement(id)
      .then(eng => {
        setClientName(eng.clientName || '');
        setServiceType(eng.type || '');
        setFy(eng.financialYear || '');
        setStatus(eng.status || 'not_started');
        const ids = Array.isArray(eng.assigneeUserIds) && eng.assigneeUserIds.length > 0
          ? eng.assigneeUserIds.map(Number)
          : (eng.assignedToUserId != null ? [eng.assignedToUserId] : []);
        setAssigneeUserIds(ids);
        const d0 = eng.dueDate || '';
        setDueDate(d0);
        setInitialDueDate(d0);
        setFee(eng.feeAgreed != null && !Number.isNaN(Number(eng.feeAgreed)) ? String(eng.feeAgreed) : '');
        setNotes(eng.notes || '');
        setTasks(Array.isArray(eng.tasks) ? eng.tasks.map(t => ({ ...t })) : []);
        setBillingClosure(eng.billingClosure != null && eng.billingClosure !== '' ? eng.billingClosure : null);
        setReferringAffiliateUserId(eng.referringAffiliateUserId != null ? String(eng.referringAffiliateUserId) : '');
        setCommissionMode(eng.commissionMode || 'referral_only');
        const cfr = Boolean(eng.clientFacingRestricted);
        setClientFacingRestricted(cfr);
        setInitialClientFacing(cfr);
        setCfOtp('');
      })
      .catch(e => setError(e.message || 'Could not load engagement.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    getApprovedAffiliates()
      .then(setApprovedAffiliates)
      .catch(() => setApprovedAffiliates([]));
  }, []);

  const affiliateReadonlyLabel = useMemo(() => {
    if (!referringAffiliateUserId) return 'None';
    const a = approvedAffiliates.find((x) => String(x.id) === String(referringAffiliateUserId));
    return a ? `${a.name} (${a.email})` : `Linked user #${referringAffiliateUserId}`;
  }, [referringAffiliateUserId, approvedAffiliates]);

  const commissionReadonlyLabel = COMMISSION_MODE_LABELS[commissionMode] || commissionMode;

  useEffect(() => {
    if (session?.user?.id) {
      setTimeForm((f) => (f.userId ? f : { ...f, userId: String(session.user.id) }));
    }
  }, [session]);

  useEffect(() => {
    if (!id) return;
    setTimeLoading(true);
    setTimeError('');
    getTimeEntries(id)
      .then(setTimeEntries)
      .catch((e) => setTimeError(e.message || 'Could not load time entries.'))
      .finally(() => setTimeLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || tab !== 'activity') return;
    setAuditLoading(true);
    setAuditError('');
    getServiceAuditLog(id)
      .then(setAuditRows)
      .catch((e) => {
        setAuditError(e.message || 'Could not load activity.');
        setAuditRows([]);
      })
      .finally(() => setAuditLoading(false));
  }, [id, tab]);

  async function handleSave() {
    if (!id) return;
    const todayKey = localDateKey(new Date());
    const dueKey = engagementDueDateKey(dueDate);
    const initialKey = engagementDueDateKey(initialDueDate);
    if (dueKey && dueKey < todayKey && dueKey !== initialKey) {
      setError('Due date cannot be in the past.');
      return;
    }
    setSaving(true);
    setError('');
    setToast('');
    try {
      const payload = {
        status,
        assigneeUserIds,
        dueDate,
        feeAgreed: fee.trim() === '' ? null : fee,
        notes,
        tasks,
        type: serviceType.trim(),
        financialYear: fy.trim(),
      };
      let updated;
      if (clientFacingRestricted !== initialClientFacing) {
        payload.clientFacingRestricted = clientFacingRestricted;
        updated = await updateEngagement(id, payload, { superadminOtp: cfOtp.trim() });
      } else {
        updated = await updateEngagement(id, payload);
      }
      if (Array.isArray(updated.assigneeUserIds)) {
        setAssigneeUserIds(updated.assigneeUserIds);
      }
      setInitialClientFacing(clientFacingRestricted);
      setCfOtp('');
      setInitialDueDate(updated.dueDate || '');
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

  function removeTask(taskId) {
    if (!taskId) return;
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }

  async function handleSaveTimeEntry(e) {
    e.preventDefault();
    if (!id || !canLogTimePermission) return;
    const mins = parseInt(timeForm.durationMinutes, 10);
    if (!Number.isFinite(mins) || mins < 1 || mins > 1440) {
      setTimeError('Duration must be between 1 and 1440 minutes.');
      return;
    }
    setTimeSaving(true);
    setTimeError('');
    try {
      const payload = {
        work_date: timeForm.workDate,
        duration_minutes: mins,
        activity_type: timeForm.activityType,
        is_billable: timeForm.isBillable,
        notes: timeForm.notes.trim() || undefined,
      };
      if (timeForm.taskId) payload.task_id = timeForm.taskId;
      if (canManageTeamRates && timeForm.userId && String(timeForm.userId) !== String(session?.user?.id)) {
        payload.user_id = parseInt(timeForm.userId, 10);
      }
      await createTimeEntry(id, payload);
      const list = await getTimeEntries(id);
      setTimeEntries(list);
      setTimeForm((f) => ({
        ...f,
        durationMinutes: '60',
        notes: '',
        taskId: '',
      }));
      setToast('Time entry saved');
      setTimeout(() => setToast(''), 1500);
    } catch (err) {
      setTimeError(err.message || 'Could not save time entry.');
    } finally {
      setTimeSaving(false);
    }
  }

  async function handleRequestCfOtp() {
    if (!id) return;
    setRequestingCfOtp(true);
    setError('');
    try {
      await requestServiceClientFacingOtp(id);
      setToast('OTP sent to superadmin email');
      setTimeout(() => setToast(''), 2500);
    } catch (e) {
      setError(e.message || 'Could not send OTP.');
    } finally {
      setRequestingCfOtp(false);
    }
  }

  async function handleDeleteEngagement() {
    if (!id) return;
    if (!window.confirm('Delete this service engagement permanently? Assigned users will be notified by email.')) return;
    setDeleting(true);
    setError('');
    try {
      await deleteEngagement(id);
      navigate('/services');
    } catch (e) {
      setError(e.message || 'Delete failed.');
    } finally {
      setDeleting(false);
    }
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

  const statusLabel = STATUS_OPTIONS.includes(status)
    ? status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : status;

  return (
    <div style={pageWrap}>
      {showAddTask && <AddTaskModal onClose={() => setShowAddTask(false)} onSave={handleAddTask} />}
      {toast && <div style={toastBar}>{toast}</div>}

      <div style={breadcrumbRow}>
        <span style={crumb} onClick={() => navigate('/')} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && navigate('/')}>Home</span>
        <ChevronRight size={13} color="#94a3b8" />
        <span style={crumb} onClick={() => navigate('/services')} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && navigate('/services')}>Services &amp; Tasks</span>
        <ChevronRight size={13} color="#94a3b8" />
        <span style={crumbActive}>Manage engagement</span>
      </div>

      <header style={hubHeader}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={hubEyebrow}>Engagement #{id}</div>
          <h1 style={hubTitle}>{clientName || 'Client'}</h1>
          <div style={hubMeta}>
            <span style={hubMetaStrong}>{serviceType || 'Service'}</span>
            <span style={hubDot}>·</span>
            <span>{fy || '—'} FY</span>
            <span style={hubDot}>·</span>
            <span style={hubStatusPill}>{statusLabel}</span>
          </div>
        </div>
        <div style={hubActions}>
          <button type="button" style={hubBtnSecondary} onClick={() => navigate(`/services/${id}/files`)}>
            <FolderOpen size={16} />
            Engagement files
          </button>
          <button type="button" style={btnPrimary} disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </header>

      {error && <div style={errBox}>{error}</div>}

      <nav style={tabNav} aria-label="Engagement sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              ...tabBtn,
              ...(tab === t.id ? tabBtnActive : {}),
            }}
          >
            {t.id === 'activity' ? <History size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> : null}
            {t.label}
          </button>
        ))}
      </nav>

      <div style={tabPanel}>
        {tab === 'overview' && (
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
          <div style={sectionTitle}>Referral &amp; commission</div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px', lineHeight: 1.45 }}>
            Referring affiliate and commission mode are fixed for this engagement. Referral start date is maintained on the client record. To change the client-facing flag, request a superadmin OTP and enter it before saving.
          </p>
          <label style={fieldLabel}>
            Referring affiliate
            <div style={{ ...inputStyle, background: '#f8fafc', color: '#334155', cursor: 'default' }}>{affiliateReadonlyLabel}</div>
          </label>
          <label style={{ ...fieldLabel, marginTop: 14 }}>
            Commission mode
            <div style={{ ...inputStyle, background: '#f8fafc', color: '#334155', cursor: 'default' }}>{commissionReadonlyLabel}</div>
          </label>
          <div style={{ marginTop: 16, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={clientFacingRestricted}
                onChange={e => setClientFacingRestricted(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>Client-facing restricted (reporting flag)</span>
            </label>
            <p style={{ fontSize: 12, color: '#64748b', margin: '10px 0 8px', lineHeight: 1.45 }}>
              Superadmin receives a one-time code by email. Request the code, then enter it below before saving if you change this flag.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <button type="button" style={btnSecondary} disabled={requestingCfOtp} onClick={handleRequestCfOtp}>
                {requestingCfOtp ? 'Sending…' : 'Request superadmin OTP'}
              </button>
            </div>
            <label style={{ ...fieldLabel, marginTop: 12 }}>
              Superadmin OTP
              <input
                type="text"
                style={inputStyle}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter code if you changed the flag above"
                value={cfOtp}
                onChange={e => setCfOtp(e.target.value.replace(/\s/g, ''))}
              />
            </label>
          </div>
        </section>

        <section style={sectionCard}>
          <div style={sectionTitle}>Engagement details</div>
          <label style={fieldLabel}>
            Status
            <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </select>
          </label>
          <p style={{ ...hint, marginTop: 12 }}>Assign staff on the <strong>Team</strong> tab (multiple people allowed). The first selected member is the primary owner for legacy reports.</p>
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
          </div>
        )}

        {tab === 'team' && (
          <section style={sectionCard}>
            <div style={sectionTitle}>Team</div>
            <p style={hint}>Select everyone who should appear on this engagement. Click <strong>Save changes</strong> to apply.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
              {staffOptionsForTeam.map((u) => {
                const checked = assigneeUserIds.some((x) => String(x) === String(u.id));
                return (
                  <label
                    key={u.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: checked ? '1px solid rgba(243,121,32,0.45)' : '1px solid #E6E8F0',
                      background: checked ? '#FEF0E6' : '#fff',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 500,
                      color: '#0B1F3B',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTeamMember(u.id)}
                    />
                    {u.name}
                  </label>
                );
              })}
            </div>
          </section>
        )}

        {tab === 'time' && (
        <section style={sectionCard}>
          <div style={sectionTitle}>Time entries</div>
          <p style={hint}>
            Log time against this engagement or an <strong>open</strong> task. Entries are blocked when the engagement is completed, cancelled, or billing is closed (built / non-billable), or when the chosen task is marked done.
          </p>
          {timeError && <div style={{ ...errBox, marginBottom: 12 }}>{timeError}</div>}
          {timeLoading ? (
            <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>Loading time entries…</div>
          ) : null}
          {canLogTimePermission && canLogTime ? (
            <form onSubmit={handleSaveTimeEntry} style={{ display: 'grid', gap: 12, marginBottom: 16, padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <div style={{ ...twoCol, marginTop: 0 }}>
                <label style={fieldLabel}>
                  Work date
                  <DateInput value={timeForm.workDate} onChange={(e) => setTimeForm((f) => ({ ...f, workDate: e.target.value }))} style={inputStyle} />
                </label>
                <label style={fieldLabel}>
                  Duration (minutes)
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={timeForm.durationMinutes}
                    onChange={(e) => setTimeForm((f) => ({ ...f, durationMinutes: e.target.value }))}
                    style={inputStyle}
                  />
                </label>
              </div>
              <div style={twoCol}>
                <label style={fieldLabel}>
                  Activity
                  <select
                    value={timeForm.activityType}
                    onChange={(e) => setTimeForm((f) => ({ ...f, activityType: e.target.value }))}
                    style={selectStyle}
                  >
                    {TIME_ACTIVITY_TYPES.map((a) => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </label>
                <label style={fieldLabel}>
                  Scope
                  <select
                    value={timeForm.taskId}
                    onChange={(e) => setTimeForm((f) => ({ ...f, taskId: e.target.value }))}
                    style={selectStyle}
                  >
                    <option value="">Whole engagement (no specific task)</option>
                    {openTasksForTime.map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </label>
              </div>
              {canManageTeamRates ? (
                <label style={fieldLabel}>
                  User (team admins only)
                  <select
                    value={timeForm.userId}
                    onChange={(e) => setTimeForm((f) => ({ ...f, userId: e.target.value }))}
                    style={selectStyle}
                  >
                    {staffUsers.map((s) => (
                      <option key={s.id} value={String(s.id)}>{s.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={timeForm.isBillable}
                  onChange={(e) => setTimeForm((f) => ({ ...f, isBillable: e.target.checked }))}
                />
                <span>Billable</span>
              </label>
              <label style={fieldLabel}>
                Notes (optional)
                <input
                  type="text"
                  value={timeForm.notes}
                  onChange={(e) => setTimeForm((f) => ({ ...f, notes: e.target.value }))}
                  style={inputStyle}
                  placeholder="Short note"
                />
              </label>
              <button type="submit" disabled={timeSaving} style={{ ...btnPrimary, justifySelf: 'start' }}>
                {timeSaving ? 'Saving…' : 'Add time entry'}
              </button>
            </form>
          ) : (
            <p style={{ ...hint, color: canLogTime ? '#94a3b8' : '#dc2626' }}>
              {!canLogTimePermission
                ? 'You do not have permission to add time entries.'
                : 'This engagement is closed for time entry (completed, cancelled, or billing closed).'}
            </p>
          )}
          {timeEntries.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 13 }}>No time logged yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#64748b' }}>
                    {['Date', 'User', 'Mins', 'Activity', 'Scope', 'Billable'].map((h) => (
                      <th key={h} style={{ padding: '6px 4px', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeEntries.map((te) => (
                    <tr key={te.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 4px' }}>{te.workDate}</td>
                      <td style={{ padding: '6px 4px' }}>{te.userName}</td>
                      <td style={{ padding: '6px 4px' }}>{te.durationMinutes}</td>
                      <td style={{ padding: '6px 4px' }}>{te.activityType.replace(/_/g, ' ')}</td>
                      <td style={{ padding: '6px 4px', color: '#64748b' }}>{te.taskId ? `Task` : 'Engagement'}</td>
                      <td style={{ padding: '6px 4px' }}>{te.isBillable ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}

        {tab === 'tasks' && (
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
              style={{ ...taskRow, cursor: 'default' }}
            >
              <div
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0, cursor: t.id ? 'pointer' : 'default' }}
                role="button"
                tabIndex={0}
                onClick={() => t.id && toggleTaskDone(t.id)}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && t.id && toggleTaskDone(t.id)}
              >
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
              {t.id && (
                <button
                  type="button"
                  title="Remove task (click Save changes to apply)"
                  onClick={(e) => { e.stopPropagation(); removeTask(t.id); }}
                  style={{
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 6, cursor: 'pointer', color: '#64748b',
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </section>
        )}

        {tab === 'activity' && (
          <section style={sectionCard}>
            <div style={sectionTitle}>Activity</div>
            <p style={hint}>Admin changes recorded for this engagement (status, team, tasks, billing, and more).</p>
            {auditError && <div style={{ ...errBox, marginBottom: 12 }}>{auditError}</div>}
            {auditLoading ? (
              <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading activity…</div>
            ) : auditRows.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13 }}>No audit entries yet.</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {auditRows.map((row) => (
                  <li
                    key={String(row.id)}
                    style={{
                      borderLeft: '3px solid #F37920',
                      paddingLeft: 14,
                      paddingBottom: 12,
                      borderBottom: '1px solid #f1f5f9',
                    }}
                  >
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                      {(row.created_at || row.createdAt) ? new Date(row.created_at || row.createdAt).toLocaleString() : ''}
                      {' · '}
                      <span style={{ fontWeight: 600, color: '#475569' }}>{row.actor_name || 'System'}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1F3B', marginBottom: 6 }}>{row.action}</div>
                    <AuditMetaDetails row={row} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <div style={{ ...actionRow, justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        {canDeleteService && (
          <button
            type="button"
            disabled={deleting}
            onClick={handleDeleteEngagement}
            style={{
              padding: '10px 18px',
              background: '#fff',
              color: '#b91c1c',
              border: '1px solid #fecaca',
              borderRadius: 8,
              cursor: deleting ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {deleting ? 'Deleting…' : 'Delete engagement'}
          </button>
        )}
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
          <button type="button" style={btnSecondary} onClick={() => navigate('/services')}>Cancel</button>
          <button type="button" style={btnPrimary} disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}

const pageWrap = { padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, background: '#F6F7FB', minHeight: '100%' };
const hubHeader = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
  padding: '20px 22px',
  background: 'linear-gradient(135deg, #0B1F3B 0%, #1e3a5f 100%)',
  borderRadius: 14,
  border: '1px solid #0f2847',
  boxShadow: '0 4px 20px rgba(11,31,59,0.12)',
};
const hubEyebrow = { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 };
const hubTitle = { fontSize: 22, fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.25 };
const hubMeta = { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 };
const hubMetaStrong = { fontWeight: 600, color: '#fff' };
const hubDot = { color: 'rgba(255,255,255,0.45)' };
const hubStatusPill = {
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: 99,
  background: 'rgba(243,121,32,0.25)',
  color: '#FBD38D',
  fontSize: 12,
  fontWeight: 600,
};
const hubActions = { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' };
const hubBtnSecondary = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  background: 'rgba(255,255,255,0.12)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.28)',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};
const tabNav = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  padding: '4px',
  background: '#fff',
  borderRadius: 12,
  border: '1px solid #E6E8F0',
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
};
const tabBtn = {
  padding: '10px 16px',
  border: 'none',
  borderRadius: 8,
  background: 'transparent',
  color: '#64748b',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
};
const tabBtnActive = { background: '#FEF0E6', color: '#C25A0A' };
const tabPanel = { minHeight: 200 };

const breadcrumbRow = { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' };
const crumb = { fontSize: 12, color: '#94a3b8', fontWeight: 500, cursor: 'pointer' };
const crumbActive = { fontSize: 12, color: '#F37920', fontWeight: 600 };
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
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 0', borderBottom: '1px solid #F0F2F8',
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

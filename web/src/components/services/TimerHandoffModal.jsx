import { useEffect, useMemo, useState } from 'react';
import DateInput from '../common/DateInput';
import { TIME_ACTIVITY_TYPES } from '../../services/timeEntryService';
import { useElapsedTimer } from '../../hooks/useElapsedTimer';

function toDuration(startedAt, endedAt, fallback) {
  if (Number.isFinite(Number(fallback)) && Number(fallback) > 0) return String(Math.round(Number(fallback)));
  const a = startedAt ? Date.parse(startedAt) : NaN;
  const b = endedAt ? Date.parse(endedAt) : NaN;
  if (!Number.isNaN(a) && !Number.isNaN(b) && b >= a) {
    return String(Math.max(1, Math.floor((b - a) / 60000)));
  }
  return '1';
}

export default function TimerHandoffModal({
  open,
  activeTimer,
  openTasks = [],
  defaultUserId = '',
  canManageTeamRates = false,
  staffUsers = [],
  onClose,
  onStopAndPrefill,
  onSubmitStopped,
  onStartNext,
  pendingStartService,
}) {
  const [phase, setPhase] = useState('handoff');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    workDate: new Date().toISOString().slice(0, 10),
    durationMinutes: '1',
    activityType: 'client_work',
    isBillable: true,
    taskId: '',
    notes: '',
    userId: defaultUserId ? String(defaultUserId) : '',
  });
  const [stoppedEntry, setStoppedEntry] = useState(null);
  const { label: elapsedLabel } = useElapsedTimer(activeTimer?.startedAt, activeTimer?.timerStatus === 'running');

  useEffect(() => {
    if (!open || !activeTimer) return;
    setPhase('handoff');
    setError('');
    setStoppedEntry(null);
    setForm({
      workDate: activeTimer.workDate || new Date().toISOString().slice(0, 10),
      durationMinutes: toDuration(activeTimer.startedAt, activeTimer.endedAt, activeTimer.durationMinutes),
      activityType: activeTimer.activityType || 'client_work',
      isBillable: activeTimer.isBillable !== false,
      taskId: activeTimer.taskId || '',
      notes: activeTimer.notes || '',
      userId: defaultUserId ? String(defaultUserId) : '',
    });
  }, [open, activeTimer, defaultUserId]);

  const activeLabel = useMemo(() => {
    if (!activeTimer) return '';
    const bits = [activeTimer.clientName, activeTimer.serviceType].filter(Boolean);
    return bits.join(' - ') || `Service #${activeTimer.serviceId}`;
  }, [activeTimer]);

  if (!open || !activeTimer) return null;

  async function handleStop() {
    setSaving(true);
    setError('');
    try {
      const stopped = await onStopAndPrefill?.(activeTimer);
      if (stopped) {
        setStoppedEntry(stopped);
        setForm((f) => ({
          ...f,
          workDate: stopped.workDate || f.workDate,
          durationMinutes: toDuration(stopped.startedAt, stopped.endedAt, stopped.durationMinutes),
          activityType: stopped.activityType || f.activityType,
          isBillable: stopped.isBillable !== false,
          taskId: stopped.taskId || '',
          notes: stopped.notes || '',
        }));
      }
      setPhase('prefill');
    } catch (e) {
      setError(e.message || 'Could not stop running timer.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!stoppedEntry) return;
    const mins = parseInt(form.durationMinutes, 10);
    if (!Number.isFinite(mins) || mins < 1 || mins > 1440) {
      setError('Duration must be between 1 and 1440 minutes.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSubmitStopped?.(stoppedEntry, {
        work_date: form.workDate,
        duration_minutes: mins,
        activity_type: form.activityType,
        is_billable: form.isBillable,
        notes: form.notes.trim() || undefined,
        task_id: form.taskId || null,
        user_id: form.userId ? Number(form.userId) : undefined,
        timer_status: 'submitted',
      });
      if (pendingStartService) {
        await onStartNext?.(pendingStartService);
      }
      onClose?.();
    } catch (e) {
      setError(e.message || 'Could not submit time entry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={header}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0B1F3B' }}>
            {phase === 'handoff' ? 'Running timer found' : 'Review and submit stopped time'}
          </div>
          <button type="button" style={closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 13, color: '#334155' }}>
            Active service: <strong>{activeLabel}</strong>
          </div>
          <div style={{ display: 'grid', gap: 4, fontSize: 12, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
            <div><strong>Client:</strong> {activeTimer.clientName || 'Unknown client'}</div>
            <div><strong>Engagement type:</strong> {activeTimer.serviceType || 'Unknown engagement type'}</div>
            <div><strong>Service ID:</strong> {activeTimer.serviceId}</div>
            <div><strong>Elapsed:</strong> {elapsedLabel}</div>
          </div>
          {activeTimer.startedAt ? (
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Started at: {new Date(activeTimer.startedAt).toLocaleString()}
            </div>
          ) : null}
          {error ? <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div> : null}

          {phase === 'handoff' ? (
            <button type="button" style={primaryBtn} disabled={saving} onClick={handleStop}>
              {saving ? 'Stopping...' : 'Stop and prefill'}
            </button>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={twoCol}>
                <label style={fieldLabel}>
                  Work date
                  <DateInput value={form.workDate} onChange={(e) => setForm((f) => ({ ...f, workDate: e.target.value }))} style={inputStyle} />
                </label>
                <label style={fieldLabel}>
                  Duration (minutes)
                  <input type="number" min={1} max={1440} value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} style={inputStyle} />
                </label>
              </div>
              <div style={twoCol}>
                <label style={fieldLabel}>
                  Activity
                  <select value={form.activityType} onChange={(e) => setForm((f) => ({ ...f, activityType: e.target.value }))} style={inputStyle}>
                    {TIME_ACTIVITY_TYPES.map((a) => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </label>
                <label style={fieldLabel}>
                  Scope
                  <select value={form.taskId} onChange={(e) => setForm((f) => ({ ...f, taskId: e.target.value }))} style={inputStyle}>
                    <option value="">Whole engagement</option>
                    {openTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </label>
              </div>
              {canManageTeamRates ? (
                <label style={fieldLabel}>
                  User (team admins only)
                  <select value={form.userId} onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))} style={inputStyle}>
                    {staffUsers.map((s) => (
                      <option key={s.id} value={String(s.id)}>{s.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={form.isBillable} onChange={(e) => setForm((f) => ({ ...f, isBillable: e.target.checked }))} />
                <span>Billable</span>
              </label>
              <label style={fieldLabel}>
                Notes
                <input type="text" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={inputStyle} />
              </label>
              <button type="button" style={primaryBtn} disabled={saving} onClick={handleSubmit}>
                {saving ? 'Submitting...' : pendingStartService ? 'Submit and start selected service' : 'Submit'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const overlay = { position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modal = { width: 'min(620px, 96vw)', background: '#fff', borderRadius: 12, boxShadow: '0 10px 30px rgba(15,23,42,0.25)' };
const header = { padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const closeBtn = { border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: 6, cursor: 'pointer', width: 28, height: 28 };
const fieldLabel = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#475569', fontWeight: 600 };
const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' };
const twoCol = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };
const primaryBtn = { border: 'none', background: '#F37920', color: '#fff', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer' };

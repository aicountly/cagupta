import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import DateInput from '../common/DateInput';
import { localDateKey } from '../../utils/serviceKpiFilters';

/**
 * @param {object} props
 * @param {number[]} props.assigneeUserIds
 * @param {{ id: number, name: string }[]} props.staffUsers
 * @param {() => void} props.onClose
 * @param {(data: { title: string, assignedToUserId: number|null, dueDate: string, priority: string }) => void} props.onSave
 */
export default function AddTaskModal({ assigneeUserIds, staffUsers, onClose, onSave }) {
  const teamOptions = useMemo(() => {
    const list = Array.isArray(staffUsers) ? [...staffUsers] : [];
    const seen = new Set(list.map((u) => String(u.id)));
    for (const uid of assigneeUserIds || []) {
      if (!seen.has(String(uid))) {
        seen.add(String(uid));
        list.push({ id: uid, name: `User #${uid}` });
      }
    }
    return list;
  }, [assigneeUserIds, staffUsers]);

  const [form, setForm] = useState(() => ({
    title: '',
    assignedToUserId:
      Array.isArray(assigneeUserIds) && assigneeUserIds.length === 1
        ? String(assigneeUserIds[0])
        : '',
    dueDate: '',
    priority: 'medium',
  }));
  const [dueDateError, setDueDateError] = useState('');
  const todayKey = localDateKey(new Date());
  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (k === 'dueDate') setDueDateError('');
  };

  const handleSave = () => {
    if (!form.title.trim()) return;
    if (form.dueDate && form.dueDate < todayKey) {
      setDueDateError('Due date cannot be in the past.');
      return;
    }
    const idRaw = form.assignedToUserId;
    const n = idRaw === '' ? null : Number(idRaw);
    onSave({
      title: form.title.trim(),
      assignedToUserId: n != null && Number.isInteger(n) && n > 0 ? n : null,
      dueDate: form.dueDate,
      priority: form.priority,
    });
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
            Task title *
            <input
              type="text"
              style={taskInputStyle}
              placeholder="e.g. Collect Form 16"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </label>
          <label style={taskLabelStyle}>
            Assigned to
            <select
              style={taskInputStyle}
              value={form.assignedToUserId}
              onChange={(e) => set('assignedToUserId', e.target.value)}
            >
              <option value="">Unassigned</option>
              {teamOptions.map((u) => (
                <option key={u.id} value={String(u.id)}>{u.name}</option>
              ))}
            </select>
            {(!assigneeUserIds || assigneeUserIds.length === 0) && (
              <span style={hintText}>
                Add team members on the Team tab to assign a task to a specific person.
              </span>
            )}
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={taskLabelStyle}>
              Due date
              <DateInput
                min={todayKey}
                style={{ ...taskInputStyle, borderColor: dueDateError ? '#ef4444' : undefined }}
                value={form.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
              />
              {dueDateError && <span style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>{dueDateError}</span>}
            </label>
            <label style={taskLabelStyle}>
              Priority
              <select style={taskInputStyle} value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
        </div>
        <div style={{ padding: '10px 20px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={taskBtnSecondary}>Cancel</button>
          <button type="button" onClick={handleSave} style={taskBtnPrimary}>Add task</button>
        </div>
      </div>
    </div>
  );
}

const hintText = { fontSize: 11, color: '#94a3b8', fontWeight: 500, marginTop: 4 };
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const taskModalStyle = { background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', minWidth: 400, maxWidth: 480, width: '100%' };
const taskModalHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #F0F2F8' };
const taskModalClose = { background: '#F6F7FB', border: '1px solid #E6E8F0', borderRadius: 6, cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' };
const taskLabelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' };
const taskInputStyle = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, color: '#334155', outline: 'none' };
const taskBtnPrimary = { padding: '7px 14px', background: '#F37920', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const taskBtnSecondary = { padding: '7px 14px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 };

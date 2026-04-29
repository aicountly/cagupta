import { useState } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { TIME_ACTIVITY_TYPES, requestTimeEntryModifyOtp, updateTimeEntry } from '../../services/timeEntryService';

/**
 * Two-phase modal for modifying a locked timesheet entry via superadmin OTP.
 *
 * Phase 1 — Reason + proposed values: user fills in what they want to change
 *   and why. Submitting emails the superadmin an OTP with full diff details.
 * Phase 2 — OTP confirmation: user enters the OTP received from the superadmin.
 *   Submitting performs the actual PATCH update.
 *
 * @param {object} props
 * @param {object} props.entry           Current time entry object (from mapTimeEntry)
 * @param {number|string} props.serviceId
 * @param {(updated: object) => void} props.onSaved
 * @param {() => void} props.onClose
 */
export default function TimeEntryModifyModal({ entry, serviceId, onSaved, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const isToday = entry.workDate === today;

  const [phase, setPhase] = useState('reason');

  // Proposed values — initialised to current entry values
  const [proposed, setProposed] = useState({
    work_date: entry.workDate || '',
    duration_minutes: String(entry.durationMinutes || ''),
    activity_type: entry.activityType || '',
    is_billable: entry.isBillable,
    notes: entry.notes || '',
  });
  const [reason, setReason] = useState('');
  const [otp, setOtp] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const set = (k, v) => setProposed((p) => ({ ...p, [k]: v }));

  // ── Today's entry: direct save (no OTP) ──────────────────────────────────

  async function handleSaveDirect(e) {
    e.preventDefault();
    setErr('');
    const dur = Number(proposed.duration_minutes);
    if (!proposed.work_date) {
      setErr('Work date is required.');
      return;
    }
    if (!Number.isInteger(dur) || dur < 1 || dur > 1440) {
      setErr('Duration must be a whole number between 1 and 1440 minutes.');
      return;
    }
    if (!proposed.activity_type) {
      setErr('Activity type is required.');
      return;
    }
    setBusy(true);
    try {
      const updated = await updateTimeEntry(serviceId, entry.id, {
        work_date: proposed.work_date,
        duration_minutes: dur,
        activity_type: proposed.activity_type,
        is_billable: proposed.is_billable,
        notes: proposed.notes,
      });
      onSaved(updated);
    } catch (e2) {
      setErr(e2.message || 'Update failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  // ── Phase 1 submit: send OTP ──────────────────────────────────────────────

  async function handleSendOtp(e) {
    e.preventDefault();
    setErr('');
    if (!reason.trim()) {
      setErr('Please provide a reason for the modification.');
      return;
    }
    const dur = Number(proposed.duration_minutes);
    if (!proposed.work_date) {
      setErr('Work date is required.');
      return;
    }
    if (!Number.isInteger(dur) || dur < 1 || dur > 1440) {
      setErr('Duration must be a whole number between 1 and 1440 minutes.');
      return;
    }
    if (!proposed.activity_type) {
      setErr('Activity type is required.');
      return;
    }

    setBusy(true);
    try {
      await requestTimeEntryModifyOtp(serviceId, entry.id, {
        proposed_values: {
          work_date: proposed.work_date,
          duration_minutes: dur,
          activity_type: proposed.activity_type,
          is_billable: proposed.is_billable,
          notes: proposed.notes,
        },
        reason: reason.trim(),
      });
      setOtpSent(true);
      setPhase('otp');
    } catch (e2) {
      setErr(e2.message || 'Failed to send OTP. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  // ── Phase 2 submit: confirm with OTP ────────────────────────────────────

  async function handleConfirm(e) {
    e.preventDefault();
    setErr('');
    if (!otp.trim()) {
      setErr('Please enter the OTP you received from the super admin.');
      return;
    }
    setBusy(true);
    try {
      const dur = Number(proposed.duration_minutes);
      const updated = await updateTimeEntry(
        serviceId,
        entry.id,
        {
          work_date: proposed.work_date,
          duration_minutes: dur,
          activity_type: proposed.activity_type,
          is_billable: proposed.is_billable,
          notes: proposed.notes,
        },
        { superadminOtp: otp.trim() }
      );
      onSaved(updated);
    } catch (e2) {
      setErr(e2.message || 'Update failed. The OTP may be incorrect or expired.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        {/* Header */}
        <div style={header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={16} color="#F37920" />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0B1F3B' }}>
              {isToday
                ? "Edit Today's Timesheet Entry"
                : phase === 'reason' ? 'Request Timesheet Modification' : 'Enter Superadmin OTP'}
            </span>
          </div>
          <button type="button" onClick={onClose} style={closeBtn} disabled={busy}>
            <X size={14} />
          </button>
        </div>

        {/* Phase indicator — only shown for past entries */}
        {!isToday && (
          <div style={phaseBar}>
            <div style={{ ...phaseStep, ...(phase === 'reason' ? phaseStepActive : phaseStepDone) }}>
              1 Propose changes
            </div>
            <div style={phaseDivider} />
            <div style={{ ...phaseStep, ...(phase === 'otp' ? phaseStepActive : phaseStepInactive) }}>
              2 Confirm with OTP
            </div>
          </div>
        )}

        {/* ── Today's entry: direct edit (no OTP) ──────────────────────── */}
        {isToday && (
          <form onSubmit={handleSaveDirect} style={body}>
            <div style={editGrid}>
              <label style={fieldLabel}>
                Work date *
                <input
                  type="date"
                  style={inputStyle}
                  value={proposed.work_date}
                  onChange={(e) => set('work_date', e.target.value)}
                  required
                />
              </label>
              <label style={fieldLabel}>
                Duration (minutes) *
                <input
                  type="number"
                  min={1}
                  max={1440}
                  style={inputStyle}
                  value={proposed.duration_minutes}
                  onChange={(e) => set('duration_minutes', e.target.value)}
                  required
                />
              </label>
              <label style={fieldLabel}>
                Activity type *
                <select
                  style={inputStyle}
                  value={proposed.activity_type}
                  onChange={(e) => set('activity_type', e.target.value)}
                  required
                >
                  <option value="">Select…</option>
                  {TIME_ACTIVITY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>
              <label style={fieldLabel}>
                Billable
                <select
                  style={inputStyle}
                  value={proposed.is_billable ? 'yes' : 'no'}
                  onChange={(e) => set('is_billable', e.target.value === 'yes')}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={fieldLabel}>
                  Notes
                  <textarea
                    style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                    value={proposed.notes}
                    onChange={(e) => set('notes', e.target.value)}
                    placeholder="Optional notes"
                  />
                </label>
              </div>
            </div>

            {err && <div style={errBox}>{err}</div>}

            <div style={footer}>
              <button type="button" style={btnSecondary} onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" style={btnPrimary} disabled={busy}>
                {busy ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}

        {/* ── Phase 1 (past entries) ────────────────────────────────────── */}
        {!isToday && phase === 'reason' && (
          <form onSubmit={handleSendOtp} style={body}>
            {/* Current values (read-only) */}
            <div style={sectionLabel}>Current values</div>
            <div style={readonlyGrid}>
              <ReadonlyField label="Date" value={entry.workDate} />
              <ReadonlyField label="Duration (mins)" value={String(entry.durationMinutes)} />
              <ReadonlyField label="Activity" value={(entry.activityType || '').replace(/_/g, ' ')} />
              <ReadonlyField label="Billable" value={entry.isBillable ? 'Yes' : 'No'} />
              <div style={{ gridColumn: '1 / -1' }}>
                <ReadonlyField label="Notes" value={entry.notes || '—'} />
              </div>
            </div>

            {/* Proposed values */}
            <div style={{ ...sectionLabel, marginTop: 16 }}>Proposed new values</div>
            <div style={editGrid}>
              <label style={fieldLabel}>
                Work date *
                <input
                  type="date"
                  style={inputStyle}
                  value={proposed.work_date}
                  onChange={(e) => set('work_date', e.target.value)}
                  required
                />
              </label>
              <label style={fieldLabel}>
                Duration (minutes) *
                <input
                  type="number"
                  min={1}
                  max={1440}
                  style={inputStyle}
                  value={proposed.duration_minutes}
                  onChange={(e) => set('duration_minutes', e.target.value)}
                  required
                />
              </label>
              <label style={fieldLabel}>
                Activity type *
                <select
                  style={inputStyle}
                  value={proposed.activity_type}
                  onChange={(e) => set('activity_type', e.target.value)}
                  required
                >
                  <option value="">Select…</option>
                  {TIME_ACTIVITY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>
              <label style={fieldLabel}>
                Billable
                <select
                  style={inputStyle}
                  value={proposed.is_billable ? 'yes' : 'no'}
                  onChange={(e) => set('is_billable', e.target.value === 'yes')}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={fieldLabel}>
                  Notes
                  <textarea
                    style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                    value={proposed.notes}
                    onChange={(e) => set('notes', e.target.value)}
                    placeholder="Optional notes"
                  />
                </label>
              </div>
            </div>

            {/* Reason */}
            <div style={{ ...sectionLabel, marginTop: 16 }}>Reason for modification *</div>
            <textarea
              style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
              placeholder="Describe why this entry needs to be changed…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
            <p style={hint}>
              An OTP will be emailed to the super admin containing all change details.
              The record will only be updated after the super admin shares the OTP with you.
            </p>

            {err && <div style={errBox}>{err}</div>}

            <div style={footer}>
              <button type="button" style={btnSecondary} onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" style={btnPrimary} disabled={busy}>
                {busy ? 'Sending…' : 'Send OTP to Super Admin'}
              </button>
            </div>
          </form>
        )}

        {/* ── Phase 2 (past entries) ───────────────────────────────────── */}
        {!isToday && phase === 'otp' && (
          <form onSubmit={handleConfirm} style={body}>
            <div style={successNote}>
              OTP sent to the super admin email. Ask the super admin for the code, then enter it below to confirm the modification.
            </div>

            {/* Summary of changes */}
            <div style={{ ...sectionLabel, marginTop: 12 }}>Changes summary</div>
            <table style={diffTable}>
              <thead>
                <tr>
                  <th style={diffTh}>Field</th>
                  <th style={{ ...diffTh, color: '#dc2626' }}>Current</th>
                  <th style={{ ...diffTh, color: '#16a34a' }}>Proposed</th>
                </tr>
              </thead>
              <tbody>
                <DiffRow label="Date" old={entry.workDate} next={proposed.work_date} />
                <DiffRow label="Duration (mins)" old={String(entry.durationMinutes)} next={proposed.duration_minutes} />
                <DiffRow
                  label="Activity"
                  old={(entry.activityType || '').replace(/_/g, ' ')}
                  next={(proposed.activity_type || '').replace(/_/g, ' ')}
                />
                <DiffRow label="Billable" old={entry.isBillable ? 'Yes' : 'No'} next={proposed.is_billable ? 'Yes' : 'No'} />
                <DiffRow label="Notes" old={entry.notes || '—'} next={proposed.notes || '—'} />
              </tbody>
            </table>

            <div style={reasonDisplay}>
              <strong>Reason:</strong> {reason}
            </div>

            <label style={{ ...fieldLabel, marginTop: 16 }}>
              Superadmin OTP *
              <input
                type="text"
                style={{ ...inputStyle, letterSpacing: 6, fontSize: 20, textAlign: 'center', fontFamily: 'monospace' }}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="——————"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            </label>

            {err && <div style={errBox}>{err}</div>}

            <div style={footer}>
              <button type="button" style={btnSecondary} onClick={() => { setPhase('reason'); setErr(''); setOtp(''); }} disabled={busy}>
                Back
              </button>
              <button type="submit" style={btnPrimary} disabled={busy || otp.length < 6}>
                {busy ? 'Saving…' : 'Confirm & Save'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ReadonlyField({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, padding: '5px 8px' }}>{value || '—'}</span>
    </div>
  );
}

function DiffRow({ label, old: oldVal, next: newVal }) {
  const changed = String(oldVal) !== String(newVal);
  return (
    <tr>
      <td style={diffTd}>{label}</td>
      <td style={{ ...diffTd, color: changed ? '#dc2626' : '#64748b', background: changed ? '#fef2f2' : undefined }}>{oldVal}</td>
      <td style={{ ...diffTd, color: changed ? '#16a34a' : '#64748b', background: changed ? '#f0fdf4' : undefined }}>{newVal}</td>
    </tr>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const overlay = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const modal = { background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const header = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #f0f2f8', flexShrink: 0 };
const closeBtn = { background: '#f6f7fb', border: '1px solid #e6e8f0', borderRadius: 6, cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' };
const phaseBar = { display: 'flex', alignItems: 'center', padding: '8px 20px', background: '#f8fafc', borderBottom: '1px solid #f0f2f8', gap: 6, flexShrink: 0 };
const phaseStep = { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 };
const phaseStepActive = { background: '#F37920', color: '#fff' };
const phaseStepDone = { background: '#dcfce7', color: '#16a34a' };
const phaseStepInactive = { background: '#f1f5f9', color: '#94a3b8' };
const phaseDivider = { height: 1, flex: 1, background: '#e2e8f0' };
const body = { padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 };
const sectionLabel = { fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 };
const readonlyGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };
const editGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };
const fieldLabel = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' };
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, color: '#334155', outline: 'none', background: '#fff' };
const hint = { fontSize: 11, color: '#64748b', margin: 0 };
const errBox = { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 6, padding: '8px 12px', fontSize: 12 };
const successNote = { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', borderRadius: 6, padding: '10px 14px', fontSize: 13 };
const reasonDisplay = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#334155' };
const diffTable = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const diffTh = { padding: '6px 8px', textAlign: 'left', background: '#f8fafc', color: '#64748b', fontWeight: 700, border: '1px solid #e2e8f0' };
const diffTd = { padding: '6px 8px', border: '1px solid #e2e8f0', verticalAlign: 'top' };
const footer = { display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid #f0f2f8', marginTop: 4 };
const btnPrimary = { padding: '8px 16px', background: '#F37920', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const btnSecondary = { padding: '8px 16px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 };

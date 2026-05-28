import { useState, useEffect } from 'react';
import { useStaffUsers } from '../../hooks/useStaffUsers';
import { updateRegister } from '../../services/registerService';
import DateInput from '../common/DateInput';

/**
 * RegisterEntryModal
 *
 * Slide-in right panel for editing a register entry's filing details:
 *   filed_date, filed_by, acknowledgment_number, error_number, late_fee, notes, status
 *
 * Props:
 *   row        {Object|null}  The register row being edited (null = closed)
 *   onClose    {Function}     Called when user closes without saving
 *   onSaved    {Function}     Called with the updated row after save
 */
export default function RegisterEntryModal({ row, onClose, onSaved }) {
  const { staffUsers } = useStaffUsers();
  const [form, setForm]     = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // Sync form state when the row prop changes
  useEffect(() => {
    if (!row) { setForm(null); return; }
    setError('');
    setForm({
      status:                 row.status                 ?? 'pending',
      filed_date:             row.filed_date             ?? '',
      filed_by:               row.filed_by               ?? '',
      acknowledgment_number:  row.acknowledgment_number  ?? '',
      error_number:           row.error_number           ?? '',
      late_fee:               row.late_fee != null ? String(row.late_fee) : '',
      notes:                  row.notes                  ?? '',
    });
  }, [row]);

  if (!row || !form) return null;

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const payload = {
        status:                form.status                || null,
        filed_date:            form.filed_date            || null,
        filed_by:              form.filed_by              ? Number(form.filed_by) : null,
        acknowledgment_number: form.acknowledgment_number || null,
        error_number:          form.error_number          || null,
        late_fee:              form.late_fee !== '' ? parseFloat(form.late_fee) : null,
        notes:                 form.notes                 || null,
      };
      const updated = await updateRegister(row.id, payload);
      onSaved(updated ?? { ...row, ...payload });
    } catch (e) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const clientName = row.client_name || '—';
  const returnType = row.return_type || row.engagement_type_name || '—';
  const period     = row.period_label || row.period || '—';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 999,
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, height: '100vh', width: 420,
        background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,.12)',
        zIndex: 1000, display: 'flex', flexDirection: 'column',
        fontFamily: 'inherit',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
              Update Register Entry
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {clientName} &mdash; {returnType} &mdash; {period}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 20, color: '#94a3b8', lineHeight: 1, padding: '0 2px',
            }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {/* Status */}
          <Field label="Status">
            <select
              value={form.status}
              onChange={e => set('status', e.target.value)}
              style={inputStyle}
            >
              <option value="pending">Pending</option>
              <option value="filed">Filed</option>
              <option value="na">N/A</option>
            </select>
          </Field>

          {/* Filed date */}
          <Field label="Date of Filing">
            <DateInput
              value={form.filed_date}
              onChange={e => set('filed_date', e.target.value)}
              style={inputStyle}
              placeholder="YYYY-MM-DD"
            />
          </Field>

          {/* Filed by */}
          <Field label="Filed by">
            <select
              value={form.filed_by}
              onChange={e => set('filed_by', e.target.value)}
              style={inputStyle}
            >
              <option value="">— Select staff —</option>
              {staffUsers.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </Field>

          {/* Acknowledgment number */}
          <Field label="Acknowledgment / Reference No.">
            <input
              type="text"
              value={form.acknowledgment_number}
              onChange={e => set('acknowledgment_number', e.target.value)}
              style={inputStyle}
              placeholder="Enter ack / reference number"
            />
          </Field>

          {/* Error number */}
          <Field label="Error Number (if any)">
            <input
              type="text"
              value={form.error_number}
              onChange={e => set('error_number', e.target.value)}
              style={inputStyle}
              placeholder="Enter error number"
            />
          </Field>

          {/* Late fee */}
          <Field label="Late Fee (₹)">
            <input
              type="number"
              value={form.late_fee}
              onChange={e => set('late_fee', e.target.value)}
              style={inputStyle}
              placeholder="0"
              min="0"
              step="1"
            />
          </Field>

          {/* Notes */}
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
              placeholder="Optional internal notes"
            />
          </Field>

          {error && (
            <div style={{
              marginTop: 8, padding: '10px 12px',
              background: '#fef2f2', color: '#dc2626',
              borderRadius: 6, fontSize: 13,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #e2e8f0',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={cancelBtnStyle}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={saveBtnStyle(saving)}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: 'block', fontSize: 12, fontWeight: 600,
        color: '#475569', marginBottom: 6,
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 10px',
  border: '1px solid #e2e8f0', borderRadius: 6,
  fontSize: 13, color: '#334155',
  background: '#fff', boxSizing: 'border-box',
};

const cancelBtnStyle = {
  padding: '8px 18px', background: '#f8fafc',
  border: '1px solid #e2e8f0', borderRadius: 7,
  fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer',
};

const saveBtnStyle = (disabled) => ({
  padding: '8px 22px',
  background: disabled ? '#93c5fd' : '#2563eb',
  border: 'none', borderRadius: 7,
  fontSize: 13, fontWeight: 600, color: '#fff',
  cursor: disabled ? 'wait' : 'pointer',
});

import { useState, useEffect } from 'react';
import {
  getAppointmentFeeRules,
  createAppointmentFeeRule,
  updateAppointmentFeeRule,
  deleteAppointmentFeeRule,
} from '../services/appointmentFeeRuleService';
import { getBillingProfiles } from '../constants/billingProfiles';

const empty = {
  name: '',
  pricing_model: 'fixed_meeting',
  amount: '',
  default_billing_profile_code: '',
  default_line_description: '',
  default_line_kind: 'professional_fee',
  is_active: true,
};

export default function AppointmentFeeRules() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(empty);
  const billingProfiles = getBillingProfiles();

  function load() {
    setLoading(true);
    getAppointmentFeeRules({ includeInactive: true })
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setForm({ ...empty, default_billing_profile_code: billingProfiles[0]?.code || '' });
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(r) {
    setForm({
      name: r.name || '',
      pricing_model: r.pricing_model || 'fixed_meeting',
      amount: String(r.amount ?? ''),
      default_billing_profile_code: r.default_billing_profile_code || '',
      default_line_description: r.default_line_description || '',
      default_line_kind: r.default_line_kind || 'professional_fee',
      is_active: Boolean(r.is_active),
    });
    setEditId(r.id);
    setShowForm(true);
  }

  function handleSave(e) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      pricing_model: form.pricing_model,
      amount: Number(form.amount),
      default_billing_profile_code: form.default_billing_profile_code || null,
      default_line_description: form.default_line_description || null,
      default_line_kind: form.default_line_kind,
      is_active: form.is_active,
    };
    if (!payload.name || !Number.isFinite(payload.amount) || payload.amount < 0) {
      window.alert('Name and a valid amount are required.');
      return;
    }
    const p = editId
      ? updateAppointmentFeeRule(editId, payload)
      : createAppointmentFeeRule(payload);
    p.then(() => { setShowForm(false); load(); })
      .catch((err) => window.alert(err.message || 'Save failed'));
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Appointment fee rules</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b' }}>
            Fixed per meeting or per hour. Used when booking on the Calendar with billing.
          </p>
        </div>
        <button type="button" onClick={openAdd} style={btnPrimary}>+ Add rule</button>
      </div>

      <div style={cardStyle}>
        {loading ? (
          <div style={{ padding: 24, color: '#94a3b8' }}>Loading…</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                {['Name', 'Model', 'Amount (₹)', 'Billing profile', 'Active', 'Actions'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={trStyle}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{r.name}</td>
                  <td style={tdStyle}>{r.pricing_model === 'per_hour' ? 'Per hour' : 'Fixed meeting'}</td>
                  <td style={tdStyle}>{Number(r.amount).toLocaleString('en-IN')}</td>
                  <td style={tdStyle}>{r.default_billing_profile_code || '—'}</td>
                  <td style={tdStyle}>{r.is_active ? 'Yes' : 'No'}</td>
                  <td style={tdStyle}>
                    <button type="button" style={iconBtn} onClick={() => openEdit(r)}>Edit</button>
                    <button type="button" style={{ ...iconBtn, color: '#dc2626' }} onClick={() => {
                      if (!window.confirm('Delete this rule?')) return;
                      deleteAppointmentFeeRule(r.id).then(load).catch((err) => window.alert(err.message));
                    }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{editId ? 'Edit fee rule' : 'New fee rule'}</h3>
            <form onSubmit={handleSave}>
              <label style={labelStyle}>Name</label>
              <input style={inputStyle} value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} required />

              <label style={{ ...labelStyle, marginTop: 12 }}>Pricing model</label>
              <select style={inputStyle} value={form.pricing_model} onChange={(e) => setForm((v) => ({ ...v, pricing_model: e.target.value }))}>
                <option value="fixed_meeting">Fixed per meeting</option>
                <option value="per_hour">Fixed per hour</option>
              </select>

              <label style={{ ...labelStyle, marginTop: 12 }}>Amount (₹)</label>
              <input style={inputStyle} type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((v) => ({ ...v, amount: e.target.value }))} required />

              <label style={{ ...labelStyle, marginTop: 12 }}>Default billing profile</label>
              <select style={inputStyle} value={form.default_billing_profile_code} onChange={(e) => setForm((v) => ({ ...v, default_billing_profile_code: e.target.value }))}>
                <option value="">—</option>
                {billingProfiles.map((p) => (
                  <option key={p.code} value={p.code}>{p.code} — {p.name}</option>
                ))}
              </select>

              <label style={{ ...labelStyle, marginTop: 12 }}>Default line description (optional)</label>
              <input style={inputStyle} value={form.default_line_description} onChange={(e) => setForm((v) => ({ ...v, default_line_description: e.target.value }))} />

              <label style={{ ...labelStyle, marginTop: 12 }}>Line kind</label>
              <select style={inputStyle} value={form.default_line_kind} onChange={(e) => setForm((v) => ({ ...v, default_line_kind: e.target.value }))}>
                <option value="professional_fee">Professional fee</option>
                <option value="cost_recovery">Cost recovery</option>
              </select>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13 }}>
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((v) => ({ ...v, is_active: e.target.checked }))} />
                Active
              </label>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" style={btnOutline} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" style={btnPrimary}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,.08)', overflow: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = { textAlign: 'left', padding: '10px 12px', color: '#64748b', fontWeight: 600, fontSize: 12, borderBottom: '2px solid #f1f5f9', background: '#f8fafc' };
const tdStyle = { padding: '10px 12px', color: '#334155', borderBottom: '1px solid #f8fafc' };
const trStyle = {};
const btnPrimary = { padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const btnOutline = { padding: '8px 16px', background: '#fff', color: '#2563eb', border: '1px solid #2563eb', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, marginRight: 8 };
const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modalBox = { background: '#fff', borderRadius: 12, padding: 28, width: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,0.2)' };
const labelStyle = { display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 };
const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' };

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, X } from 'lucide-react';
import { mockContacts } from '../data/mockData';
import { addOrganization, generateOrgCode, getOrganizations, updateOrganization } from '../data/organizationStore';

// ── Constants ─────────────────────────────────────────────────────────────────
const ORG_TYPES = ['Company', 'LLP', 'Partnership', 'Proprietorship', 'Trust', 'Society', 'Other'];
const STATUS_OPTIONS = ['active', 'inactive', 'prospect'];
const MANAGER_LIST = ['CA Rahul Gupta', 'CA Priya Sharma', 'Staff A', 'Staff B', 'Staff C'];

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const CIN_REGEX = /^[A-Z]{1}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }) {
  const bg = type === 'error' ? '#fee2e2' : '#e8f7e6';
  const color = type === 'error' ? '#991b1b' : '#166534';
  return (
    <div style={{ ...toastStyle, background: bg, color }}>
      <span>{message}</span>
      <button onClick={onClose} style={toastClose}><X size={14} /></button>
    </div>
  );
}

// ── Helper sub-components ─────────────────────────────────────────────────────
function FieldLabel({ label, required }) {
  return (
    <div style={fieldLabelStyle}>
      {label}
      {required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    </div>
  );
}

function ErrorMsg({ msg }) {
  return <div style={errorMsgStyle}>{msg}</div>;
}

function FormSection({ title, children }) {
  return (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>{title}</div>
      {children}
    </div>
  );
}

// ── Generate a unique id ──────────────────────────────────────────────────────
function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'org-' + crypto.randomUUID();
  }
  return 'org-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

// ── Blank form state ──────────────────────────────────────────────────────────
function blankForm(defaultManager) {
  return {
    displayName: '',
    constitution: '',
    pan: '',
    gstin: '',
    cin: '',
    primaryContactId: '',
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    pin: '',
    status: 'active',
    assignedManager: defaultManager || MANAGER_LIST[0],
    notes: '',
  };
}

// ── Main page component ───────────────────────────────────────────────────────
export default function OrganizationCreatePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const existingOrg = isEdit ? getOrganizations().find(o => o.id === id) : null;

  const [orgCode] = useState(() => isEdit && existingOrg ? existingOrg.clientCode : generateOrgCode());
  const [orgId] = useState(() => isEdit && existingOrg ? existingOrg.id : null);
  const [form, setForm] = useState(() => {
    if (isEdit && existingOrg) {
      return {
        displayName: existingOrg.displayName || '',
        constitution: existingOrg.constitution || '',
        pan: existingOrg.pan || '',
        gstin: existingOrg.gstin || '',
        cin: existingOrg.cin || '',
        primaryContactId: existingOrg.primaryContactId || '',
        email: existingOrg.email || '',
        phone: existingOrg.phone || '',
        addressLine1: existingOrg.addressLine1 || '',
        addressLine2: existingOrg.addressLine2 || '',
        city: existingOrg.city || '',
        state: existingOrg.state || '',
        pin: existingOrg.pin || '',
        status: existingOrg.status || 'active',
        assignedManager: existingOrg.assignedManager || MANAGER_LIST[0],
        notes: existingOrg.notes || '',
      };
    }
    return blankForm(MANAGER_LIST[0]);
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  // Close toast automatically after 3 s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  }

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate(f) {
    const e = {};
    if (!f.displayName.trim()) e.displayName = 'Organization name is required.';
    if (f.pan && !PAN_REGEX.test(f.pan.toUpperCase())) {
      e.pan = 'PAN must be 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F).';
    }
    if (f.gstin && !GSTIN_REGEX.test(f.gstin.toUpperCase())) {
      e.gstin = 'GSTIN must be 15 characters (e.g. 27ABCDE1234F1Z5).';
    }
    if (f.cin && !CIN_REGEX.test(f.cin.toUpperCase())) {
      e.cin = 'CIN format: L12345AB1234ABC123456 (21 chars).';
    }
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) {
      e.email = 'Enter a valid email address.';
    }
    return e;
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  function buildOrg(f) {
    const primaryContact = mockContacts.find(c => c.id === f.primaryContactId);
    return {
      id: isEdit ? orgId : generateId(),
      clientCode: orgCode,
      displayName: f.displayName.trim(),
      constitution: f.constitution || '',
      pan: f.pan.toUpperCase() || null,
      gstin: f.gstin.toUpperCase() || null,
      cin: f.cin.toUpperCase() || null,
      primaryContactId: f.primaryContactId || null,
      primaryContact: primaryContact ? primaryContact.displayName : '—',
      email: f.email || null,
      phone: f.phone || null,
      addressLine1: f.addressLine1 || null,
      addressLine2: f.addressLine2 || null,
      city: f.city || '',
      state: f.state || null,
      pin: f.pin || null,
      status: f.status,
      assignedManager: f.assignedManager,
      notes: f.notes || null,
    };
  }

  async function handleSave(afterSave) {
    const e = validate(form);
    if (Object.keys(e).length > 0) {
      setErrors(e);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setErrors({});
    setSubmitting(true);

    // Simulate async save (no real backend)
    await new Promise(r => setTimeout(r, 500));
    if (isEdit) {
      updateOrganization(buildOrg(form));
      setToast({ message: '✅ Organization updated successfully!', type: 'success' });
    } else {
      addOrganization(buildOrg(form));
      setToast({ message: '✅ Organization created successfully!', type: 'success' });
    }
    setSubmitting(false);
    afterSave();
  }

  function handleSaveQuit() {
    handleSave(() => setTimeout(() => navigate('/clients/organizations'), 800));
  }

  function handleSaveNew() {
    const manager = form.assignedManager;
    handleSave(() => {
      setForm(blankForm(manager));
    });
  }

  function handleCancel() {
    navigate('/clients/organizations');
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={pageWrap}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Breadcrumb */}
      <div style={breadcrumbRow}>
        <span style={crumb} onClick={() => navigate('/')} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/'); } }}>Home</span>
        <ChevronRight size={13} color="#94a3b8" />
        <span style={crumb} onClick={() => navigate('/clients/organizations')} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/clients/organizations'); } }}>Organizations</span>
        <ChevronRight size={13} color="#94a3b8" />
        <span style={crumbActive}>{isEdit ? 'Edit Organization' : 'Add Organization'}</span>
      </div>

      <div style={pageTitleStyle}>{isEdit ? 'Edit Organization' : 'Add Organization'}</div>

      {/* Form grid – 2 columns on desktop, 1 on mobile */}
      <div style={formGrid}>
        {/* ── Section: Basic Information ──────────────────────────────── */}
        <FormSection title="Basic Information">
          {/* Read-only Org Code */}
          <div style={fieldRow}>
            <div style={fieldWrap}>
              <FieldLabel label="Organization Code" />
              <input value={orgCode} readOnly style={{ ...inputStyle, background: '#F1F5F9', color: '#64748b', cursor: 'default' }} />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Auto-generated</div>
            </div>
            <div style={fieldWrap}>
              <FieldLabel label="Organization Type" />
              <select value={form.constitution} onChange={e => setField('constitution', e.target.value)} style={selectStyle}>
                <option value="">Select type…</option>
                {ORG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <FieldLabel label="Organization Name" required />
            <input
              value={form.displayName}
              onChange={e => setField('displayName', e.target.value)}
              placeholder="Enter organization name"
              style={{ ...inputStyle, borderColor: errors.displayName ? '#ef4444' : '#E6E8F0' }}
            />
            {errors.displayName && <ErrorMsg msg={errors.displayName} />}
          </div>
        </FormSection>

        {/* ── Section: Registration & Identifiers ─────────────────────── */}
        <FormSection title="Registration &amp; Identifiers">
          <div style={fieldRow}>
            <div style={fieldWrap}>
              <FieldLabel label="PAN" />
              <input
                value={form.pan}
                onChange={e => setField('pan', e.target.value.toUpperCase())}
                placeholder="e.g. ABCDE1234F"
                maxLength={10}
                style={{ ...inputStyle, fontFamily: 'monospace', borderColor: errors.pan ? '#ef4444' : '#E6E8F0' }}
              />
              {errors.pan && <ErrorMsg msg={errors.pan} />}
            </div>
            <div style={fieldWrap}>
              <FieldLabel label="GSTIN" />
              <input
                value={form.gstin}
                onChange={e => setField('gstin', e.target.value.toUpperCase())}
                placeholder="e.g. 27ABCDE1234F1Z5"
                maxLength={15}
                style={{ ...inputStyle, fontFamily: 'monospace', borderColor: errors.gstin ? '#ef4444' : '#E6E8F0' }}
              />
              {errors.gstin && <ErrorMsg msg={errors.gstin} />}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <FieldLabel label="CIN (Company Identification Number)" />
            <input
              value={form.cin}
              onChange={e => setField('cin', e.target.value.toUpperCase())}
              placeholder="e.g. L17110MH1973PLC019786"
              maxLength={21}
              style={{ ...inputStyle, fontFamily: 'monospace', borderColor: errors.cin ? '#ef4444' : '#E6E8F0' }}
            />
            {errors.cin && <ErrorMsg msg={errors.cin} />}
          </div>
        </FormSection>

        {/* ── Section: Contact Information ─────────────────────────────── */}
        <FormSection title="Contact Information">
          <div style={fieldRow}>
            <div style={fieldWrap}>
              <FieldLabel label="Email" />
              <input
                value={form.email}
                onChange={e => setField('email', e.target.value)}
                placeholder="org@example.com"
                type="email"
                style={{ ...inputStyle, borderColor: errors.email ? '#ef4444' : '#E6E8F0' }}
              />
              {errors.email && <ErrorMsg msg={errors.email} />}
            </div>
            <div style={fieldWrap}>
              <FieldLabel label="Phone" />
              <input
                value={form.phone}
                onChange={e => setField('phone', e.target.value)}
                placeholder="+91 98765 43210"
                type="tel"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <FieldLabel label="Primary Contact" />
            <select
              value={form.primaryContactId}
              onChange={e => setField('primaryContactId', e.target.value)}
              style={selectStyle}
            >
              <option value="">— None —</option>
              {mockContacts.length === 0 ? (
                <option disabled value="">No contacts available yet</option>
              ) : (
                mockContacts.map(c => (
                  <option key={c.id} value={c.id}>{c.displayName}</option>
                ))
              )}
            </select>
          </div>
        </FormSection>

        {/* ── Section: Address ─────────────────────────────────────────── */}
        <FormSection title="Address">
          <div style={{ marginBottom: 14 }}>
            <FieldLabel label="Address Line 1" />
            <input
              value={form.addressLine1}
              onChange={e => setField('addressLine1', e.target.value)}
              placeholder="Building / street / area"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel label="Address Line 2" />
            <input
              value={form.addressLine2}
              onChange={e => setField('addressLine2', e.target.value)}
              placeholder="Landmark / locality"
              style={inputStyle}
            />
          </div>
          <div style={fieldRow}>
            <div style={fieldWrap}>
              <FieldLabel label="City" />
              <input
                value={form.city}
                onChange={e => setField('city', e.target.value)}
                placeholder="City"
                style={inputStyle}
              />
            </div>
            <div style={fieldWrap}>
              <FieldLabel label="State" />
              <input
                value={form.state}
                onChange={e => setField('state', e.target.value)}
                placeholder="State"
                style={inputStyle}
              />
            </div>
            <div style={{ flex: '0 0 120px' }}>
              <FieldLabel label="PIN Code" />
              <input
                value={form.pin}
                onChange={e => setField('pin', e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="400001"
                style={inputStyle}
                maxLength={6}
              />
            </div>
          </div>
        </FormSection>

        {/* ── Section: Administration ──────────────────────────────────── */}
        <FormSection title="Administration">
          <div style={fieldRow}>
            <div style={fieldWrap}>
              <FieldLabel label="Status" />
              <select value={form.status} onChange={e => setField('status', e.target.value)} style={selectStyle}>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div style={fieldWrap}>
              <FieldLabel label="Manager" />
              <select value={form.assignedManager} onChange={e => setField('assignedManager', e.target.value)} style={selectStyle}>
                {MANAGER_LIST.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <FieldLabel label="Notes / Remarks" />
            <textarea
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              placeholder="Any additional notes…"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
        </FormSection>
      </div>

      {/* ── Action Bar ─────────────────────────────────────────────────────── */}
      <div style={actionBar}>
        <button onClick={handleCancel} style={btnCancel} disabled={submitting}>Cancel</button>
        <div style={{ display: 'flex', gap: 10 }}>
          {!isEdit && (
            <button
              onClick={handleSaveNew}
              style={{ ...btnSecondary, opacity: submitting ? 0.7 : 1 }}
              disabled={submitting}
            >
              {submitting ? '⏳ Saving…' : '💾 Save & Add New'}
            </button>
          )}
          <button
            onClick={handleSaveQuit}
            style={{ ...btnPrimary, opacity: submitting ? 0.7 : 1 }}
            disabled={submitting}
          >
            {submitting ? '⏳ Saving…' : isEdit ? '✅ Save Changes' : '✅ Save & Quit'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const pageWrap = { padding: 24, background: '#F6F7FB', minHeight: '100%' };

const breadcrumbRow = { display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, flexWrap: 'wrap' };
const crumb = { fontSize: 11, color: '#94a3b8', fontWeight: 500, cursor: 'pointer' };
const crumbActive = { fontSize: 11, color: '#F37920', fontWeight: 600 };

const pageTitleStyle = { fontSize: 22, fontWeight: 700, color: '#0B1F3B', marginBottom: 24 };

const formGrid = { display: 'flex', flexDirection: 'column', gap: 20 };

const sectionStyle = {
  background: '#fff',
  borderRadius: 14,
  boxShadow: '0 1px 4px rgba(0,0,0,.06)',
  border: '1px solid #E6E8F0',
  padding: 20,
};
const sectionTitleStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: '#0B1F3B',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 16,
  paddingBottom: 10,
  borderBottom: '1px solid #F0F2F8',
};

const fieldRow = { display: 'flex', gap: 16, flexWrap: 'wrap' };
const fieldWrap = { flex: 1, minWidth: 180 };

const fieldLabelStyle = { fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 5 };
const errorMsgStyle = { fontSize: 11, color: '#dc2626', marginTop: 3 };

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #E6E8F0',
  borderRadius: 8,
  fontSize: 13,
  color: '#334155',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
};
const selectStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #E6E8F0',
  borderRadius: 8,
  fontSize: 13,
  color: '#334155',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
};

const actionBar = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: 28,
  padding: '16px 20px',
  background: '#fff',
  borderRadius: 14,
  border: '1px solid #E6E8F0',
  boxShadow: '0 1px 4px rgba(0,0,0,.06)',
};

const btnPrimary = {
  padding: '9px 20px',
  background: '#F37920',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};
const btnSecondary = {
  padding: '9px 20px',
  background: '#fff',
  color: '#F37920',
  border: '1px solid #F37920',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};
const btnCancel = {
  padding: '9px 20px',
  background: '#fff',
  color: '#64748b',
  border: '1px solid #E6E8F0',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};

const toastStyle = {
  position: 'fixed',
  top: 80,
  right: 24,
  zIndex: 9999,
  padding: '12px 16px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  minWidth: 260,
};
const toastClose = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  marginLeft: 'auto',
  color: 'inherit',
  opacity: 0.7,
};

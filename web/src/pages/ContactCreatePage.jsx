import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, X } from 'lucide-react';
import { createContact, updateContact as updateContactApi, getContact, getContactsForSearch } from '../services/contactService';
import OrganizationMultiSelect from '../components/common/OrganizationMultiSelect';
import { getGroups } from '../services/clientGroupService';
import { getApprovedAffiliates } from '../services/affiliateAdminService';
import { useStaffUsers } from '../hooks/useStaffUsers';
import { useAuth } from '../auth/AuthContext';
import DateInput from '../components/common/DateInput';
import NameCollisionModal from '../components/common/NameCollisionModal';

// ── Country / State data ──────────────────────────────────────────────────────
const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'Canada', 'Australia',
  'Germany', 'France', 'Japan', 'China', 'Singapore', 'UAE',
  'Saudi Arabia', 'Qatar', 'Bahrain', 'Kuwait', 'Oman',
  'Nepal', 'Bangladesh', 'Sri Lanka', 'Malaysia', 'Thailand',
  'Indonesia', 'South Africa', 'Brazil', 'Italy', 'Netherlands',
  'Switzerland', 'New Zealand', 'Other',
];

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman & Nicobar Islands', 'Chandigarh',
  'Dadra & Nagar Haveli and Daman & Diu', 'Delhi',
  'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function toTitleCase(str) {
  return str.replace(/\w\S*/g, (word) =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'ct-' + crypto.randomUUID();
  }
  return 'ct-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

// ── Toast component ───────────────────────────────────────────────────────────
function Toast({ message, onClose }) {
  return (
    <div style={toastStyle}>
      <span>{message}</span>
      <button onClick={onClose} style={toastClose}><X size={14} /></button>
    </div>
  );
}

// ── Field error label ─────────────────────────────────────────────────────────
function FieldError({ msg }) {
  if (!msg) return null;
  return <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>{msg}</div>;
}

// ── Validators ────────────────────────────────────────────────────────────────
function validateMobile(val, country) {
  if (!country || country === 'India') {
    const stripped = val.replace(/^\+91\s*/, '');
    return /^\d{10}$/.test(stripped);
  }
  // International: E.164 format (+countrycode digits, 7–15 digits total)
  return /^\+\d{7,15}$/.test(val);
}

function validatePAN(val) {
  return !val || /^[A-Z]{5}\d{4}[A-Z]$/.test(val.toUpperCase());
}

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** Return true if every word in val starts with an uppercase letter. */
function isTitleCase(val) {
  if (!val.trim()) return true;
  return val.trim().split(/\s+/).every(word => /^[A-Z]/.test(word));
}

// ── Empty form state ──────────────────────────────────────────────────────────
function emptyForm(defaultManager = '') {
  return {
    displayName: '',
    mobile: '',
    email: '',
    pan: '',
    gstin: '',
    website: '',
    city: '',
    country: 'India',
    state: '',
    landline: '',
    secondaryMobile: '',
    waMobile: '',
    status: 'active',
    assignedManager: defaultManager,
    linkedOrgIds: [],
    notes: '',
    groupId: '',
    reference: '',
    referringAffiliateUserId: '',
    referralStartDate: '',
    commissionMode: 'referral_only',
    clientFacingRestricted: false,
  };
}

function normalizeContactNameKey(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * @param {string} trimmedInput
 * @param {Array<{ id: unknown, displayName?: string }>} peers  — already excludes self when editing
 * @returns {null | { kind: 'identical' | 'similar', matches: { id: number, label: string }[] }}
 */
function classifyContactNameDuplicates(trimmedInput, peers) {
  const t = normalizeContactNameKey(trimmedInput);
  const identical = [];
  const similar = [];
  for (const p of peers || []) {
    if (!p) continue;
    const label = String(p.displayName || '').trim() || '—';
    const pNorm = normalizeContactNameKey(label);
    if (!t || !pNorm) continue;
    const cid = Number(p.id);
    if (!Number.isFinite(cid) || cid <= 0) continue;
    if (t === pNorm) {
      identical.push({ id: cid, label });
    } else {
      const [shorter, longer] = t.length <= pNorm.length ? [t, pNorm] : [pNorm, t];
      if (shorter.length >= 3 && longer.includes(shorter)) {
        similar.push({ id: cid, label });
      }
    }
  }
  if (identical.length) return { kind: 'identical', matches: identical };
  if (similar.length) return { kind: 'similar', matches: similar };
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ContactCreatePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(() => emptyForm());
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [code, setCode] = useState('Auto-generated');
  const [contactId, setContactId] = useState(null);
  const [linkedOrgNameById, setLinkedOrgNameById] = useState({});
  const [groups, setGroups] = useState([]);
  const [contactLoading, setContactLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [nameDuplicateInfo, setNameDuplicateInfo] = useState(null);
  const [nameCollisionModalOpen, setNameCollisionModalOpen] = useState(false);
  const nameCollisionSigRef = useRef('');

  // Dynamic staff/manager list
  const { staffUsers } = useStaffUsers();
  const { hasPermission } = useAuth();
  const canListAffiliates = hasPermission('affiliates.manage');
  const [approvedAffiliates, setApprovedAffiliates] = useState([]);

  useEffect(() => {
    if (!canListAffiliates) return;
    getApprovedAffiliates()
      .then(setApprovedAffiliates)
      .catch(() => setApprovedAffiliates([]));
  }, [canListAffiliates]);

  // Track "dirty" state so we can warn on cancel
  const [dirty, setDirty] = useState(false);
  // Track WA Mobile "same as primary" sync
  const [waMobileSameAsPrimary, setWaMobileSameAsPrimary] = useState(false);

  // Load groups for the group selector
  useEffect(() => {
    getGroups().then(setGroups).catch(() => setGroups([]));
  }, []);

  // Load existing contact in edit mode (single GET — not limited to first page of list)
  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    setContactLoading(true);
    setLoadError(null);
    getContact(id)
      .then(existing => {
        if (cancelled) return;
        setCode(existing.clientCode || `CLT-${String(existing.id).padStart(4, '0')}`);
        setContactId(existing.id);
        const ids = existing.linkedOrgIds || [];
        const names = existing.linkedOrgNames || [];
        const nameMap = {};
        ids.forEach((oid, i) => {
          const id = Number(oid);
          if (!Number.isFinite(id) || id <= 0) return;
          nameMap[id] = names[i] || `Organization #${id}`;
        });
        setLinkedOrgNameById(nameMap);
        setForm({
          displayName:     existing.displayName     || '',
          mobile:          existing.mobile          || '',
          email:           existing.email           || '',
          pan:             existing.pan             || '',
          gstin:           existing.gstin           || '',
          website:         existing.website         || '',
          city:            existing.city            || '',
          country:         existing.country         || 'India',
          state:           existing.state           || '',
          landline:        existing.landline         || '',
          secondaryMobile: existing.secondaryMobile || '',
          waMobile:        existing.waMobile         || '',
          status:          existing.status          || 'active',
          assignedManager: existing.assignedManager || '',
          linkedOrgIds:    ids,
          notes:           existing.notes           || '',
          groupId:         existing.groupId || existing.group_id || '',
          reference:       existing.reference || '',
          referringAffiliateUserId: existing.referringAffiliateUserId != null ? String(existing.referringAffiliateUserId) : '',
          referralStartDate: existing.referralStartDate || '',
          commissionMode: existing.commissionMode || 'referral_only',
          clientFacingRestricted: Boolean(existing.clientFacingRestricted),
        });
      })
      .catch(err => {
        if (cancelled) return;
        setLoadError(err.message || 'Contact could not be loaded.');
        setContactId(null);
        setLinkedOrgNameById({});
      })
      .finally(() => {
        if (!cancelled) setContactLoading(false);
      });
    return () => { cancelled = true; };
  }, [isEdit, id]);

  useEffect(() => {
    const q = (form.displayName || '').trim();
    if (q.length < 2) {
      setNameDuplicateInfo(null);
      return undefined;
    }
    if (isEdit && (contactId == null || !Number.isFinite(Number(contactId)))) return undefined;
    const t = setTimeout(() => {
      getContactsForSearch(q, 50)
        .then((rows) => {
          const curId = contactId != null ? Number(contactId) : NaN;
          const others = (rows || []).filter((c) => c && (!Number.isFinite(curId) || curId <= 0 || Number(c.id) !== curId));
          const dup = classifyContactNameDuplicates(q, others);
          setNameDuplicateInfo(dup);
        })
        .catch(() => {
          setNameDuplicateInfo(null);
        });
    }, 450);
    return () => clearTimeout(t);
  }, [form.displayName, isEdit, contactId]);

  useEffect(() => {
    if (!nameDuplicateInfo) {
      nameCollisionSigRef.current = '';
      setNameCollisionModalOpen(false);
      return;
    }
    const sig = `${nameDuplicateInfo.kind}:${nameDuplicateInfo.matches.map((m) => m.id).join(',')}`;
    if (sig !== nameCollisionSigRef.current) {
      nameCollisionSigRef.current = sig;
      setNameCollisionModalOpen(true);
    }
  }, [nameDuplicateInfo]);

  function update(field, value) {
    const formatted =
      (field === 'displayName' || field === 'city')
        ? toTitleCase(value)
        : value;
    setForm(prev => {
      const updated = { ...prev, [field]: formatted };
      if (field === 'mobile' && waMobileSameAsPrimary) {
        updated.waMobile = value;
      }
      return updated;
    });
    setErrors(prev => ({ ...prev, [field]: undefined }));
    setDirty(true);
  }

  function handleCountryChange(country) {
    setForm(prev => ({
      ...prev,
      country,
      state: country !== 'India' ? 'Outside India' : (prev.state === 'Outside India' ? '' : prev.state),
    }));
    setErrors(prev => ({ ...prev, country: undefined, state: undefined }));
    setDirty(true);
  }

  function toggleWaMobileSameAsPrimary(checked) {
    setWaMobileSameAsPrimary(checked);
    if (checked) {
      setForm(prev => ({ ...prev, waMobile: prev.mobile }));
      setErrors(prev => ({ ...prev, waMobile: undefined }));
      setDirty(true);
    }
  }

  function handleLinkedOrgsChange({ ids, namesById }) {
    setForm(prev => ({ ...prev, linkedOrgIds: ids }));
    setLinkedOrgNameById(namesById);
    setDirty(true);
  }

  const doSave = useCallback(() => {
    const errs = {};
    if (!form.displayName.trim()) errs.displayName = 'Full name is required.';

    const hasMobile = form.mobile.trim().length > 0;
    const hasEmail = form.email.trim().length > 0;
    if (!hasMobile && !hasEmail) {
      errs.mobile = 'Either Primary Mobile or Primary Email is required.';
      errs.email = 'Either Primary Mobile or Primary Email is required.';
    } else if (hasMobile && !validateMobile(form.mobile.trim(), form.country)) {
      errs.mobile = form.country === 'India'
        ? 'Enter a valid 10-digit mobile number (optionally prefixed with +91).'
        : 'Enter a valid international number in E.164 format (e.g. +14155552671).';
    }
    if (form.secondaryMobile.trim() && !validateMobile(form.secondaryMobile.trim(), form.country)) {
      errs.secondaryMobile = form.country === 'India'
        ? 'Enter a valid 10-digit mobile number.'
        : 'Enter a valid international number in E.164 format.';
    }

    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = 'Enter a valid email address.';
    }
    if (form.pan.trim() && !validatePAN(form.pan.trim())) {
      errs.pan = 'PAN must be in format: 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F).';
    }
    if (form.gstin.trim() && !GSTIN_REGEX.test(form.gstin.trim().toUpperCase())) {
      errs.gstin = 'GSTIN must be 15 characters (e.g. 27ABCDE1234F1Z5).';
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return null;
    }

    const contact = {
      displayName:     form.displayName.trim(),
      mobile:          form.mobile.trim()          || undefined,
      email:           form.email.trim()           || undefined,
      pan:             form.pan.trim().toUpperCase() || undefined,
      gstin:           form.gstin.trim().toUpperCase() || undefined,
      website:         form.website.trim() || undefined,
      city:            form.city.trim()            || undefined,
      country:         form.country                || 'India',
      state:           form.state                  || undefined,
      landline:        form.landline.trim()         || undefined,
      secondaryMobile: form.secondaryMobile.trim()  || undefined,
      waMobile:        form.waMobile.trim()          || undefined,
      status:          form.status,
      assignedManager: form.assignedManager        || '',
      linkedOrgIds:    form.linkedOrgIds,
      notes:           form.notes.trim()           || undefined,
      groupId:         form.groupId || null,
      reference:       form.reference.trim()        || undefined,
      referringAffiliateUserId: form.referringAffiliateUserId || null,
      referralStartDate: form.referralStartDate || undefined,
      commissionMode: form.commissionMode || 'referral_only',
      clientFacingRestricted: form.clientFacingRestricted,
    };
    return contact;
  }, [form, isEdit]);

  async function handleSaveQuit() {
    const contact = doSave();
    if (!contact) return;
    if (isEdit && !contactId) {
      setToast('Error: Contact is not loaded. Refresh the page and try again.');
      return;
    }
    const trimmedName = (contact.displayName || '').trim();
    if (trimmedName.length >= 2) {
      try {
        const rows = await getContactsForSearch(trimmedName, 50);
        const curCid = isEdit && contactId ? Number(contactId) : NaN;
        const others = (rows || []).filter((c) => c && (!Number.isFinite(curCid) || curCid <= 0 || Number(c.id) !== curCid));
        const dup = classifyContactNameDuplicates(trimmedName, others);
        setNameDuplicateInfo(dup);
        if (dup?.kind === 'identical') {
          setToast('Another contact already uses this exact name. Change the name to save.');
          return;
        }
      } catch {
        /* allow save if search fails */
      }
    }
    setSaving(true);
    try {
      if (isEdit && contactId) {
        await updateContactApi(contactId, contact);
        setToast('Contact updated successfully!');
      } else {
        await createContact(contact);
        setToast('Contact saved successfully!');
      }
      setDirty(false);
      setTimeout(() => navigate('/clients/contacts'), 900);
    } catch (err) {
      setToast('Error: ' + (err.message || 'Failed to save contact.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAddNew() {
    const contact = doSave();
    if (!contact) return;
    const trimmedName = (contact.displayName || '').trim();
    if (trimmedName.length >= 2) {
      try {
        const rows = await getContactsForSearch(trimmedName, 50);
        const dup = classifyContactNameDuplicates(trimmedName, rows || []);
        setNameDuplicateInfo(dup);
        if (dup?.kind === 'identical') {
          setToast('Another contact already uses this exact name. Change the name to save.');
          return;
        }
      } catch {
        /* allow save if search fails */
      }
    }
    setSaving(true);
    try {
      await createContact(contact);
      setDirty(false);
      setForm(emptyForm(form.assignedManager)); // keep manager prefilled
      setLinkedOrgNameById({});
      setErrors({});
      setNameDuplicateInfo(null);
      setToast('Contact saved! Ready for another entry.');
    } catch (err) {
      setToast('Error: ' + (err.message || 'Failed to save contact.'));
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (dirty && !window.confirm('You have unsaved changes. Leave anyway?')) return;
    navigate('/clients/contacts');
  }

  if (isEdit && contactLoading) {
    return (
      <div style={{ padding: 24, background: '#F6F7FB', minHeight: '100%', color: '#64748b', fontSize: 14 }}>
        Loading contact…
      </div>
    );
  }

  if (isEdit && loadError) {
    return (
      <div style={{ padding: 24, background: '#F6F7FB', minHeight: '100%' }}>
        <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, color: '#991b1b', fontSize: 14, maxWidth: 480 }}>
          {loadError}
        </div>
        <button
          type="button"
          onClick={() => navigate('/clients/contacts')}
          style={{ marginTop: 16, padding: '8px 16px', borderRadius: 8, border: '1px solid #E6E8F0', background: '#fff', cursor: 'pointer', fontWeight: 600 }}
        >
          Back to contacts
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, background: '#F6F7FB', minHeight: '100%' }}>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      <NameCollisionModal
        open={nameCollisionModalOpen && Boolean(nameDuplicateInfo)}
        onClose={() => setNameCollisionModalOpen(false)}
        kind={nameDuplicateInfo?.kind}
        entityNoun="contact"
        matches={nameDuplicateInfo?.matches || []}
        onOpenRecord={(rid) => navigate(`/clients/contacts/${rid}/edit`)}
      />

      {/* Breadcrumb */}
      <div style={breadcrumbStyle}>
        <span style={breadcrumbLink} onClick={() => navigate('/')}>Home</span>
        <ChevronRight size={13} color="#94a3b8" />
        <span style={breadcrumbLink} onClick={() => navigate('/clients/contacts')}>Clients</span>
        <ChevronRight size={13} color="#94a3b8" />
        <span style={breadcrumbLink} onClick={() => navigate('/clients/contacts')}>Contacts</span>
        <ChevronRight size={13} color="#94a3b8" />
        <span style={{ color: '#334155', fontWeight: 600 }}>{isEdit ? 'Edit Contact' : 'Add Contact'}</span>
      </div>

      {/* Page title */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0B1F3B' }}>{isEdit ? 'Edit Contact' : 'Add Contact'}</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{isEdit ? 'Update contact record details.' : 'Create a new client contact record.'}</p>
      </div>

      {/* Form card */}
      <div style={cardStyle}>
        {/* ── Section: Basic Info ── */}
        <SectionHeader title="Basic Information" />
        <div style={gridStyle}>
          {/* Code (read-only) */}
          <FormField label="Contact Code" hint="Auto-generated">
            <input value={code} readOnly style={{ ...inputStyle, background: '#F8FAFC', color: '#64748b', cursor: 'not-allowed' }} />
          </FormField>

          {/* Status */}
          <FormField label="Status" required>
            <select value={form.status} onChange={e => update('status', e.target.value)} style={inputStyle}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="prospect">Prospect</option>
            </select>
          </FormField>

          {/* Group */}
          <FormField label="Group">
            <select
              value={form.groupId || ''}
              onChange={e => update('groupId', e.target.value || null)}
              style={inputStyle}
            >
              <option value="">— No Group (None) —</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </FormField>

          {/* Reference */}
          <FormField label="Reference">
            <input
              value={form.reference || ''}
              onChange={e => {
                const val = toTitleCase(e.target.value);
                update('reference', val);
                if (errors.reference) setErrors(prev => ({ ...prev, reference: '' }));
              }}
              onBlur={e => {
                const val = (e.target.value || '').trim();
                if (val && !isTitleCase(val)) {
                  setErrors(prev => ({ ...prev, reference: 'Reference must be in Title Case (e.g. Western India).' }));
                }
              }}
              placeholder="e.g. Western India, REF-001…"
              style={{ ...inputStyle, borderColor: errors.reference ? '#dc2626' : '#E6E8F0' }}
            />
            <FieldError msg={errors.reference} />
          </FormField>

          {/* Full Name */}
          <FormField label="Full Name" required error={errors.displayName}>
            <input
              value={form.displayName}
              onChange={e => update('displayName', e.target.value)}
              placeholder="e.g. Ramesh Agarwal"
              style={{ ...inputStyle, borderColor: errors.displayName ? '#dc2626' : '#E6E8F0' }}
            />
            <FieldError msg={errors.displayName} />
            {nameDuplicateInfo && !nameCollisionModalOpen && (
              <button
                type="button"
                onClick={() => setNameCollisionModalOpen(true)}
                style={{
                  marginTop: 8,
                  display: 'inline-block',
                  padding: '8px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: nameDuplicateInfo.kind === 'identical' ? '#991b1b' : '#92400e',
                  background: nameDuplicateInfo.kind === 'identical' ? '#fef2f2' : '#fffbeb',
                  border: nameDuplicateInfo.kind === 'identical' ? '1px solid #fecaca' : '1px solid #fde68a',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                {nameDuplicateInfo.kind === 'identical'
                  ? 'View duplicate name — cannot save until resolved'
                  : 'View similar contact name(s)…'}
              </button>
            )}
          </FormField>

          {/* Mobile */}
          <FormField label="Primary Mobile" hint="At least one of Mobile or Email required" error={errors.mobile}>
            <input
              value={form.mobile}
              onChange={e => update('mobile', e.target.value)}
              placeholder={form.country === 'India' ? 'e.g. 9876543210 or +91 9876543210' : 'e.g. +14155552671'}
              style={{ ...inputStyle, borderColor: errors.mobile ? '#dc2626' : '#E6E8F0' }}
            />
            <FieldError msg={errors.mobile} />
          </FormField>

          {/* Email */}
          <FormField label="Email" hint="At least one of Mobile or Email required" error={errors.email}>
            <input
              type="email"
              value={form.email}
              onChange={e => update('email', e.target.value)}
              placeholder="e.g. ramesh@example.com"
              style={{ ...inputStyle, borderColor: errors.email ? '#dc2626' : '#E6E8F0' }}
            />
            <FieldError msg={errors.email} />
          </FormField>

          {/* PAN */}
          <FormField label="PAN" error={errors.pan}>
            <input
              value={form.pan}
              onChange={e => update('pan', e.target.value.toUpperCase())}
              placeholder="e.g. ABCDE1234F"
              maxLength={10}
              style={{ ...inputStyle, fontFamily: 'monospace', textTransform: 'uppercase', borderColor: errors.pan ? '#dc2626' : '#E6E8F0' }}
            />
            <FieldError msg={errors.pan} />
          </FormField>

          {/* GSTIN */}
          <FormField label="GSTIN" error={errors.gstin}>
            <input
              value={form.gstin}
              onChange={e => update('gstin', e.target.value.toUpperCase())}
              placeholder="e.g. 27ABCDE1234F1Z5"
              maxLength={15}
              style={{ ...inputStyle, fontFamily: 'monospace', textTransform: 'uppercase', borderColor: errors.gstin ? '#dc2626' : '#E6E8F0' }}
            />
            <FieldError msg={errors.gstin} />
          </FormField>

          {/* Website */}
          <FormField label="Website" hint="Optional">
            <input
              type="text"
              value={form.website}
              onChange={e => update('website', e.target.value)}
              placeholder="https://example.com"
              style={inputStyle}
            />
          </FormField>

          {/* City */}
          <FormField label="City">
            <input
              value={form.city}
              onChange={e => update('city', e.target.value)}
              placeholder="e.g. Mumbai"
              style={inputStyle}
            />
          </FormField>

          {/* Country */}
          <FormField label="Country">
            <select value={form.country} onChange={e => handleCountryChange(e.target.value)} style={inputStyle}>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>

          {/* State */}
          <FormField label="State">
            {form.country === 'India' ? (
              <select value={form.state} onChange={e => update('state', e.target.value)} style={inputStyle}>
                <option value="">— Select State —</option>
                {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <input
                value="Outside India"
                readOnly
                style={{ ...inputStyle, background: '#F8FAFC', color: '#64748b', cursor: 'not-allowed' }}
              />
            )}
          </FormField>

          {/* Manager */}
          <FormField label="Manager">
            <select value={form.assignedManager} onChange={e => update('assignedManager', e.target.value)} style={inputStyle}>
              <option value="">— Select Manager —</option>
              {staffUsers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </FormField>
        </div>

        {/* ── Section: Phone Numbers ── */}
        <SectionHeader title="Phone Numbers" style={{ marginTop: 24 }} />
        <div style={gridStyle}>
          {/* Landline */}
          <FormField label="Landline">
            <input
              value={form.landline}
              onChange={e => update('landline', e.target.value)}
              placeholder="e.g. 022-12345678"
              style={inputStyle}
            />
          </FormField>

          {/* Secondary Mobile */}
          <FormField label="Secondary Mobile" error={errors.secondaryMobile}>
            <input
              value={form.secondaryMobile}
              onChange={e => update('secondaryMobile', e.target.value)}
              placeholder={form.country === 'India' ? 'e.g. 9876543210' : 'e.g. +14155552671'}
              style={{ ...inputStyle, borderColor: errors.secondaryMobile ? '#dc2626' : '#E6E8F0' }}
            />
            <FieldError msg={errors.secondaryMobile} />
          </FormField>

          {/* WA Mobile */}
          <FormField label="WA Mobile (WhatsApp)">
            <input
              value={form.waMobile}
              onChange={e => {
                setWaMobileSameAsPrimary(false);
                update('waMobile', e.target.value);
              }}
              placeholder={form.country === 'India' ? 'e.g. 9876543210' : 'e.g. +14155552671'}
              style={inputStyle}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={waMobileSameAsPrimary}
                onChange={e => toggleWaMobileSameAsPrimary(e.target.checked)}
                style={{ accentColor: '#F37920' }}
              />
              Same as Primary Mobile
            </label>
          </FormField>
        </div>

        {/* ── Section: Linked Organizations ── */}
        <SectionHeader title="Linked Organizations" style={{ marginTop: 24 }} />
        <div style={{ padding: '0 0 8px' }}>
          <OrganizationMultiSelect
            selectedIds={form.linkedOrgIds}
            namesById={linkedOrgNameById}
            onChange={handleLinkedOrgsChange}
          />
        </div>

        {/* ── Section: Referral & commission ── */}
        <SectionHeader title="Referral & commission" style={{ marginTop: 24 }} />
        <div style={gridStyle}>
          <FormField label="Referring affiliate">
            {canListAffiliates ? (
              <select
                value={form.referringAffiliateUserId}
                onChange={e => update('referringAffiliateUserId', e.target.value)}
                style={inputStyle}
              >
                <option value="">None</option>
                {approvedAffiliates.map(a => (
                  <option key={a.id} value={String(a.id)}>{a.name} ({a.email})</option>
                ))}
                {form.referringAffiliateUserId && !approvedAffiliates.some(a => String(a.id) === String(form.referringAffiliateUserId)) && (
                  <option value={form.referringAffiliateUserId}>Linked user #{form.referringAffiliateUserId}</option>
                )}
              </select>
            ) : (
              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                Picking an affiliate requires <strong>Affiliates</strong> admin permission. Values still save if already set.
              </p>
            )}
          </FormField>
          <FormField label="Referral start date">
            <DateInput
              value={form.referralStartDate}
              onChange={e => update('referralStartDate', e.target.value)}
              style={inputStyle}
            />
          </FormField>
          <FormField label="Commission mode">
            <select value={form.commissionMode} onChange={e => update('commissionMode', e.target.value)} style={inputStyle}>
              <option value="referral_only">Referral only (tiered %)</option>
              <option value="direct_interaction">Direct interaction (50/50 split)</option>
            </select>
          </FormField>
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 12, fontSize: 13, color: '#334155', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.clientFacingRestricted}
            onChange={e => update('clientFacingRestricted', e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>Client-facing restricted (default for new service engagements)</span>
        </label>

        {/* ── Section: Notes ── */}
        <SectionHeader title="Notes / Remarks" style={{ marginTop: 24 }} />
        <textarea
          value={form.notes}
          onChange={e => update('notes', e.target.value)}
          placeholder="Add any notes or remarks about this contact…"
          rows={3}
          style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
        />

        {/* ── Action buttons ── */}
        <div style={{ display: 'flex', gap: 10, marginTop: 28, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleCancel}
            style={btnSecondary}
            disabled={saving}
          >
            Cancel
          </button>
          {!isEdit && (
            <button
              type="button"
              onClick={handleSaveAddNew}
              style={saving || nameDuplicateInfo?.kind === 'identical' ? { ...btnOutline, opacity: 0.6, cursor: 'not-allowed' } : btnOutline}
              disabled={saving || nameDuplicateInfo?.kind === 'identical'}
            >
              {saving && <Spinner />} Save &amp; Add New
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveQuit}
            style={saving || nameDuplicateInfo?.kind === 'identical' ? { ...btnPrimary, opacity: 0.6, cursor: 'not-allowed' } : btnPrimary}
            disabled={saving || nameDuplicateInfo?.kind === 'identical'}
          >
            {saving && <Spinner />} {isEdit ? 'Save Changes' : 'Save & Quit'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionHeader({ title, style: extraStyle }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 8, borderBottom: '1px solid #F0F2F8', marginBottom: 16, ...extraStyle }}>
      {title}
    </div>
  );
}

function FormField({ label, required, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
        {label}{required && <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>}
        {hint && <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 4 }}>({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block',
      width: 12,
      height: 12,
      border: '2px solid rgba(255,255,255,0.4)',
      borderTopColor: '#fff',
      borderRadius: '50%',
      animation: 'spin 0.6s linear infinite',
      marginRight: 6,
      verticalAlign: 'middle',
    }} />
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const cardStyle = {
  background: '#fff',
  borderRadius: 14,
  boxShadow: '0 1px 4px rgba(0,0,0,.06)',
  border: '1px solid #E6E8F0',
  padding: 24,
};

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  gap: '16px 20px',
};

const inputStyle = {
  padding: '8px 12px',
  border: '1px solid #E6E8F0',
  borderRadius: 8,
  fontSize: 13,
  outline: 'none',
  background: '#fff',
  color: '#334155',
  width: '100%',
  boxSizing: 'border-box',
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
  display: 'inline-flex',
  alignItems: 'center',
};

const btnOutline = {
  padding: '9px 20px',
  background: '#fff',
  color: '#F37920',
  border: '1.5px solid #F37920',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
};

const btnSecondary = {
  padding: '9px 20px',
  background: '#F6F7FB',
  color: '#64748b',
  border: '1px solid #E6E8F0',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};

const breadcrumbStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: '#94a3b8',
  marginBottom: 16,
};

const breadcrumbLink = {
  cursor: 'pointer',
  color: '#64748b',
  textDecoration: 'none',
};

const toastStyle = {
  position: 'fixed',
  bottom: 28,
  right: 28,
  background: '#0B1F3B',
  color: '#fff',
  padding: '12px 18px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 500,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  boxShadow: '0 4px 16px rgba(0,0,0,.18)',
};

const toastClose = {
  background: 'none',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
};

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, X } from 'lucide-react';
import { createContact } from '../services/contactService';
import {
  ApiError,
  createOrganization,
  updateOrganization as updateOrganizationApi,
  getOrganization,
  getOrganizationsForSearch,
} from '../services/organizationService';
import GroupSearchDropdown from '../components/common/GroupSearchDropdown';
import { getApprovedAffiliates } from '../services/affiliateAdminService';
import { useStaffUsers } from '../hooks/useStaffUsers';
import { useAuth } from '../auth/AuthContext';
import DateInput from '../components/common/DateInput';
import ClientSearchDropdown from '../components/common/ClientSearchDropdown';
import ContactMultiSelect from '../components/common/ContactMultiSelect';
import NameCollisionModal from '../components/common/NameCollisionModal';

// ── Constants ─────────────────────────────────────────────────────────────────
const ORG_TYPES = ['Company', 'LLP', 'Partnership', 'Proprietorship', 'Trust', 'Society', 'Other'];
const STATUS_OPTIONS = ['active', 'inactive', 'prospect'];

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const CIN_REGEX = /^[A-Z]{1}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;

// Same lists as ContactCreatePage (country + Indian states for address)
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

function deriveCountryFromLegacyState(state) {
  const s = (state || '').trim();
  if (!s) return 'India';
  if (s === 'Outside India') return 'Other';
  if (INDIAN_STATES.includes(s)) return 'India';
  return 'India';
}

function normalizeOrgStateForCountry(state, country) {
  if (country !== 'India') return 'Outside India';
  const st = (state || '').trim();
  if (st === 'Outside India') return '';
  return state || '';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toTitleCase(str) {
  return str.replace(/\w\S*/g, (word) =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

function isTitleCase(val) {
  if (!val.trim()) return true;
  return val.trim().split(/\s+/).every(word => /^[A-Z]/.test(word));
}

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

function generateContactId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'ct-' + crypto.randomUUID();
  }
  return 'ct-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
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
    secondaryContactIds: [],
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    country: 'India',
    state: '',
    pin: '',
    status: 'active',
    assignedManager: defaultManager || '',
    notes: '',
    group_id: '',
    reference: '',
    referringAffiliateUserId: '',
    referralStartDate: '',
    commissionMode: 'referral_only',
    clientFacingRestricted: false,
  };
}

/** Collapse whitespace + lowercase for name comparison (no PII in logs). */
function normalizeDisplayNameKey(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Stable key so save-time vs debounced duplicate hints do not fight the collision effect. */
function nameDuplicateSignature(dup) {
  if (!dup?.matches?.length) return '';
  const ids = dup.matches.map((m) => m.id).sort((a, b) => a - b);
  return `${dup.kind}:${ids.join(',')}`;
}

function sortDupMatches(matches) {
  return [...matches].sort((a, b) => a.id - b.id);
}

/**
 * Classify other-directory rows vs the typed name.
 * `peers` must already exclude the record being edited (if any).
 *
 * @param {string} trimmedInput
 * @param {Array<{ id: unknown, displayName?: string }>} peers
 * @returns {null | { kind: 'identical' | 'similar', matches: { id: number, label: string }[] }}
 */
function classifyNameDuplicates(trimmedInput, peers) {
  const t = normalizeDisplayNameKey(trimmedInput);
  const identical = [];
  const similar = [];
  for (const p of peers || []) {
    if (!p) continue;
    const label = String(p.displayName || '').trim() || '—';
    const pNorm = normalizeDisplayNameKey(label);
    if (!t || !pNorm) continue;
    const id = Number(p.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (t === pNorm) {
      identical.push({ id, label });
    } else {
      const [shorter, longer] = t.length <= pNorm.length ? [t, pNorm] : [pNorm, t];
      if (shorter.length >= 3 && longer.includes(shorter)) {
        similar.push({ id, label });
      }
    }
  }
  if (identical.length) return { kind: 'identical', matches: sortDupMatches(identical) };
  if (similar.length) return { kind: 'similar', matches: sortDupMatches(similar) };
  return null;
}

// ── Main page component ───────────────────────────────────────────────────────
export default function OrganizationCreatePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [orgCode, setOrgCode] = useState('Auto-generated');
  const [orgId, setOrgId] = useState(null);
  const [form, setForm] = useState(() => blankForm());
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const [primaryContactDisplayName, setPrimaryContactDisplayName] = useState('');
  const [secondaryContactNamesById, setSecondaryContactNamesById] = useState({});
  /** Label for selected client group (from API `group_name` or search pick). */
  const [groupDisplayName, setGroupDisplayName] = useState('');

  // Inline "Create New Contact" modal state
  const [showNewContactModal, setShowNewContactModal] = useState(false);
  const [newContactForm, setNewContactForm] = useState({ displayName: '', mobile: '', email: '' });
  const [newContactErrors, setNewContactErrors] = useState({});
  const [savingNewContact, setSavingNewContact] = useState(false);

  const [duplicateConflict, setDuplicateConflict] = useState(null);
  /** Inline name duplicate / similarity (from search API; not persisted server-side). */
  const [nameDuplicateInfo, setNameDuplicateInfo] = useState(null);
  const [nameCollisionModalOpen, setNameCollisionModalOpen] = useState(false);
  /** Set to `'save'` when identical duplicate blocked a save attempt (modal copy). */
  const [nameCollisionBlockingReason, setNameCollisionBlockingReason] = useState(null);
  const nameCollisionSigRef = useRef('');
  /** After user confirms similar-name modal, run this callback post successful API save. */
  const pendingOrgSaveRef = useRef(null);

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

  // Load existing org in edit mode
  useEffect(() => {
    if (!isEdit) return;
    getOrganization(id)
      .then(existing => {
        setOrgCode(existing.clientCode || `ORG-${String(existing.id).padStart(4, '0')}`);
        setOrgId(existing.id);
        const rawCountry = existing.country || deriveCountryFromLegacyState(existing.state);
        const country = COUNTRIES.includes(rawCountry) ? rawCountry : 'India';
        const state = normalizeOrgStateForCountry(existing.state || '', country);
        setPrimaryContactDisplayName(existing.primaryContact || '');
        setSecondaryContactNamesById({});
        const nextGroupIdStr =
          existing.groupId != null && existing.groupId !== ''
            ? String(existing.groupId)
            : existing.group_id != null && existing.group_id !== ''
              ? String(existing.group_id)
              : '';
        setGroupDisplayName(existing.groupName || '');
        setForm({
          displayName:        existing.displayName        || '',
          constitution:       existing.constitution       || '',
          pan:                existing.pan                || '',
          gstin:              existing.gstin              || '',
          cin:                existing.cin                || '',
          primaryContactId:   existing.primaryContactId   || '',
          secondaryContactIds: existing.secondaryContactIds || [],
          email:              existing.email              || '',
          phone:              existing.phone              || '',
          addressLine1:       existing.addressLine1        || '',
          addressLine2:       existing.addressLine2        || '',
          city:               existing.city               || '',
          country,
          state,
          pin:                existing.pin ?? existing.pincode ?? '',
          status:             existing.status             || 'active',
          assignedManager:    existing.assignedManager    || '',
          notes:              existing.notes              || '',
          group_id:           nextGroupIdStr,
          reference:          existing.reference          || '',
          referringAffiliateUserId: existing.referringAffiliateUserId != null ? String(existing.referringAffiliateUserId) : '',
          referralStartDate: existing.referralStartDate || '',
          commissionMode: existing.commissionMode || 'referral_only',
          clientFacingRestricted: Boolean(existing.clientFacingRestricted),
        });
      })
      .catch(() => {});
  }, [isEdit, id]);

  useEffect(() => {
    const q = (form.displayName || '').trim();
    if (q.length < 2) {
      setNameDuplicateInfo(null);
      return undefined;
    }
    if (isEdit && (orgId == null || !Number.isFinite(Number(orgId)))) return undefined;
    const t = setTimeout(() => {
      getOrganizationsForSearch(q, 50)
        .then((rows) => {
          const curId = orgId != null ? Number(orgId) : NaN;
          const others = (rows || []).filter((o) => o && (!Number.isFinite(curId) || curId <= 0 || Number(o.id) !== curId));
          const dup = classifyNameDuplicates(q, others);
          setNameDuplicateInfo(dup);
        })
        .catch(() => {
          setNameDuplicateInfo(null);
        });
    }, 450);
    return () => clearTimeout(t);
  }, [form.displayName, isEdit, orgId]);

  useEffect(() => {
    if (!nameDuplicateInfo) {
      nameCollisionSigRef.current = '';
      pendingOrgSaveRef.current = null;
      setNameCollisionModalOpen(false);
      setNameCollisionBlockingReason(null);
      return;
    }
    const sig = nameDuplicateSignature(nameDuplicateInfo);
    if (sig !== nameCollisionSigRef.current) {
      nameCollisionSigRef.current = sig;
      setNameCollisionModalOpen(true);
      // Do not clear a save-driven confirmation (`blockingReason === 'save'`) when the user
      // clicked Save and we set `pendingOrgSaveRef`; only typing-driven sig changes clear it.
      if (!pendingOrgSaveRef.current) {
        setNameCollisionBlockingReason(null);
      }
    }
  }, [nameDuplicateInfo]);

  // Close toast automatically after 3 s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  function setField(field, value) {
    const formatted = (field === 'displayName' || field === 'city') ? toTitleCase(value) : value;
    setForm(prev => ({ ...prev, [field]: formatted }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  }

  function handlePrimaryClientSelect({ id, displayName }) {
    const pid = id === '' || id == null ? '' : String(id);
    const numPid = Number(pid);
    setPrimaryContactDisplayName(displayName || '');
    setForm(prev => {
      const sec = (prev.secondaryContactIds || [])
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0);
      let nextSec = sec;
      if (Number.isFinite(numPid) && numPid > 0 && sec.includes(numPid)) {
        nextSec = sec.filter((x) => x !== numPid);
      }
      return { ...prev, primaryContactId: pid, secondaryContactIds: nextSec };
    });
    setSecondaryContactNamesById((prev) => {
      if (!Number.isFinite(numPid) || numPid <= 0) return prev;
      const n = { ...prev };
      delete n[numPid];
      delete n[String(numPid)];
      return n;
    });
    if (errors.primaryContactId) setErrors((prev) => ({ ...prev, primaryContactId: '' }));
  }

  function handleSecondaryContactsChange({ ids, namesById: nextNames }) {
    setSecondaryContactNamesById(nextNames);
    setField('secondaryContactIds', ids);
  }

  function handleCountryChange(country) {
    setForm(prev => ({
      ...prev,
      country,
      state: country !== 'India' ? 'Outside India' : (prev.state === 'Outside India' ? '' : prev.state),
    }));
    if (errors.country) setErrors(prev => ({ ...prev, country: '' }));
    if (errors.state) setErrors(prev => ({ ...prev, state: '' }));
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
  async function executePendingSave() {
    const pending = pendingOrgSaveRef.current;
    if (!pending?.afterSave) return;
    setSubmitting(true);
    try {
      if (isEdit && orgId) {
        await updateOrganizationApi(orgId, buildOrg(form));
        setToast({ message: '✅ Organization updated successfully!', type: 'success' });
      } else {
        await createOrganization(buildOrg(form));
        setToast({ message: '✅ Organization created successfully!', type: 'success' });
      }
      pendingOrgSaveRef.current = null;
      setNameCollisionModalOpen(false);
      setNameCollisionBlockingReason(null);
      pending.afterSave();
    } catch (err) {
      pendingOrgSaveRef.current = null;
      setNameCollisionModalOpen(false);
      setNameCollisionBlockingReason(null);
      if (err instanceof ApiError && err.status === 409 && err.body?.data?.existing) {
        setDuplicateConflict({
          fields: Array.isArray(err.body.data.fields) ? err.body.data.fields : [],
          existing: err.body.data.existing,
        });
      } else {
        setToast({ message: '❌ Error: ' + (err.message || 'Failed to save.'), type: 'error' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  function buildOrg(f) {
    return {
      displayName:  f.displayName.trim(),
      constitution: f.constitution       || null,
      pan:          f.pan.toUpperCase()  || null,
      gstin:        f.gstin.toUpperCase() || null,
      cin:          f.cin.toUpperCase()  || null,
      primaryContactId: f.primaryContactId || null,
      email:        f.email              || null,
      phone:        f.phone              || null,
      addressLine1: f.addressLine1        || null,
      addressLine2: f.addressLine2        || null,
      city:         f.city               || null,
      country:      f.country            || 'India',
      state:        f.state              || null,
      pin:          f.pin                || null,
      status:       f.status,
      assignedManager: f.assignedManager,
      notes:        f.notes              || null,
      group_id:     f.group_id || null,
      reference:    f.reference          || null,
      referringAffiliateUserId: f.referringAffiliateUserId || null,
      referralStartDate: f.referralStartDate || null,
      commissionMode: f.commissionMode || 'referral_only',
      clientFacingRestricted: f.clientFacingRestricted,
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

    const trimmedName = form.displayName.trim();
    if (trimmedName.length >= 2) {
      try {
        const rows = await getOrganizationsForSearch(trimmedName, 50);
        const curOid = isEdit && orgId ? Number(orgId) : NaN;
        const fromApi = (rows || []).filter(
          (o) => o && (!Number.isFinite(curOid) || curOid <= 0 || Number(o.id) !== curOid),
        );
        const hintPeers = (nameDuplicateInfo?.matches || []).map((m) => ({
          id: m.id,
          displayName: m.label,
        }));
        const mergedById = new Map();
        for (const o of fromApi) {
          if (o && o.id != null) mergedById.set(Number(o.id), o);
        }
        for (const h of hintPeers) {
          const hid = Number(h.id);
          if (!Number.isFinite(hid) || hid <= 0) continue;
          if (!mergedById.has(hid)) mergedById.set(hid, h);
        }
        const others = [...mergedById.values()];
        const dup = classifyNameDuplicates(trimmedName, others);
        setNameDuplicateInfo(dup);
        if (dup?.kind === 'identical') {
          nameCollisionSigRef.current = nameDuplicateSignature(dup);
          setNameCollisionBlockingReason('save');
          setNameCollisionModalOpen(true);
          setSubmitting(false);
          return;
        }
        if (dup?.kind === 'similar') {
          pendingOrgSaveRef.current = { afterSave };
          nameCollisionSigRef.current = nameDuplicateSignature(dup);
          setNameCollisionBlockingReason('save');
          setNameCollisionModalOpen(true);
          setSubmitting(false);
          return;
        }
      } catch {
        const hintPeers = (nameDuplicateInfo?.matches || []).map((m) => ({
          id: m.id,
          displayName: m.label,
        }));
        if (hintPeers.length) {
          const curOid = isEdit && orgId ? Number(orgId) : NaN;
          const peers = hintPeers.filter(
            (h) => h && (!Number.isFinite(curOid) || curOid <= 0 || Number(h.id) !== curOid),
          );
          const dup = classifyNameDuplicates(trimmedName, peers);
          setNameDuplicateInfo(dup);
          if (dup?.kind === 'identical') {
            nameCollisionSigRef.current = nameDuplicateSignature(dup);
            setNameCollisionBlockingReason('save');
            setNameCollisionModalOpen(true);
            setSubmitting(false);
            return;
          }
          if (dup?.kind === 'similar') {
            pendingOrgSaveRef.current = { afterSave };
            nameCollisionSigRef.current = nameDuplicateSignature(dup);
            setNameCollisionBlockingReason('save');
            setNameCollisionModalOpen(true);
            setSubmitting(false);
            return;
          }
        }
      }
    }

    try {
      if (isEdit && orgId) {
        await updateOrganizationApi(orgId, buildOrg(form));
        setToast({ message: '✅ Organization updated successfully!', type: 'success' });
      } else {
        await createOrganization(buildOrg(form));
        setToast({ message: '✅ Organization created successfully!', type: 'success' });
      }
      afterSave();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.body?.data?.existing) {
        setDuplicateConflict({
          fields: Array.isArray(err.body.data.fields) ? err.body.data.fields : [],
          existing: err.body.data.existing,
        });
      } else {
        setToast({ message: '❌ Error: ' + (err.message || 'Failed to save.'), type: 'error' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleSaveQuit() {
    handleSave(() => setTimeout(() => navigate('/clients/organizations'), 800));
  }

  function handleSaveNew() {
    const manager = form.assignedManager;
    handleSave(() => {
      setForm(blankForm(manager));
      setPrimaryContactDisplayName('');
      setSecondaryContactNamesById({});
      setGroupDisplayName('');
      setNameDuplicateInfo(null);
    });
  }

  function handleCancel() {
    navigate('/clients/organizations');
  }

  // ── Inline "Create New Contact" modal ────────────────────────────────────────
  function openNewContactModal() {
    setNewContactForm({ displayName: '', mobile: '', email: '' });
    setNewContactErrors({});
    setShowNewContactModal(true);
  }

  function closeNewContactModal() {
    setShowNewContactModal(false);
  }

  function handleSaveNewContact() {
    const errs = {};
    if (!newContactForm.displayName.trim()) errs.displayName = 'Full name is required.';
    const hasMobile = newContactForm.mobile.trim().length > 0;
    const hasEmail = newContactForm.email.trim().length > 0;
    if (!hasMobile && !hasEmail) {
      errs.mobile = 'Either Mobile or Email is required.';
      errs.email = 'Either Mobile or Email is required.';
    } else if (hasMobile && !/^\+?[\d\s\-]{7,15}$/.test(newContactForm.mobile.trim())) {
      errs.mobile = 'Enter a valid mobile number.';
    }
    if (newContactForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newContactForm.email.trim())) {
      errs.email = 'Enter a valid email address.';
    }
    if (Object.keys(errs).length > 0) {
      setNewContactErrors(errs);
      return;
    }
    setSavingNewContact(true);
    createContact({
      displayName: newContactForm.displayName.trim(),
      mobile:      newContactForm.mobile.trim() || undefined,
      email:       newContactForm.email.trim()  || undefined,
      status:      'active',
    }).then(newContact => {
      setPrimaryContactDisplayName(newContact.displayName || '');
      setField('primaryContactId', String(newContact.id));
      setSavingNewContact(false);
      setShowNewContactModal(false);
      setToast({ message: `✅ Contact "${newContact.displayName}" created and set as Primary Contact.`, type: 'success' });
    }).catch(err => {
      setSavingNewContact(false);
      setToast({ message: '❌ Error: ' + (err.message || 'Failed to create contact.'), type: 'error' });
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={pageWrap}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <NameCollisionModal
        open={nameCollisionModalOpen && Boolean(nameDuplicateInfo)}
        onClose={() => {
          pendingOrgSaveRef.current = null;
          setNameCollisionModalOpen(false);
          setNameCollisionBlockingReason(null);
        }}
        kind={nameDuplicateInfo?.kind}
        entityNoun="organization"
        matches={nameDuplicateInfo?.matches || []}
        onOpenRecord={(rid) => navigate(`/clients/organizations/${rid}/edit`)}
        blockingReason={nameCollisionBlockingReason}
        onConfirm={
          nameDuplicateInfo?.kind === 'similar' && nameCollisionBlockingReason === 'save'
            ? () => { void executePendingSave(); }
            : undefined
        }
        confirmLabel={isEdit ? 'Confirm update' : 'Confirm save'}
        confirmBusy={submitting}
      />

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
            {nameDuplicateInfo && !nameCollisionModalOpen && (
              <button
                type="button"
                onClick={() => setNameCollisionModalOpen(true)}
                style={{
                  marginTop: 10,
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
                  : 'View similar organization name(s)…'}
              </button>
            )}
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <ClientSearchDropdown
                  value={form.primaryContactId}
                  displayValue={primaryContactDisplayName}
                  onChange={handlePrimaryClientSelect}
                  placeholder="Type at least 2 characters to search contacts…"
                  minQueryLength={2}
                  searchLimit={50}
                  clearSelectionWhenInputEmpty
                  style={{ ...selectStyle, borderRadius: 8 }}
                />
              </div>
              <button
                type="button"
                onClick={openNewContactModal}
                style={{
                  padding: '7px 12px',
                  background: '#F37920',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                + Create New Contact
              </button>
            </div>
          </div>

          {/* Secondary Contacts */}
          <div style={{ marginTop: 14 }}>
            <FieldLabel label="Secondary Contacts" />
            <ContactMultiSelect
              selectedIds={form.secondaryContactIds || []}
              namesById={secondaryContactNamesById}
              onChange={handleSecondaryContactsChange}
              excludeIds={form.primaryContactId ? [form.primaryContactId] : []}
            />
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
              <FieldLabel label="Country" />
              <select value={form.country} onChange={e => handleCountryChange(e.target.value)} style={selectStyle}>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={fieldWrap}>
              <FieldLabel label="State" />
              {form.country === 'India' ? (
                <select value={form.state} onChange={e => setField('state', e.target.value)} style={selectStyle}>
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

        <FormSection title="Referral &amp; commission">
          <div style={fieldRow}>
            <div style={fieldWrap}>
              <FieldLabel label="Referring affiliate" />
              {canListAffiliates ? (
                <select
                  value={form.referringAffiliateUserId}
                  onChange={e => setField('referringAffiliateUserId', e.target.value)}
                  style={selectStyle}
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
                  Picking an affiliate requires <strong>Affiliates</strong> admin permission.
                </p>
              )}
            </div>
            <div style={fieldWrap}>
              <FieldLabel label="Referral start date" />
              <DateInput
                value={form.referralStartDate}
                onChange={e => setField('referralStartDate', e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={fieldWrap}>
              <FieldLabel label="Commission mode" />
              <select value={form.commissionMode} onChange={e => setField('commissionMode', e.target.value)} style={selectStyle}>
                <option value="referral_only">Referral only (tiered %)</option>
                <option value="direct_interaction">Direct interaction (50/50 split)</option>
              </select>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 12, fontSize: 13, color: '#334155', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.clientFacingRestricted}
              onChange={e => setField('clientFacingRestricted', e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>Client-facing restricted (default for new service engagements)</span>
          </label>
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
                {staffUsers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
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

          <div style={{ marginTop: 14 }}>
            <FieldLabel label="Group" />
            <GroupSearchDropdown
              value={form.group_id}
              displayValue={groupDisplayName}
              onChange={({ id, displayName }) => {
                setField('group_id', id ? String(id) : '');
                setGroupDisplayName(displayName || '');
              }}
              placeholder="Search group by name…"
              style={inputStyle}
            />
            <p style={{ fontSize: 12, color: '#64748b', margin: '6px 0 0' }}>
              Type to search. Clear the field to remove the organization from its group.
            </p>
          </div>

          <div style={{ marginTop: 14 }}>
            <FieldLabel label="Reference" />
            <input
              value={form.reference || ''}
              onChange={e => {
                const val = toTitleCase(e.target.value);
                setField('reference', val);
                if (errors.reference) setErrors(prev => ({ ...prev, reference: '' }));
              }}
              onBlur={e => {
                const val = (e.target.value || '').trim();
                if (val && !isTitleCase(val)) {
                  setErrors(prev => ({ ...prev, reference: 'Reference must be in Title Case (e.g. Western India).' }));
                }
              }}
              placeholder="e.g. Western India, REF-001…"
              style={{ ...inputStyle, borderColor: errors.reference ? '#ef4444' : undefined }}
            />
            {errors.reference && <ErrorMsg msg={errors.reference} />}
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

      {/* ── Inline Create New Contact Modal ─────────────────────────────────── */}
      {duplicateConflict && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000, padding: 16,
        }}>
          <div style={{
            background: '#fff', borderRadius: 14, padding: 24,
            width: '100%', maxWidth: 480,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0B1F3B' }}>Duplicate identifiers</div>
              <button type="button" onClick={() => setDuplicateConflict(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={18} color="#64748b" />
              </button>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
              Another organization is already using the same{' '}
              {duplicateConflict.fields.length > 0
                ? duplicateConflict.fields.map(f => (f === 'pan' ? 'PAN' : f === 'gstin' ? 'GSTIN' : f === 'cin' ? 'CIN' : f)).join(', ')
                : 'PAN, GSTIN, or CIN'}
              . You cannot create or save this record until those values are unique.
            </p>
            <div style={{
              background: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 16,
              border: '1px solid #e2e8f0', fontSize: 13,
            }}>
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{duplicateConflict.existing.name || 'Existing organization'}</div>
              <div style={{ display: 'grid', gap: 6, color: '#334155' }}>
                {duplicateConflict.existing.id != null && (
                  <div><span style={{ color: '#64748b', fontWeight: 600 }}>ID</span>{' '}{String(duplicateConflict.existing.id)}</div>
                )}
                {duplicateConflict.existing.pan && (
                  <div style={{ fontFamily: 'monospace', fontSize: 12 }}><span style={{ color: '#64748b', fontWeight: 600 }}>PAN</span>{' '}{duplicateConflict.existing.pan}</div>
                )}
                {duplicateConflict.existing.gstin && (
                  <div style={{ fontFamily: 'monospace', fontSize: 12 }}><span style={{ color: '#64748b', fontWeight: 600 }}>GSTIN</span>{' '}{duplicateConflict.existing.gstin}</div>
                )}
                {duplicateConflict.existing.cin && (
                  <div style={{ fontFamily: 'monospace', fontSize: 12 }}><span style={{ color: '#64748b', fontWeight: 600 }}>CIN</span>{' '}{duplicateConflict.existing.cin}</div>
                )}
                {(duplicateConflict.existing.city || duplicateConflict.existing.state) && (
                  <div style={{ fontSize: 12 }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>Location</span>{' '}
                    {[duplicateConflict.existing.city, duplicateConflict.existing.state].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setDuplicateConflict(null)} style={btnCancel}>
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const eid = duplicateConflict.existing.id;
                  setDuplicateConflict(null);
                  if (eid != null) navigate(`/clients/organizations/${eid}/edit`);
                }}
                style={btnPrimary}
              >
                Open existing organization
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewContactModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000, padding: 16,
        }}>
          <div style={{
            background: '#fff', borderRadius: 14, padding: 24,
            width: '100%', maxWidth: 440,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0B1F3B' }}>Create New Contact</div>
              <button onClick={closeNewContactModal} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={18} color="#64748b" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={fieldLabelStyle}>Full Name <span style={{ color: '#ef4444' }}>*</span></div>
                <input
                  value={newContactForm.displayName}
                  onChange={e => setNewContactForm(prev => ({ ...prev, displayName: toTitleCase(e.target.value) }))}
                  placeholder="e.g. Ramesh Agarwal"
                  style={{ ...inputStyle, borderColor: newContactErrors.displayName ? '#ef4444' : '#E6E8F0' }}
                  autoFocus
                />
                {newContactErrors.displayName && <div style={errorMsgStyle}>{newContactErrors.displayName}</div>}
              </div>

              <div>
                <div style={fieldLabelStyle}>Primary Mobile <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 11 }}>(required if no email)</span></div>
                <input
                  value={newContactForm.mobile}
                  onChange={e => setNewContactForm(prev => ({ ...prev, mobile: e.target.value }))}
                  placeholder="e.g. 9876543210"
                  style={{ ...inputStyle, borderColor: newContactErrors.mobile ? '#ef4444' : '#E6E8F0' }}
                />
                {newContactErrors.mobile && <div style={errorMsgStyle}>{newContactErrors.mobile}</div>}
              </div>

              <div>
                <div style={fieldLabelStyle}>Email <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 11 }}>(optional)</span></div>
                <input
                  type="email"
                  value={newContactForm.email}
                  onChange={e => setNewContactForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="e.g. ramesh@example.com"
                  style={{ ...inputStyle, borderColor: newContactErrors.email ? '#ef4444' : '#E6E8F0' }}
                />
                {newContactErrors.email && <div style={errorMsgStyle}>{newContactErrors.email}</div>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button
                onClick={closeNewContactModal}
                style={btnCancel}
                disabled={savingNewContact}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewContact}
                style={{ ...btnPrimary, opacity: savingNewContact ? 0.7 : 1 }}
                disabled={savingNewContact}
              >
                {savingNewContact ? '⏳ Saving…' : 'Save Contact'}
              </button>
            </div>
          </div>
        </div>
      )}
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

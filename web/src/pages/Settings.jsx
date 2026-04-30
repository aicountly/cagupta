import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getPortalTypes } from '../constants/portalTypes';
import { fetchPortalTypes, createPortalType, updatePortalType, deletePortalType } from '../services/portalTypeService';
import { getRegisterTypes, saveRegisterTypes } from '../constants/registerTypes';
import { loadBillingProfiles, saveBillingProfiles } from '../constants/billingProfiles';
import { stateCodeFromGstin } from '../utils/gstUtils';
import {
  getCategories,
  createCategory, deleteCategory,
  createSubcategory, deleteSubcategory,
  createEngagementTypeForSubcategory, deleteEngagementType,
} from '../services/serviceCategoryService';
import {
  getQuotationDefaults,
  getQuotationPendingSummary,
  requestQuotationSetupOtp,
  saveQuotationDefault,
} from '../services/quotationService';
import { API_BASE_URL } from '../constants/config';
import { Link, useNavigate } from 'react-router-dom';
import { getZoomIntegrationStatus, getZoomAuthorizeUrl } from '../services/zoomIntegrationService';

// ── Available permission modules ─────────────────────────────────────────────
const PERMISSION_GROUPS = [
  { group: 'Dashboard',   keys: ['dashboard.view'] },
  { group: 'Clients',     keys: ['clients.view', 'clients.create', 'clients.edit', 'clients.delete'] },
  { group: 'Services',    keys: ['services.view', 'services.create', 'services.edit', 'services.delete', 'services.assignees.manage'] },
  { group: 'Documents',   keys: ['documents.view', 'documents.upload'] },
  { group: 'Invoices',    keys: ['invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete'] },
  { group: 'Calendar',    keys: ['calendar.view', 'calendar.create'] },
  { group: 'Credentials', keys: ['credentials.view'] },
  { group: 'Registers',   keys: ['registers.view'] },
  { group: 'Leads',       keys: ['leads.view', 'leads.create', 'leads.edit'] },
  { group: 'Quotations',  keys: ['quotations.setup', 'quotations.manage'] },
  { group: 'Affiliates',  keys: ['affiliates.manage'] },
  { group: 'Settings',    keys: ['settings.view'] },
  { group: 'Users',       keys: ['users.manage', 'users.delegate'] },
];

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseApiResponse(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`);
  return json;
}

// ── Configure Role Modal ──────────────────────────────────────────────────────
function ConfigureRoleModal({ role, onClose, onSaved }) {
  // Parse permissions — DB stores as {"permissions": [...]} or just [...]
  function parsePerms(raw) {
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed.permissions)) return parsed.permissions;
    } catch { /* ignore */ }
    return [];
  }

  const initial = parsePerms(role.permissions);
  const [enabled, setEnabled] = useState(() => new Set(initial));
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  function toggle(key) {
    setEnabled(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/admin/roles/${role.id}`, {
        method:  'PUT',
        headers: authHeaders(),
        body:    JSON.stringify({ permissions: Array.from(enabled) }),
      });
      await parseApiResponse(res);
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to save permissions.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={{ background:'#fff', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.18)', width:'100%', maxWidth:560, maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 24px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
          <span style={{ fontSize:15, fontWeight:700 }}>🔐 Configure — {role.display_name || role.name}</span>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ padding:'16px 24px', overflowY:'auto', flex:1 }}>
          {role.name === 'super_admin' ? (
            <div style={{ padding:'16px', background:'#fef9c3', border:'1px solid #fde047', borderRadius:8, fontSize:13, color:'#713f12' }}>
              The Super Admin role has full access to everything and cannot be restricted.
            </div>
          ) : (
            PERMISSION_GROUPS.map(g => (
              <div key={g.group} style={{ marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>{g.group}</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {g.keys.map(key => (
                    <label key={key} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:13, color:'#334155', padding:'4px 10px', border:`1px solid ${enabled.has(key)?'#2563eb':'#e2e8f0'}`, borderRadius:6, background: enabled.has(key)?'#eff6ff':'#fff', userSelect:'none' }}>
                      <input
                        type="checkbox"
                        checked={enabled.has(key)}
                        onChange={() => toggle(key)}
                        style={{ accentColor:'#2563eb', cursor:'pointer' }}
                      />
                      {key.split('.').slice(1).join('.')}
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
          {error && <div style={{ color:'#dc2626', fontSize:12, marginTop:8 }}>{error}</div>}
        </div>
        <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #f1f5f9', flexShrink:0 }}>
          <button onClick={onClose} style={btnSecondary} disabled={saving}>Cancel</button>
          {role.name !== 'super_admin' && (
            <button onClick={handleSave} style={btnPrimary} disabled={saving}>
              {saving ? 'Saving…' : '💾 Save Permissions'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Edit User Modal ───────────────────────────────────────────────────────────
function EditUserModal({ user, roles, onClose, onSaved }) {
  const roleName = user.role_name || user.role || '';
  const matchedRole = roles.find(r => r.name === roleName);

  const [form, setForm] = useState({
    name: user.name || '',
    roleId: matchedRole ? String(matchedRole.id) : '',
    isActive: user.is_active !== false,
    shiftTargetMinutes: user.shift_target_minutes || 510,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSave() {
    const name = form.name.trim();
    if (!name) { setError('Name is required.'); return; }
    const shiftMins = Math.max(60, Math.min(1440, parseInt(form.shiftTargetMinutes, 10) || 510));
    setSaving(true);
    setError('');
    try {
      const payload = { name, is_active: form.isActive, shift_target_minutes: shiftMins };
      if (form.roleId) payload.role_id = parseInt(form.roleId, 10);
      const res = await fetch(`${API_BASE_URL}/admin/users/${user.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const json = await parseApiResponse(res);
      onSaved(json.data || json);
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to update user.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={{ background:'#fff', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.18)', width:'100%', maxWidth:480, display:'flex', flexDirection:'column' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 24px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
          <span style={{ fontSize:15, fontWeight:700 }}>✏️ Edit User — {user.name}</span>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14, overflowY:'auto' }}>
          <div>
            <label style={labelStyle}>Full Name</label>
            <input
              value={form.name}
              onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setError(''); }}
              style={inputStyle}
              autoFocus
            />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input value={user.email} disabled style={{ ...inputStyle, background:'#f8fafc', color:'#94a3b8' }} />
            <div style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>Email cannot be changed from here.</div>
          </div>
          {roles.length > 0 && (
            <div>
              <label style={labelStyle}>Role</label>
              <select
                value={form.roleId}
                onChange={e => setForm(p => ({ ...p, roleId: e.target.value }))}
                style={inputStyle}
              >
                <option value="">— Select role —</option>
                {roles.map(r => (
                  <option key={r.id} value={String(r.id)}>
                    {r.display_name || r.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label style={labelStyle}>Daily shift target (minutes)</label>
            <input
              type="number"
              min={60}
              max={1440}
              value={form.shiftTargetMinutes}
              onChange={e => setForm(p => ({ ...p, shiftTargetMinutes: e.target.value }))}
              style={inputStyle}
            />
            <div style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>60–1440 min. Default: 510 (8 h 30 m).</div>
          </div>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#334155', cursor:'pointer' }}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
              style={{ accentColor:'#2563eb' }}
            />
            Active account
          </label>
          {error && <div style={{ color:'#dc2626', fontSize:12 }}>{error}</div>}
        </div>
        <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #f1f5f9', flexShrink:0 }}>
          <button onClick={onClose} style={btnSecondary} disabled={saving}>Cancel</button>
          <button onClick={handleSave} style={btnPrimary} disabled={saving}>
            {saving ? 'Saving…' : '💾 Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reset Password Modal ──────────────────────────────────────────────────────
function ResetPasswordModal({ user, onClose }) {
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(false);

  async function handleReset() {
    if (newPassword.length < 8)        { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${user.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ password: newPassword }),
      });
      await parseApiResponse(res);
      setSuccess(true);
    } catch (e) {
      setError(e.message || 'Failed to reset password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={{ background:'#fff', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.18)', width:'100%', maxWidth:420, display:'flex', flexDirection:'column' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 24px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
          <span style={{ fontSize:15, fontWeight:700 }}>🔑 Reset Password</span>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        {success ? (
          <div style={{ padding:'32px 24px', textAlign:'center' }}>
            <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
            <div style={{ fontWeight:700, fontSize:15, color:'#15803d', marginBottom:8 }}>Password Reset Successfully</div>
            <div style={{ fontSize:13, color:'#64748b', marginBottom:20 }}>
              A confirmation email has been sent to <strong>{user.email}</strong>.
            </div>
            <button onClick={onClose} style={btnPrimary}>Close</button>
          </div>
        ) : (
          <>
            <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ fontSize:13, color:'#92400e', background:'#fef3c7', border:'1px solid #fde68a', borderRadius:8, padding:'10px 14px' }}>
                You are setting a new password for <strong>{user.name}</strong> ({user.email}).
                They will receive an email notification.
              </div>
              <div>
                <label style={labelStyle}>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setError(''); }}
                  style={inputStyle}
                  autoFocus
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters"
                />
              </div>
              <div>
                <label style={labelStyle}>Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                  style={inputStyle}
                  autoComplete="new-password"
                  onKeyDown={e => e.key === 'Enter' && handleReset()}
                />
              </div>
              {error && <div style={{ color:'#dc2626', fontSize:12 }}>{error}</div>}
            </div>
            <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #f1f5f9', flexShrink:0 }}>
              <button onClick={onClose} style={btnSecondary} disabled={saving}>Cancel</button>
              <button
                onClick={handleReset}
                style={{ ...btnPrimary, background:'#dc2626' }}
                disabled={saving || !newPassword || !confirmPassword}
              >
                {saving ? 'Resetting…' : '🔑 Reset Password'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const FIRM_PROFILE_STORAGE_KEY = 'firm_profile';

const DEFAULT_FIRM_PROFILE = {
  name: 'CA Rahul Gupta & Associates',
  gstin: '27ABCDE1234F1Z5',
  pan: 'ABCDE1234F',
  address: '3rd Floor, Shree Complex, MG Road, Mumbai – 400001',
  phone: '022-12345678',
  email: 'office@carahulgupta.in',
  website: 'www.carahulgupta.in',
};

const FIRM_PROFILE_FIELD_KEYS = Object.keys(DEFAULT_FIRM_PROFILE);

function loadFirmProfile() {
  try {
    const raw = localStorage.getItem(FIRM_PROFILE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FIRM_PROFILE };
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_FIRM_PROFILE };
    return { ...DEFAULT_FIRM_PROFILE, ...parsed };
  } catch {
    return { ...DEFAULT_FIRM_PROFILE };
  }
}

const roleColors = { super_admin:'#fce7f3', admin:'#ffedd5', manager:'#dbeafe', staff:'#dcfce7', viewer:'#f3f4f6', affiliate:'#ede9fe', client:'#dcfce7' };
const roleTextColors = { super_admin:'#9d174d', admin:'#9a3412', manager:'#1e40af', staff:'#166534', viewer:'#374151', affiliate:'#5b21b6', client:'#166534' };

export default function Settings() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const canManageUserRates = hasPermission('users.manage');
  const canManageUsers     = hasPermission('users.manage') || hasPermission('users.delegate');
  const canConfigureRoles  = hasPermission('users.manage');
  const [tab, setTab] = useState('firm');
  const [zoomStatus, setZoomStatus] = useState({ connected: false, accountId: null });
  const [zoomLoading, setZoomLoading] = useState(false);
  const [portalTypes, setPortalTypes] = useState(() => getPortalTypes());
  const [newPortal, setNewPortal] = useState('');
  const [newPortalUrl, setNewPortalUrl] = useState('');
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState('');
  const [editingPortalId, setEditingPortalId] = useState(null);
  const [editPortalName, setEditPortalName] = useState('');
  const [editPortalUrl, setEditPortalUrl] = useState('');
  const [registerTypes, setRegisterTypes] = useState(() => getRegisterTypes());
  const [newRegister, setNewRegister] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [billingProfiles, setBillingProfiles] = useState(() => loadBillingProfiles());
  const [showBillingForm, setShowBillingForm] = useState(false);
  const [billingEdit, setBillingEdit] = useState(null);
  const [billingForm, setBillingForm] = useState({
    code: '', name: '', gstRegistered: false, gstin: '', stateCode: '', defaultGstRate: 18,
  });
  const [billingError, setBillingError] = useState('');

  // ── Service Configuration state ────────────────────────────────────────────
  const [serviceCategories, setServiceCategories] = useState([]);
  const [svcCatLoading, setSvcCatLoading] = useState(false);
  const [svcCatError, setSvcCatError] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [expandedCat, setExpandedCat] = useState({});
  const [newSubName, setNewSubName] = useState({});
  // newEtName is keyed by subcategory id (since engagement types now live under subcategories)
  const [newEtName, setNewEtName] = useState({});

  const [quotationRows, setQuotationRows] = useState([]);
  const [quotationLoading, setQuotationLoading] = useState(false);
  const [quotationError, setQuotationError] = useState('');
  const [quotationPending, setQuotationPending] = useState(null);
  const [quoteOtpModal, setQuoteOtpModal] = useState(null);
  const [quoteOtpPass, setQuoteOtpPass] = useState('');
  const [quoteOtpCode, setQuoteOtpCode] = useState('');
  const [quoteOtpRecipient, setQuoteOtpRecipient] = useState('super_admin');
  const [quoteOtpBusy, setQuoteOtpBusy] = useState(false);
  const [quoteOtpMsg, setQuoteOtpMsg] = useState('');
  const [quoteRowDrafts, setQuoteRowDrafts] = useState({});

  useEffect(() => {
    if (!quotationRows.length) {
      setQuoteRowDrafts({});
      return;
    }
    const next = {};
    quotationRows.forEach((r) => {
      next[r.engagement_type_id] = {
        price: r.default_price != null ? String(r.default_price) : '',
        documentsText: Array.isArray(r.documents_required) ? r.documents_required.join('\n') : '',
      };
    });
    setQuoteRowDrafts(next);
  }, [quotationRows]);

  // ── Team & Users state ─────────────────────────────────────────────────────
  const [teamUsers, setTeamUsers]       = useState([]);
  const [teamLoading, setTeamLoading]   = useState(false);
  const [teamError, setTeamError]       = useState('');
  const [teamRoles, setTeamRoles]       = useState([]);
  const [teamRateSavingId, setTeamRateSavingId] = useState(null);

  // ── Edit User modal state ──────────────────────────────────────────────────
  const [editUserModal, setEditUserModal] = useState(null);

  // ── Reset Password modal state ────────────────────────────────────────────
  const [resetPwModal, setResetPwModal] = useState(null);

  // ── Roles & Permissions state ──────────────────────────────────────────────
  const [roles, setRoles]                   = useState([]);
  const [rolesLoading, setRolesLoading]     = useState(false);
  const [configureRole, setConfigureRole]   = useState(null);

  const [firmProfile, setFirmProfile]     = useState(loadFirmProfile);
  const [firmSaving, setFirmSaving]       = useState(false);
  const [firmMessage, setFirmMessage]     = useState({ type: '', text: '' });

  function setFirmField(key, value) {
    setFirmProfile(prev => ({ ...prev, [key]: value }));
    setFirmMessage({ type: '', text: '' });
  }

  async function handleSaveFirmProfile() {
    setFirmSaving(true);
    setFirmMessage({ type: '', text: '' });
    try {
      const payload = {};
      for (const key of FIRM_PROFILE_FIELD_KEYS) {
        payload[key] = typeof firmProfile[key] === 'string' ? firmProfile[key] : String(firmProfile[key] ?? '');
      }
      localStorage.setItem(FIRM_PROFILE_STORAGE_KEY, JSON.stringify(payload));
      setFirmProfile({ ...payload });
      setFirmMessage({ type: 'ok', text: 'Firm profile saved.' });
    } catch (e) {
      setFirmMessage({ type: 'err', text: e.message || 'Could not save firm profile.' });
    } finally {
      setFirmSaving(false);
    }
  }

  useEffect(() => {
    if (tab === 'other') {
      setPortalLoading(true);
      fetchPortalTypes()
        .then(list => setPortalTypes(list))
        .catch(() => {})
        .finally(() => setPortalLoading(false));
    }
  }, [tab]);

  useEffect(() => {
    if (tab === 'roles') {
      setRolesLoading(true);
      fetch(`${API_BASE_URL}/admin/roles`, { headers: authHeaders() })
        .then(r => r.json())
        .then(data => setRoles(data.data || []))
        .catch(() => {})
        .finally(() => setRolesLoading(false));
    }
  }, [tab]);

  useEffect(() => {
    if (tab === 'team') {
      setTeamLoading(true);
      setTeamError('');
      Promise.all([
        fetch(`${API_BASE_URL}/admin/users?per_page=100`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_BASE_URL}/admin/roles`, { headers: authHeaders() }).then(r => r.json()),
      ])
        .then(([usersData, rolesData]) => {
          setTeamUsers(usersData.data || []);
          setTeamRoles(rolesData.data || []);
        })
        .catch(() => setTeamError('Failed to load team members.'))
        .finally(() => setTeamLoading(false));
    }
  }, [tab]);

  useEffect(() => {
    if (tab === 'service_config') {
      setSvcCatLoading(true);
      setSvcCatError('');
      getCategories()
        .then(setServiceCategories)
        .catch(() => setSvcCatError('Failed to load service categories.'))
        .finally(() => setSvcCatLoading(false));

      setQuotationLoading(true);
      setQuotationError('');
      Promise.all([getQuotationDefaults(), getQuotationPendingSummary()])
        .then(([rows, pending]) => {
          setQuotationRows(rows);
          setQuotationPending(pending);
        })
        .catch(() => setQuotationError('Failed to load quotation defaults.'))
        .finally(() => setQuotationLoading(false));
    }
  }, [tab]);

  function openQuoteSaveModal(row, draft) {
    setQuoteOtpMsg('');
    setQuoteOtpPass('');
    setQuoteOtpCode('');
    setQuoteOtpRecipient('super_admin');
    setQuoteOtpModal({ row, draft });
  }

  async function handleSendQuoteOtp() {
    if (!quoteOtpModal) return;
    setQuoteOtpBusy(true);
    setQuoteOtpMsg('');
    try {
      await requestQuotationSetupOtp({
        passphrase: quoteOtpPass,
        otpRecipient: quoteOtpRecipient,
      });
      setQuoteOtpMsg('OTP sent. Check the recipient inbox and enter the code below.');
    } catch (e) {
      setQuoteOtpMsg(e.message || 'Failed to send OTP.');
    } finally {
      setQuoteOtpBusy(false);
    }
  }

  async function handleConfirmQuoteSave() {
    if (!quoteOtpModal) return;
    const { row, draft } = quoteOtpModal;
    setQuoteOtpBusy(true);
    setQuoteOtpMsg('');
    try {
      const docs = (draft.documentsText || '')
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
      await saveQuotationDefault(row.engagement_type_id, {
        otp: quoteOtpCode,
        otpRecipient: quoteOtpRecipient,
        defaultPrice: draft.price,
        documentsRequired: docs,
      });
      const refreshed = await getQuotationDefaults();
      setQuotationRows(refreshed);
      const pending = await getQuotationPendingSummary();
      setQuotationPending(pending);
      setQuoteOtpModal(null);
    } catch (e) {
      setQuoteOtpMsg(e.message || 'Save failed.');
    } finally {
      setQuoteOtpBusy(false);
    }
  }

  function handleAddCategory() {
    if (!newCatName.trim()) return;
    createCategory({ name: newCatName.trim() })
      .then(cat => {
        setServiceCategories(prev => [...prev, { ...cat, subcategories: [], engagementTypes: [] }]);
        setNewCatName('');
      })
      .catch(() => setSvcCatError('Failed to add category.'));
  }

  function handleDeleteCategory(id) {
    if (!window.confirm('Delete this category and all its subcategories and engagement types? You cannot delete it if any service engagements still reference this category.')) return;
    deleteCategory(id)
      .then(() => setServiceCategories(prev => prev.filter(c => c.id !== id)))
      .catch((e) => setSvcCatError(e.message || 'Failed to delete category.'));
  }

  function handleAddSubcategory(categoryId) {
    const name = (newSubName[categoryId] || '').trim();
    if (!name) return;
    createSubcategory(categoryId, { name })
      .then(sub => {
        setServiceCategories(prev => prev.map(c =>
          c.id === categoryId ? { ...c, subcategories: [...(c.subcategories || []), sub] } : c
        ));
        setNewSubName(prev => ({ ...prev, [categoryId]: '' }));
      })
      .catch(() => setSvcCatError('Failed to add subcategory.'));
  }

  function handleDeleteSubcategory(categoryId, subId) {
    deleteSubcategory(subId)
      .then(() => setServiceCategories(prev => prev.map(c =>
        c.id === categoryId ? { ...c, subcategories: (c.subcategories || []).filter(s => s.id !== subId) } : c
      )))
      .catch((e) => setSvcCatError(e.message || 'Failed to delete subcategory.'));
  }

  function handleAddEngagementType(categoryId, subcategoryId) {
    const name = (newEtName[subcategoryId] || '').trim();
    if (!name) return;
    createEngagementTypeForSubcategory(subcategoryId, { name })
      .then(et => {
        setServiceCategories(prev => prev.map(c => {
          if (c.id !== categoryId) return c;
          return {
            ...c,
            subcategories: (c.subcategories || []).map(sub =>
              sub.id === subcategoryId
                ? { ...sub, engagementTypes: [...(sub.engagementTypes || []), et] }
                : sub
            ),
          };
        }));
        setNewEtName(prev => ({ ...prev, [subcategoryId]: '' }));
      })
      .catch(() => setSvcCatError('Failed to add engagement type.'));
  }

  function handleDeleteEngagementType(categoryId, subcategoryId, etId) {
    deleteEngagementType(etId)
      .then(() => setServiceCategories(prev => prev.map(c => {
        if (c.id !== categoryId) return c;
        return {
          ...c,
          subcategories: (c.subcategories || []).map(sub =>
            sub.id === subcategoryId
              ? { ...sub, engagementTypes: (sub.engagementTypes || []).filter(e => e.id !== etId) }
              : sub
          ),
        };
      })))
      .catch((e) => setSvcCatError(e.message || 'Failed to delete engagement type.'));
  }

  async function handleAddPortal() {
    const val = newPortal.trim();
    if (!val) { setPortalError('Portal name cannot be empty.'); return; }
    if (portalTypes.some(p => p.name === val)) { setPortalError('This portal already exists.'); return; }
    try {
      const item = await createPortalType({ name: val, url: newPortalUrl.trim() });
      setPortalTypes(prev => [...prev, item]);
      setNewPortal('');
      setNewPortalUrl('');
      setPortalError('');
    } catch (e) {
      setPortalError(e.message || 'Failed to add portal type.');
    }
  }

  async function handleDeletePortal(portal) {
    if (!window.confirm(`Delete portal type "${portal.name}"? This cannot be undone.`)) return;
    try {
      await deletePortalType(portal.id);
      setPortalTypes(prev => prev.filter(p => p.id !== portal.id));
      setPortalError('');
    } catch (e) {
      setPortalError(e.message || `Cannot delete "${portal.name}".`);
    }
  }

  function handleStartEditPortal(pt) {
    setEditingPortalId(pt.id);
    setEditPortalName(pt.name);
    setEditPortalUrl(pt.url || '');
    setPortalError('');
  }

  function handleCancelEditPortal() {
    setEditingPortalId(null);
    setEditPortalName('');
    setEditPortalUrl('');
    setPortalError('');
  }

  async function handleSavePortal(id) {
    const name = editPortalName.trim();
    if (!name) { setPortalError('Portal name cannot be empty.'); return; }
    if (portalTypes.some(p => p.name === name && String(p.id) !== String(id))) {
      setPortalError('Another portal type with this name already exists.');
      return;
    }
    try {
      const updated = await updatePortalType(id, { name, url: editPortalUrl.trim() });
      setPortalTypes(prev => prev.map(p => (String(p.id) === String(id) ? updated : p)));
      setEditingPortalId(null);
      setEditPortalName('');
      setEditPortalUrl('');
      setPortalError('');
    } catch (e) {
      setPortalError(e.message || 'Failed to update portal type.');
    }
  }

  function handleAddRegister() {
    const val = newRegister.trim();
    if (!val) { setRegisterError('Register name cannot be empty.'); return; }
    if (registerTypes.find(r => r.label === val)) { setRegisterError('This register already exists.'); return; }
    const key = val.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
    const updated = [...registerTypes, { key, label: val, icon: '📁' }];
    setRegisterTypes(updated);
    saveRegisterTypes(updated);
    setNewRegister('');
    setRegisterError('');
  }

  function handleDeleteRegister(key) {
    // Check localStorage registers for existing records
    try {
      const stored = localStorage.getItem('registers');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.some(r => r.registerType === key)) {
          setRegisterError('Cannot delete this register type — it has existing records. Delete those records first.');
          return;
        }
      }
    } catch { /* ignore */ }
    const updated = registerTypes.filter(r => r.key !== key);
    setRegisterTypes(updated);
    saveRegisterTypes(updated);
    setRegisterError('');
  }

  async function saveUserPlannedRate(userId, rawValue) {
    if (!canManageUserRates) return;
    const trimmed = String(rawValue ?? '').trim();
    let payloadVal = null;
    if (trimmed !== '') {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) {
        window.alert('Enter a valid non-negative number for planned ₹/hr, or leave empty.');
        return;
      }
      payloadVal = n;
    }
    setTeamRateSavingId(userId);
    try {
      await parseApiResponse(
        await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ planned_billable_rate_per_hour: payloadVal }),
        }),
      );
      setTeamUsers((prev) =>
        prev.map((row) =>
          row.id === userId ? { ...row, planned_billable_rate_per_hour: payloadVal } : row,
        ),
      );
    } catch (e) {
      window.alert(e.message || 'Could not save planned rate.');
    } finally {
      setTeamRateSavingId(null);
    }
  }

  useEffect(() => {
    if (tab !== 'integrations') return;
    setZoomLoading(true);
    getZoomIntegrationStatus()
      .then((d) => setZoomStatus({ connected: Boolean(d.connected), accountId: d.accountId || null }))
      .catch(() => setZoomStatus({ connected: false, accountId: null }))
      .finally(() => setZoomLoading(false));
  }, [tab]);

  useEffect(() => {
    function onMsg(ev) {
      if (ev?.data?.type !== 'zoom_oauth' || !ev.data.ok) return;
      setZoomLoading(true);
      getZoomIntegrationStatus()
        .then((d) => setZoomStatus({ connected: Boolean(d.connected), accountId: d.accountId || null }))
        .catch(() => {})
        .finally(() => setZoomLoading(false));
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  async function handleConnectZoom() {
    try {
      const { authorizationUrl } = await getZoomAuthorizeUrl();
      if (!authorizationUrl) {
        window.alert('Could not start Zoom OAuth.');
        return;
      }
      window.open(authorizationUrl, 'zoom_oauth', 'width=600,height=720');
    } catch (e) {
      window.alert(e.message || 'Zoom OAuth failed');
    }
  }

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:'2px solid #e2e8f0' }}>
        {[['firm','Firm Profile'],['team','Team & Users'],['roles','Roles & Permissions'],['billing','Billing Firms'],['integrations','Video & Payments'],['notifications','Notifications'],['other','Other Settings'],['service_config','Service Configuration']].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{ padding:'8px 20px', background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:600, color:tab===t?'#2563eb':'#64748b', borderBottom:tab===t?'2px solid #2563eb':'2px solid transparent', marginBottom:-2 }}>
            {l}
          </button>
        ))}
      </div>

      {tab==='firm' && (
        <div style={{ maxWidth:640 }}>
          <div style={cardStyle}>
            <h3 style={sectionTitle}>🏢 Firm Profile</h3>
            <p style={{ fontSize:13, color:'#64748b', margin:'-12px 0 16px 0' }}>
              These details are stored in this browser and used for your reference across the portal.
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              {FIRM_PROFILE_FIELD_KEYS.map((k) => (
                <div key={k}>
                  <label style={labelStyle}>{k.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}</label>
                  <input
                    value={firmProfile[k] ?? ''}
                    onChange={e => setFirmField(k, e.target.value)}
                    style={inputStyle}
                    autoComplete={k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'off'}
                  />
                </div>
              ))}
            </div>
            {firmMessage.text && (
              <div style={{
                marginTop:12,
                fontSize:13,
                color: firmMessage.type === 'ok' ? '#15803d' : '#dc2626',
              }}>{firmMessage.text}</div>
            )}
            <button
              type="button"
              style={{ ...btnPrimary, marginTop:20, opacity: firmSaving ? 0.7 : 1 }}
              disabled={firmSaving}
              onClick={handleSaveFirmProfile}
            >
              {firmSaving ? 'Saving…' : '💾 Save Changes'}
            </button>
          </div>
        </div>
      )}

      {tab==='team' && (
        <div>
          {editUserModal && (
            <EditUserModal
              user={editUserModal}
              roles={teamRoles}
              onClose={() => setEditUserModal(null)}
              onSaved={(updated) =>
                setTeamUsers(prev => prev.map(u => u.id === updated.id ? { ...u, ...updated } : u))
              }
            />
          )}
          {resetPwModal && (
            <ResetPasswordModal
              user={resetPwModal}
              onClose={() => setResetPwModal(null)}
            />
          )}
          <div style={{ marginBottom:16, display:'flex', justifyContent:'flex-end' }}>
            <button style={btnPrimary} onClick={() => navigate('/admin/users')}>➕ Invite Team Member</button>
          </div>
          <div style={cardStyle}>
            {!teamLoading && (
              <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px', lineHeight: 1.45 }}>
                Set each team member's <strong>planned billable rate (₹/hr)</strong> for benchmark comparisons when an engagement is marked built. Leave blank if not used.
              </p>
            )}
            {teamLoading && <div style={{ padding:24, textAlign:'center', color:'#64748b', fontSize:14 }}>Loading team members…</div>}
            {teamError && <div style={{ padding:12, color:'#dc2626', fontSize:13 }}>{teamError}</div>}
            {!teamLoading && !teamError && teamUsers.length === 0 && (
              <div style={{ padding:24, textAlign:'center', color:'#64748b', fontSize:14 }}>No team members found.</div>
            )}
            {!teamLoading && teamUsers.length > 0 && (
              <table style={tableStyle}>
                <thead>
                  <tr>{['Name','Email','Role','Planned ₹/hr','Status','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {teamUsers.map(u=>{
                    const roleName = u.role_name || u.role || 'unknown';
                    const isActive = u.is_active;
                    const displayName = u.name || '';
                    const defaultRate = u.planned_billable_rate_per_hour != null && u.planned_billable_rate_per_hour !== ''
                      ? String(u.planned_billable_rate_per_hour)
                      : '';
                    const rateKey = `planned_rate_${u.id}_${defaultRate}`;
                    return (
                      <tr key={u.id} style={trStyle}>
                        <td style={{ ...tdStyle, fontWeight:600 }}>
                          <span style={{ width:32, height:32, borderRadius:'50%', background:roleColors[roleName]||'#e2e8f0', color:roleTextColors[roleName]||'#475569', display:'inline-flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12, marginRight:10 }}>
                            {displayName.split(' ').map(n=>n[0]).join('').slice(0,2)}
                          </span>
                          {displayName}
                        </td>
                        <td style={tdStyle}>{u.email}</td>
                        <td style={tdStyle}>
                          <span style={{ background:roleColors[roleName]||'#f1f5f9', color:roleTextColors[roleName]||'#475569', padding:'2px 10px', borderRadius:12, fontSize:12, fontWeight:600, textTransform:'capitalize' }}>
                            {roleName.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          {canManageUserRates ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                defaultValue={defaultRate}
                                key={rateKey}
                                disabled={teamRateSavingId === u.id}
                                placeholder="—"
                                onBlur={(e) => saveUserPlannedRate(u.id, e.target.value)}
                                style={{ ...inputStyle, width: 110, fontSize: 12, padding: '6px 8px' }}
                              />
                              {teamRateSavingId === u.id ? <span style={{ fontSize: 11, color: '#94a3b8' }}>…</span> : null}
                            </span>
                          ) : (
                            <span style={{ fontSize: 13, color: '#64748b' }}>
                              {defaultRate !== '' ? `₹${Number(defaultRate).toLocaleString('en-IN')}` : '—'}
                            </span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ color: isActive?'#16a34a':'#dc2626', fontWeight:600, fontSize:12 }}>
                            {isActive?'● Active':'● Inactive'}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          {canManageUsers && (
                            <button
                              style={iconBtn}
                              title="Edit user"
                              onClick={() => setEditUserModal(u)}
                            >✏️</button>
                          )}
                          {canManageUsers && (
                            <button
                              style={{ ...iconBtn, color:'#dc2626' }}
                              title="Reset password"
                              onClick={() => setResetPwModal(u)}
                            >🔑 Reset Password</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab==='roles' && (
        <div style={{ maxWidth:640 }}>
          {configureRole && (
            <ConfigureRoleModal
              role={configureRole}
              onClose={() => setConfigureRole(null)}
              onSaved={() => {
                // Re-load roles after saving
                fetch(`${API_BASE_URL}/admin/roles`, { headers: authHeaders() })
                  .then(r => r.json())
                  .then(data => setRoles(data.data || []))
                  .catch(() => {});
              }}
            />
          )}
          <div style={cardStyle}>
            <h3 style={sectionTitle}>🔐 Roles & Permissions</h3>
            <p style={{ fontSize:13, color:'#64748b', marginBottom:16 }}>
              Define what each role can access across the portal. <strong>users.manage</strong> is full team administration;
              <strong> users.delegate</strong> lets managers invite and manage only users they created (staff or viewer roles), for hierarchy delegation.
            </p>
            {rolesLoading && <div style={{ fontSize:13, color:'#64748b' }}>Loading roles…</div>}
            {roles.length > 0 && roles.map(r => (
              <div key={r.id} style={{ padding:'14px 0', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <span style={{ fontWeight:700, fontSize:13 }}>{r.display_name || r.name}</span>
                  <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>
                    {r.name === 'super_admin' ? 'Full access to everything (cannot be configured).' : (() => {
                      try {
                        const p = typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions;
                        const perms = Array.isArray(p) ? p : (p?.permissions || []);
                        return perms.includes('*') ? 'All permissions' : `${perms.length} permission(s) granted`;
                      } catch { return 'Permissions not set'; }
                    })()}
                  </div>
                </div>
                {canConfigureRoles && (
                  <button style={btnOutline} onClick={() => setConfigureRole(r)}>Configure</button>
                )}
              </div>
            ))}
            {!rolesLoading && roles.length === 0 && (
              <div style={{ fontSize:13, color:'#94a3b8', padding:'16px 0' }}>No roles found.</div>
            )}
          </div>
        </div>
      )}

      {tab==='billing' && (
        <div style={{ maxWidth:720 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div>
              <h2 style={{ margin:'0 0 4px 0', fontSize:18, fontWeight:700, color:'#1e293b' }}>🏢 Billing Firms</h2>
              <p style={{ margin:0, fontSize:13, color:'#64748b' }}>Used when raising invoices. GST registration drives tax split (CGST/SGST/UTGST/IGST) from supplier vs client state codes.</p>
            </div>
            <button style={btnPrimary} onClick={() => {
              setBillingForm({ code:'', name:'', gstRegistered:false, gstin:'', stateCode:'', defaultGstRate:18 });
              setBillingEdit(null);
              setShowBillingForm(true);
            }}>➕ Add Billing Firm</button>
          </div>
          <div style={cardStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>{['Code','Firm Name','GST','State','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {billingProfiles.map(p=>(
                  <tr key={p.id} style={trStyle}>
                    <td style={{ ...tdStyle, fontFamily:'monospace', fontWeight:700 }}>{p.code}</td>
                    <td style={{ ...tdStyle, fontWeight:600 }}>{p.name}</td>
                    <td style={tdStyle}>{p.gstRegistered ? 'Registered' : '—'}</td>
                    <td style={{ ...tdStyle, fontFamily:'monospace' }}>{p.stateCode || '—'}</td>
                    <td style={tdStyle}>
                      <button style={iconBtn} onClick={() => {
                        setBillingForm({
                          code: p.code,
                          name: p.name,
                          gstRegistered: Boolean(p.gstRegistered),
                          gstin: p.gstin || '',
                          stateCode: p.stateCode || '',
                          defaultGstRate: p.defaultGstRate ?? 18,
                        });
                        setBillingEdit(p.id);
                        setShowBillingForm(true);
                      }}>✏️ Edit</button>
                      <button style={{ ...iconBtn, color:'#ef4444' }} onClick={() => {
                        if (!window.confirm(`Delete "${p.name}"?`)) return;
                        setBillingProfiles(prev => {
                          const next = prev.filter(x => x.id !== p.id);
                          saveBillingProfiles(next);
                          return next;
                        });
                      }}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {showBillingForm && (
            <div style={{ ...cardStyle, marginTop:16 }}>
              <h3 style={sectionTitle}>{billingEdit ? 'Edit Billing Firm' : 'Add Billing Firm'}</h3>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:12, marginBottom:12 }}>
                <div>
                  <label style={labelStyle}>Code</label>
                  <input value={billingForm.code} onChange={e=>{ setBillingForm(v=>({...v,code:e.target.value})); setBillingError(''); }} style={inputStyle} placeholder="e.g. RBGC-CHD" disabled={Boolean(billingEdit)} />
                </div>
                <div>
                  <label style={labelStyle}>Firm Name</label>
                  <input value={billingForm.name} onChange={e=>{ setBillingForm(v=>({...v,name:e.target.value})); setBillingError(''); }} style={inputStyle} placeholder="e.g. RAHUL B GUPTA & CO." />
                </div>
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, fontSize:13, color:'#334155', cursor:'pointer' }}>
                <input type="checkbox" checked={billingForm.gstRegistered} onChange={e=>setBillingForm(v=>({ ...v, gstRegistered: e.target.checked }))} />
                GST registered (tax applied on invoices using this profile)
              </label>
              {billingForm.gstRegistered && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>
                  <div>
                    <label style={labelStyle}>GSTIN</label>
                    <input
                      value={billingForm.gstin}
                      onChange={e=>{ setBillingForm(v=>({...v,gstin:e.target.value.toUpperCase()})); setBillingError(''); }}
                      onBlur={() => {
                        const sc = stateCodeFromGstin(billingForm.gstin);
                        if (sc) setBillingForm(v => ({ ...v, stateCode: v.stateCode || sc }));
                      }}
                      style={inputStyle}
                      placeholder="15-character GSTIN"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>State code (2 digits)</label>
                    <input
                      value={billingForm.stateCode}
                      onChange={e=>{ setBillingForm(v=>({...v,stateCode:e.target.value.replace(/\D/g,'').slice(0,2)})); setBillingError(''); }}
                      style={inputStyle}
                      placeholder="From GSTIN or manual"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Default GST % (on taxable amount)</label>
                    <input
                      type="number"
                      min="0"
                      max="40"
                      step="0.01"
                      value={billingForm.defaultGstRate}
                      onChange={e=>{ setBillingForm(v=>({...v,defaultGstRate:parseFloat(e.target.value,10)||0})); setBillingError(''); }}
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}
              {billingError && <div style={{ fontSize:11, color:'#dc2626', marginBottom:8 }}>{billingError}</div>}
              <div style={{ display:'flex', gap:8 }}>
                <button style={btnPrimary} onClick={() => {
                  if (!billingForm.code.trim()) { setBillingError('Code is required.'); return; }
                  if (!billingForm.name.trim()) { setBillingError('Firm name is required.'); return; }
                  let stateCode = String(billingForm.stateCode || '').trim();
                  if (billingForm.gstRegistered) {
                    const fromG = stateCodeFromGstin(billingForm.gstin);
                    if (!stateCode && fromG) stateCode = fromG;
                    if (!stateCode || stateCode.length !== 2) {
                      setBillingError('Enter a valid GSTIN or a 2-digit state code for the billing entity.');
                      return;
                    }
                  }
                  const row = {
                    id: billingEdit || String(Date.now()),
                    code: billingForm.code.trim(),
                    name: billingForm.name.trim(),
                    gstRegistered: billingForm.gstRegistered,
                    gstin: billingForm.gstRegistered ? String(billingForm.gstin || '').replace(/\s/g,'').toUpperCase() : '',
                    stateCode: billingForm.gstRegistered ? stateCode : '',
                    defaultGstRate: billingForm.gstRegistered ? Math.min(40, Math.max(0, parseFloat(billingForm.defaultGstRate, 10) || 18)) : 18,
                  };
                  setBillingProfiles(prev => {
                    let next;
                    if (billingEdit) {
                      next = prev.map(p => p.id === billingEdit ? { ...p, ...row } : p);
                    } else {
                      next = [...prev, row];
                    }
                    saveBillingProfiles(next);
                    return next;
                  });
                  setBillingError('');
                  setShowBillingForm(false);
                }}>💾 Save</button>
                <button style={btnOutline} onClick={() => { setShowBillingForm(false); setBillingError(''); }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab==='notifications' && (
        <div style={{ ...cardStyle, maxWidth:600, padding:32, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🚧</div>
          <div style={{ fontWeight:700, fontSize:16, color:'#1e293b' }}>Notifications Configuration</div>
          <div style={{ color:'#64748b', fontSize:13, marginTop:8 }}>This section will allow you to configure email and SMS notification templates and triggers.</div>
        </div>
      )}

      {tab==='other' && (
        <div style={{ maxWidth:640 }}>
          <h2 style={{ margin:'0 0 4px 0', fontSize:18, fontWeight:700, color:'#1e293b' }}>⚙️ Other Settings</h2>
          <p style={{ margin:'0 0 20px 0', fontSize:13, color:'#64748b' }}>Manage lookup lists and occasional configuration used across the portal.</p>
          <div style={cardStyle}>
            <h3 style={sectionTitle}>🔑 Portal Types</h3>
            <p style={{ fontSize:13, color:'#64748b', margin:'-12px 0 16px 0' }}>These portal names appear as a dropdown when adding credentials in the Credentials Vault.</p>
            {portalLoading && <div style={{ fontSize:13, color:'#64748b' }}>Loading…</div>}
            {portalTypes.map(pt => (
              <div key={pt.id} style={{ padding:'10px 0', borderBottom:'1px solid #f1f5f9' }}>
                {editingPortalId === pt.id ? (
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    <input
                      value={editPortalName}
                      onChange={e => { setEditPortalName(e.target.value); setPortalError(''); }}
                      onKeyDown={e => { if (e.key === 'Enter') handleSavePortal(pt.id); if (e.key === 'Escape') handleCancelEditPortal(); }}
                      placeholder="Portal name"
                      style={{ ...inputStyle, flex:'2 1 160px' }}
                      autoFocus
                    />
                    <input
                      type="url"
                      value={editPortalUrl}
                      onChange={e => setEditPortalUrl(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSavePortal(pt.id); if (e.key === 'Escape') handleCancelEditPortal(); }}
                      placeholder="Portal URL"
                      style={{ ...inputStyle, flex:'3 1 200px' }}
                    />
                    <button onClick={() => handleSavePortal(pt.id)} style={btnPrimary}>Save</button>
                    <button onClick={handleCancelEditPortal} style={iconBtn} title="Cancel">✕</button>
                  </div>
                ) : (
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <span style={{ fontSize:13, color:'#334155', fontWeight:600 }}>{pt.name}</span>
                      {pt.url && (
                        <a href={pt.url} target="_blank" rel="noreferrer" style={{ display:'block', fontSize:11, color:'#2563eb', marginTop:2 }}>{pt.url}</a>
                      )}
                    </div>
                    <div style={{ display:'flex', gap:4 }}>
                      <button onClick={() => handleStartEditPortal(pt)} style={iconBtn} title="Edit">✏️</button>
                      <button onClick={() => handleDeletePortal(pt)} style={iconBtn} title="Delete">🗑️</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap' }}>
              <input
                value={newPortal}
                onChange={e => { setNewPortal(e.target.value); setPortalError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleAddPortal()}
                placeholder="Portal name e.g. NSDL e-Gov Portal"
                style={{ ...inputStyle, flex:'2 1 180px' }}
              />
              <input
                type="url"
                value={newPortalUrl}
                onChange={e => setNewPortalUrl(e.target.value)}
                placeholder="Portal URL e.g. https://portal.gov.in"
                style={{ ...inputStyle, flex:'3 1 220px' }}
              />
              <button onClick={handleAddPortal} style={btnPrimary}>➕ Add</button>
            </div>
            {portalError && <div style={{ fontSize:11, color:'#dc2626', marginTop:4 }}>{portalError}</div>}
          </div>
          <div style={{ ...cardStyle, marginTop: 20 }}>
            <h3 style={sectionTitle}>🗂️ Register Types</h3>
            <p style={{ fontSize:13, color:'#64748b', margin:'-12px 0 16px 0' }}>
              These determine which register tabs appear on the Registers page.
            </p>
            {registerTypes.map(r => (
              <div key={r.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid #f1f5f9' }}>
                <span style={{ fontSize:13, color:'#334155' }}>{r.icon} {r.label}</span>
                <button onClick={() => handleDeleteRegister(r.key)} style={iconBtn} title="Delete">🗑️</button>
              </div>
            ))}
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <input
                value={newRegister}
                onChange={e => { setNewRegister(e.target.value); setRegisterError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleAddRegister()}
                placeholder="e.g. PT Register"
                style={{ ...inputStyle, flex:1 }}
              />
              <button onClick={handleAddRegister} style={btnPrimary}>➕ Add</button>
            </div>
            {registerError && <div style={{ fontSize:11, color:'#dc2626', marginTop:4 }}>{registerError}</div>}
          </div>
        </div>
      )}

      {tab==='integrations' && (
        <div style={{ maxWidth: 720 }}>
          <div style={cardStyle}>
            <h3 style={sectionTitle}>🎥 Zoom (video appointments)</h3>
            <p style={{ fontSize:13, color:'#64748b', margin:'-12px 0 16px 0' }}>
              Connect the Zoom account used for super-admin video meetings. After connecting, new confirmed video appointments will create or update Zoom meetings.
            </p>
            {zoomLoading ? (
              <div style={{ fontSize:13, color:'#64748b' }}>Loading…</div>
            ) : (
              <div style={{ fontSize:14, color:'#334155', marginBottom:12 }}>
                Status:{' '}
                <strong>{zoomStatus.connected ? 'Connected' : 'Not connected'}</strong>
                {zoomStatus.accountId && (
                  <span style={{ marginLeft:8, fontFamily:'monospace', fontSize:12, color:'#64748b' }}>Account {zoomStatus.accountId}</span>
                )}
              </div>
            )}
            <button type="button" style={btnPrimary} onClick={handleConnectZoom}>Connect Zoom</button>
            <p style={{ fontSize:12, color:'#94a3b8', marginTop:12 }}>
              Set <code style={{ background:'#f1f5f9', padding:'2px 6px', borderRadius:4 }}>ZOOM_CLIENT_ID</code>,{' '}
              <code style={{ background:'#f1f5f9', padding:'2px 6px', borderRadius:4 }}>ZOOM_CLIENT_SECRET</code>, and redirect URL on the server (.env).
            </p>
          </div>
          <div style={{ ...cardStyle, marginTop:20 }}>
            <h3 style={sectionTitle}>💳 Razorpay</h3>
            <p style={{ fontSize:13, color:'#64748b', margin:'-12px 0 16px 0' }}>
              Configure <code style={{ background:'#f1f5f9', padding:'2px 6px', borderRadius:4 }}>RAZORPAY_KEY_ID</code>,{' '}
              <code style={{ background:'#f1f5f9', padding:'2px 6px', borderRadius:4 }}>RAZORPAY_KEY_SECRET</code>, and{' '}
              <code style={{ background:'#f1f5f9', padding:'2px 6px', borderRadius:4 }}>RAZORPAY_WEBHOOK_SECRET</code> on the API server.
              Register webhook URL: <code style={{ background:'#f1f5f9', padding:'2px 6px', borderRadius:4 }}>{API_BASE_URL}/webhooks/razorpay</code> for event <strong>payment.captured</strong>.
            </p>
          </div>
          <div style={{ ...cardStyle, marginTop:20 }}>
            <h3 style={sectionTitle}>📋 Appointment fee rules</h3>
            <p style={{ fontSize:13, color:'#64748b', margin:'-12px 0 12px 0' }}>
              Define fixed or hourly fees used when booking billable appointments.
            </p>
            <Link to="/settings/appointment-fees" style={{ ...btnPrimary, display:'inline-block', textDecoration:'none', textAlign:'center' }}>Manage fee rules</Link>
          </div>
        </div>
      )}

      {tab==='service_config' && (
        <>
        <div style={cardStyle}>
          <h3 style={sectionTitle}>⚙️ Service Configuration</h3>
          <p style={{ fontSize:13, color:'#64748b', marginBottom:20 }}>
            Manage service categories, subcategories, and engagement types. These drive the dropdowns in New Service Engagement.
          </p>

          {/* Add new category */}
          <div style={{ display:'flex', gap:8, marginBottom:20 }}>
            <input
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
              placeholder="New category name (e.g. ITR, GST, Bookkeeping)"
              style={{ ...inputStyle, flex:1 }}
            />
            <button onClick={handleAddCategory} style={btnPrimary}>➕ Add Category</button>
          </div>

          {svcCatError && <div style={{ color:'#dc2626', background:'#fef2f2', padding:'8px 12px', borderRadius:6, fontSize:13, marginBottom:12 }}>{svcCatError}</div>}
          {svcCatLoading && <div style={{ color:'#64748b', fontSize:13 }}>Loading…</div>}

          {serviceCategories.map(cat => {
            const subs = cat.subcategories || [];
            const totalEngagementTypes = subs.reduce((sum, s) => sum + (s.engagementTypes||[]).length, 0)
              + (cat.engagementTypes||[]).length;
            return (
            <div key={cat.id} style={{ border:'1px solid #e2e8f0', borderRadius:8, marginBottom:12, overflow:'hidden' }}>
              {/* Category header */}
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'#f8fafc', cursor:'pointer' }}
                   onClick={() => setExpandedCat(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))}>
                <span style={{ fontSize:13, fontWeight:700, color:'#1e293b', flex:1 }}>
                  {expandedCat[cat.id] ? '▾' : '▸'} {cat.name}
                </span>
                <span style={{ fontSize:11, color:'#64748b' }}>
                  {subs.length} subcats · {totalEngagementTypes} types
                </span>
                <button onClick={e => { e.stopPropagation(); handleDeleteCategory(cat.id); }} style={{ ...iconBtn, color:'#dc2626' }} title="Delete category">🗑️</button>
              </div>

              {expandedCat[cat.id] && (
                <div style={{ padding:'12px 14px' }}>
                  {/* Subcategories with nested engagement types */}
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'#475569', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>Subcategories & Engagement Types</div>
                    {(cat.subcategories || []).length === 0 && (
                      <div style={{ fontSize:12, color:'#94a3b8', marginBottom:8 }}>No subcategories yet.</div>
                    )}
                    {(cat.subcategories || []).map(sub => (
                      <div key={sub.id} style={{ border:'1px solid #e2e8f0', borderRadius:6, marginBottom:10, overflow:'hidden' }}>
                        {/* Subcategory header */}
                        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'#f1f5f9' }}>
                          <span style={{ fontSize:13, color:'#1e293b', fontWeight:600, flex:1 }}>📂 {sub.name}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubcategory(cat.id, sub.id)}
                            disabled={(sub.engagementTypes || []).length > 0}
                            title={(sub.engagementTypes || []).length > 0
                              ? 'Remove all engagement types under this subcategory before deleting it.'
                              : 'Delete subcategory'}
                            style={{
                              ...iconBtn,
                              color: (sub.engagementTypes || []).length > 0 ? '#cbd5e1' : '#dc2626',
                              cursor: (sub.engagementTypes || []).length > 0 ? 'not-allowed' : 'pointer',
                            }}
                          >🗑️</button>
                        </div>
                        {/* Engagement types under this subcategory */}
                        <div style={{ padding:'8px 12px' }}>
                          {(sub.engagementTypes || []).length === 0 && (
                            <div style={{ fontSize:12, color:'#94a3b8', marginBottom:6 }}>No engagement types yet.</div>
                          )}
                          {(sub.engagementTypes || []).map(et => (
                            <div key={et.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', borderBottom:'1px solid #f8fafc' }}>
                              <span style={{ fontSize:12, color:'#334155', flex:1 }}>↳ {et.name}</span>
                              <button onClick={() => handleDeleteEngagementType(cat.id, sub.id, et.id)} style={{ ...iconBtn, color:'#dc2626', fontSize:12 }}>🗑️</button>
                            </div>
                          ))}
                          <div style={{ display:'flex', gap:6, marginTop:6 }}>
                            <input
                              value={newEtName[sub.id] || ''}
                              onChange={e => setNewEtName(prev => ({ ...prev, [sub.id]: e.target.value }))}
                              onKeyDown={e => e.key === 'Enter' && handleAddEngagementType(cat.id, sub.id)}
                              placeholder="New engagement type…"
                              style={{ ...inputStyle, flex:1, fontSize:11, padding:'4px 8px' }}
                            />
                            <button onClick={() => handleAddEngagementType(cat.id, sub.id)} style={{ ...btnPrimary, fontSize:11, padding:'4px 10px' }}>Add</button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div style={{ display:'flex', gap:8, marginTop:8 }}>
                      <input
                        value={newSubName[cat.id] || ''}
                        onChange={e => setNewSubName(prev => ({ ...prev, [cat.id]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && handleAddSubcategory(cat.id)}
                        placeholder="New subcategory name"
                        style={{ ...inputStyle, flex:1, fontSize:12, padding:'6px 8px' }}
                      />
                      <button onClick={() => handleAddSubcategory(cat.id)} style={{ ...btnPrimary, fontSize:12, padding:'6px 12px' }}>Add Subcategory</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            );
          })}

          {!svcCatLoading && serviceCategories.length === 0 && (
            <div style={{ color:'#94a3b8', fontSize:13, textAlign:'center', padding:'24px 0' }}>
              No service categories yet. Add one above to get started.
            </div>
          )}
        </div>

        <div style={{ ...cardStyle, marginTop: 20 }}>
          <h3 style={sectionTitle}>📋 Quotation defaults</h3>
          <p style={{ fontSize:13, color:'#64748b', margin:'-12px 0 16px 0' }}>
            Default price and required documents per engagement type. Used to pre-fill lead quotations. Saving changes requires the setup passphrase and an email OTP (usually to the super admin).
          </p>
          {quotationPending && (
            <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#0369a1', marginBottom:14 }}>
              <strong>Pending:</strong>{' '}
              {quotationPending.engagement_types_incomplete} of {quotationPending.engagement_types_total} engagement type(s) lack a complete quotation setup (price or document list).{' '}
              {quotationPending.leads_needing_final_quotation > 0 && (
                <span>
                  {quotationPending.leads_needing_final_quotation} lead(s) in Qualified / Proposal sent have no final quotation yet.
                </span>
              )}
            </div>
          )}
          {quotationError && (
            <div style={{ color:'#dc2626', background:'#fef2f2', padding:'8px 12px', borderRadius:6, fontSize:13, marginBottom:12 }}>{quotationError}</div>
          )}
          {quotationLoading && <div style={{ color:'#64748b', fontSize:13 }}>Loading quotation defaults…</div>}
          {!quotationLoading && quotationRows.length > 0 && (
            <div style={{ overflowX:'auto' }}>
              <table style={{ ...tableStyle, minWidth: 640 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Engagement type</th>
                    <th style={thStyle}>Category</th>
                    <th style={thStyle}>Default price (₹)</th>
                    <th style={thStyle}>Documents (one per line)</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}> </th>
                  </tr>
                </thead>
                <tbody>
                  {quotationRows.map((r) => {
                    const draft = quoteRowDrafts[r.engagement_type_id] || { price: '', documentsText: '' };
                    const canSetup = hasPermission('quotations.setup');
                    return (
                      <tr key={r.engagement_type_id} style={trStyle}>
                        <td style={{ ...tdStyle, fontWeight:600, maxWidth:200 }}>
                          {r.engagement_type_name}
                          {r.subcategory_name && (
                            <div style={{ fontSize:11, color:'#94a3b8', fontWeight:400 }}>{r.subcategory_name}</div>
                          )}
                        </td>
                        <td style={tdStyle}>{r.category_name}</td>
                        <td style={tdStyle}>
                          <input
                            type="number"
                            disabled={!canSetup}
                            value={draft.price}
                            onChange={e => setQuoteRowDrafts(prev => ({
                              ...prev,
                              [r.engagement_type_id]: { ...draft, price: e.target.value },
                            }))}
                            style={{ ...inputStyle, width:120 }}
                            placeholder="—"
                          />
                        </td>
                        <td style={{ ...tdStyle, minWidth:220 }}>
                          <textarea
                            disabled={!canSetup}
                            value={draft.documentsText}
                            onChange={e => setQuoteRowDrafts(prev => ({
                              ...prev,
                              [r.engagement_type_id]: { ...draft, documentsText: e.target.value },
                            }))}
                            style={{ ...inputStyle, minHeight:72, resize:'vertical' }}
                            placeholder="e.g. PAN, Aadhaar, bank statement…"
                          />
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            fontSize:11,
                            fontWeight:600,
                            padding:'2px 8px',
                            borderRadius:6,
                            background: r.setup_complete ? '#dcfce7' : '#fef3c7',
                            color: r.setup_complete ? '#166534' : '#92400e',
                          }}>
                            {r.setup_complete ? 'Complete' : 'Incomplete'}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          {canSetup ? (
                            <button
                              type="button"
                              style={btnPrimary}
                              onClick={() => openQuoteSaveModal(r, quoteRowDrafts[r.engagement_type_id] || draft)}
                            >
                              Save…
                            </button>
                          ) : (
                            <span style={{ fontSize:12, color:'#94a3b8' }}>View only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!quotationLoading && quotationRows.length === 0 && (
            <div style={{ color:'#94a3b8', fontSize:13 }}>No engagement types yet. Add categories and types above first.</div>
          )}
        </div>

        {quoteOtpModal && (
          <div style={overlayStyle}>
            <div style={{ background:'#fff', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.18)', width:'100%', maxWidth:440, padding:24 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
                <span style={{ fontSize:15, fontWeight:700 }}>Confirm quotation setup</span>
                <button type="button" onClick={() => !quoteOtpBusy && setQuoteOtpModal(null)} style={closeBtnStyle}>✕</button>
              </div>
              <p style={{ fontSize:12, color:'#64748b', margin:'0 0 12px' }}>
                {quoteOtpModal.row.engagement_type_name} — enter the setup passphrase, send OTP, then enter the code to save.
              </p>
              <label style={labelStyle}>Setup passphrase</label>
              <input
                type="password"
                value={quoteOtpPass}
                onChange={e => setQuoteOtpPass(e.target.value)}
                style={{ ...inputStyle, marginBottom:10 }}
                autoComplete="off"
              />
              <label style={labelStyle}>OTP recipient</label>
              <select
                value={quoteOtpRecipient}
                onChange={e => setQuoteOtpRecipient(e.target.value)}
                style={{ ...inputStyle, marginBottom:10 }}
              >
                <option value="super_admin">Super admin email</option>
                <option value="acting_admin">My email (admin role only)</option>
              </select>
              <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                <button type="button" style={btnSecondary} disabled={quoteOtpBusy} onClick={handleSendQuoteOtp}>Send OTP</button>
              </div>
              <label style={labelStyle}>OTP code</label>
              <input
                value={quoteOtpCode}
                onChange={e => setQuoteOtpCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                style={{ ...inputStyle, marginBottom:12 }}
                placeholder="6 digits"
              />
              {quoteOtpMsg && (
                <div style={{ fontSize:12, color: quoteOtpMsg.startsWith('OTP sent') ? '#15803d' : '#dc2626', marginBottom:10 }}>{quoteOtpMsg}</div>
              )}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                <button type="button" style={btnSecondary} disabled={quoteOtpBusy} onClick={() => setQuoteOtpModal(null)}>Cancel</button>
                <button type="button" style={btnPrimary} disabled={quoteOtpBusy || quoteOtpCode.length < 6} onClick={handleConfirmQuoteSave}>
                  {quoteOtpBusy ? 'Saving…' : 'Save with OTP'}
                </button>
              </div>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}

const cardStyle = { background:'#fff', borderRadius:10, boxShadow:'0 1px 3px rgba(0,0,0,.08)', padding:24 };
const sectionTitle = { margin:'0 0 20px 0', fontSize:15, fontWeight:700, color:'#1e293b' };
const tableStyle = { width:'100%', borderCollapse:'collapse', fontSize:13 };
const thStyle = { textAlign:'left', padding:'10px 12px', color:'#64748b', fontWeight:600, fontSize:12, borderBottom:'2px solid #f1f5f9', background:'#f8fafc' };
const tdStyle = { padding:'10px 12px', color:'#334155', verticalAlign:'middle' };
const trStyle = { borderBottom:'1px solid #f8fafc' };
const btnPrimary = { padding:'8px 16px', background:'#2563eb', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600 };
const btnSecondary = { padding:'8px 16px', background:'#f8fafc', color:'#475569', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600 };
const btnOutline = { padding:'6px 14px', background:'#fff', color:'#2563eb', border:'1px solid #2563eb', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:600 };
const iconBtn = { background:'none', border:'none', cursor:'pointer', fontSize:13, padding:'2px 6px', color:'#2563eb' };
const labelStyle = { display:'block', fontSize:12, color:'#64748b', fontWeight:600, marginBottom:4 };
const inputStyle = { width:'100%', padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, boxSizing:'border-box' };
const overlayStyle = { position:'fixed', inset:0, background:'rgba(15,23,42,0.35)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' };
const closeBtnStyle = { background:'none', border:'none', cursor:'pointer', fontSize:16, color:'#64748b', padding:'2px 6px', borderRadius:4 };

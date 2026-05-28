import { useState, useEffect } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { ROLES } from '../../../constants/roles';
import { getPortalTypes } from '../../../constants/portalTypes';
import { fetchPortalTypes, createPortalType, updatePortalType, deletePortalType } from '../../../services/portalTypeService';
import { getRegisterTypes, saveRegisterTypes } from '../../../constants/registerTypes';
import {
  listBillingFirms,
  createBillingFirm,
  updateBillingFirm,
  deleteBillingFirm,
} from '../../../services/billingFirmService';
import { loadBillingProfiles, fetchBillingProfilesFromApi } from '../../../constants/billingProfiles';
import { stateCodeFromGstin } from '../../../utils/gstUtils';
import {
  getCategories,
  createCategory, deleteCategory, updateCategory,
  createSubcategory, deleteSubcategory, updateSubcategory,
  createEngagementTypeForSubcategory, deleteEngagementType, updateEngagementType,
} from '../../../services/serviceCategoryService';
import {
  getQuotationDefaults,
  getQuotationPendingSummary,
  requestQuotationSetupOtp,
  saveQuotationDefault,
} from '../../../services/quotationService';
import { API_BASE_URL } from '../../../constants/config';
import { Link, useNavigate } from 'react-router-dom';
import { getZoomIntegrationStatus, getZoomAuthorizeUrl } from '../../../services/zoomIntegrationService';
import DestructiveConfirmModal from '../../../components/common/DestructiveConfirmModal';
import EngagementTypePricingConfig from '../../../components/crm/EngagementTypePricingConfig';
import { draftFromEngagementType, draftToApiPayload } from '../../../utils/quotationPricing';
import PortalThemePicker from '../../../components/settings/PortalThemePicker';
import {
  getOfficeCalendar,
  updateOfficeCalendarWeeklyOff,
  addOfficeHoliday,
  deleteOfficeHoliday,
} from '../services/officeCalendarService';

function registerDeleteBlockedReason(key) {
  try {
    const stored = localStorage.getItem('registers');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.some((r) => r.registerType === key)) {
        return 'Cannot delete this register type — it has existing records. Delete those records first.';
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

// ── Available permission modules ─────────────────────────────────────────────
const PERMISSION_LABELS = {
  'services.assignees.manage': 'Manage Assignees',
  'cash_book.view': 'View cash book',
  'cash_book.create': 'Record cash transactions',
  'cash_book.edit': 'Edit cash book entries',
};

const PERMISSION_GROUPS = [
  { group: 'Dashboard',   keys: ['dashboard.view'] },
  { group: 'Clients',     keys: ['clients.view', 'clients.create', 'clients.edit', 'clients.delete'] },
  { group: 'Services',    keys: ['services.view', 'services.create', 'services.edit', 'services.delete', 'services.assignees.manage'] },
  { group: 'Documents',   keys: ['documents.view', 'documents.upload'] },
  { group: 'Invoices',    keys: ['invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete'] },
  { group: 'Cash book',   keys: ['cash_book.view', 'cash_book.create', 'cash_book.edit'] },
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
                      {PERMISSION_LABELS[key] ?? key.split('.').slice(1).join('.')}
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
    shiftTargetDisabled: user.shift_target_disabled === true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSave() {
    const name = form.name.trim();
    if (!name) { setError('Name is required.'); return; }
    if (!form.shiftTargetDisabled) {
      const shiftMins = parseInt(form.shiftTargetMinutes, 10);
      if (!Number.isFinite(shiftMins) || shiftMins < 60 || shiftMins > 1440) {
        setError('Daily target must be between 60 and 1440 minutes, or enable “does not apply”.');
        return;
      }
    }
    const shiftMins = Math.max(60, Math.min(1440, parseInt(form.shiftTargetMinutes, 10) || 510));
    setSaving(true);
    setError('');
    try {
      const payload = {
        name,
        is_active: form.isActive,
        shift_target_disabled: form.shiftTargetDisabled,
        shift_target_minutes: shiftMins,
      };
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
              min={form.shiftTargetDisabled ? undefined : 60}
              max={form.shiftTargetDisabled ? undefined : 1440}
              value={form.shiftTargetMinutes}
              disabled={form.shiftTargetDisabled}
              onChange={e => setForm(p => ({ ...p, shiftTargetMinutes: e.target.value }))}
              style={{
                ...inputStyle,
                ...(form.shiftTargetDisabled ? { background: '#f8fafc', color: '#94a3b8' } : {}),
              }}
            />
            <div style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>60–1440 min. Default: 510 (8 h 30 m).</div>
            <label style={{ display:'flex', alignItems:'flex-start', gap:8, marginTop:10, cursor:'pointer', fontSize:13, color:'#334155', lineHeight:1.35 }}>
              <input
                type="checkbox"
                checked={form.shiftTargetDisabled}
                onChange={e => setForm(p => ({ ...p, shiftTargetDisabled: e.target.checked }))}
                style={{ marginTop: 2, accentColor:'#2563eb', flexShrink: 0 }}
              />
              <span>Daily shift target does not apply (reports omit targets for this user).</span>
            </label>
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

/**
 * Confirmation / validation feedback for deleting service categories, subcategories, or engagement types.
 */
function ServiceStructureDeleteModal({ target, busy, error, onClose, onConfirm }) {
  if (!target) return null;
  const titleByKind = {
    category: 'Delete service category?',
    subcategory: 'Delete subcategory?',
    engagementType: 'Delete engagement type?',
  };
  const blocked = Boolean(target.blockingMessage);
  return (
    <div style={overlayStyle}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="svc-struct-delete-title"
        style={{ background:'#fff', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.18)', width:'100%', maxWidth:480, display:'flex', flexDirection:'column' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 24px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
          <span id="svc-struct-delete-title" style={{ fontSize:15, fontWeight:700, color:blocked ? '#92400e' : '#b91c1c' }}>{titleByKind[target.kind]}</span>
          <button type="button" onClick={onClose} style={closeBtnStyle} aria-label="Close">✕</button>
        </div>
        <div style={{ padding:'18px 24px', fontSize:13, color:'#334155', lineHeight:1.55 }}>
          <p style={{ margin:'0 0 10px' }}>
            <strong>{target.primaryLabel}</strong>
            {target.parentLabel && (
              <span style={{ color:'#64748b', fontWeight:500 }}>{' '}· under {target.parentLabel}</span>
            )}
          </p>
          {blocked ? (
            <div style={{ color:'#b45309', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:'12px 14px', fontSize:13 }}>
              {target.blockingMessage}
            </div>
          ) : (
            <>
              <p style={{ margin:0, color:'#64748b', fontSize:12 }}>
                {target.detail}
              </p>
              {error && (
                <div style={{ marginTop:12, color:'#dc2626', fontSize:13, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'10px 12px' }}>
                  {error}
                </div>
              )}
              <p style={{ margin:'14px 0 0', fontSize:12, fontWeight:600, color:'#991b1b' }}>
                This cannot be undone. Only continue if you are sure.
              </p>
            </>
          )}
        </div>
        <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #f1f5f9', flexShrink:0 }}>
          {!blocked ? (
            <>
              <button type="button" onClick={onClose} style={btnSecondary} disabled={busy}>Cancel</button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                style={{ ...btnPrimary, background:'#b91c1c', borderColor:'transparent' }}
              >
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose} style={btnPrimary}>Close</button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Rename category / subcategory / engagement type — server keeps IDs and refreshes denormalized labels. */
function ServiceCatalogRenameModal({ target, draft, onDraftChange, busy, error, onClose, onSave }) {
  if (!target) return null;
  const titleByKind = {
    category: 'Rename category',
    subcategory: 'Rename subcategory',
    engagementType: 'Rename engagement type',
  };
  return (
    <div style={overlayStyle}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="svc-catalog-rename-title"
        style={{ background:'#fff', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.18)', width:'100%', maxWidth:480, display:'flex', flexDirection:'column' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 24px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
          <span id="svc-catalog-rename-title" style={{ fontSize:15, fontWeight:700 }}>{titleByKind[target.kind]}</span>
          <button type="button" onClick={onClose} style={closeBtnStyle} aria-label="Close">✕</button>
        </div>
        <div style={{ padding:'18px 24px', fontSize:13, color:'#334155', lineHeight:1.55 }}>
          <p style={{ margin:'0 0 10px' }}>
            <strong>{target.primaryLabel}</strong>
            {target.parentLabel && (
              <span style={{ color:'#64748b', fontWeight:500 }}>{' '}· {target.parentLabel}</span>
            )}
          </p>
          <p style={{ margin:'0 0 12px', fontSize:12, color:'#64748b' }}>
            Internal IDs stay the same; existing engagements (and related labels) are updated to use the new name.
          </p>
          <label style={labelStyle}>Name</label>
          <input
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            style={inputStyle}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) onSave(); }}
          />
          {error && (
            <div style={{ marginTop:12, color:'#dc2626', fontSize:13, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'10px 12px' }}>
              {error}
            </div>
          )}
        </div>
        <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, borderTop:'1px solid #f1f5f9', flexShrink:0 }}>
          <button type="button" onClick={onClose} style={btnSecondary} disabled={busy}>Cancel</button>
          <button type="button" onClick={onSave} style={btnPrimary} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
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

const SETTINGS_SECTIONS = [
  { key: 'appearance', label: 'Appearance', desc: 'Portal color theme and visual preferences', icon: '🎨' },
  { key: 'firm', label: 'Firm Profile', desc: 'Company name, GSTIN, PAN, contact info', icon: '🏢' },
  { key: 'team', label: 'Team & Users', desc: 'Staff accounts, rates, and invitations', icon: '👥' },
  { key: 'roles', label: 'Roles & Permissions', desc: 'Manage access levels and permissions', icon: '🔐' },
  { key: 'billing', label: 'Billing Firms', desc: 'Configure billing entities and profiles', icon: '💳' },
  { key: 'integrations', label: 'Integrations', desc: 'Zoom, email, and third-party connections', icon: '🔗' },
  { key: 'office_calendar', label: 'Office Calendar', desc: 'Weekly off days and holidays for shift targets', icon: '📅' },
  { key: 'notifications', label: 'Notification Triggers', desc: 'Automated alerts for activities and events', icon: '🔔' },
  { key: 'service_config', label: 'Service Configuration', desc: 'Categories, types, engagement settings', icon: '⚙️' },
  { key: 'other', label: 'Other Settings', desc: 'Portal types, register types, and misc', icon: '📋' },
  { key: 'cron_jobs', label: 'Cron Jobs', desc: 'Scheduled CLI scripts configured in cPanel', icon: '⏱️' },
];

export default function Settings() {
  const { hasPermission, user } = useAuth();
  const navigate = useNavigate();
  const canManageUserRates = hasPermission('users.manage');
  const canManageUsers     = hasPermission('users.manage') || hasPermission('users.delegate');
  const canConfigureRoles  = hasPermission('users.manage');
  const canManageBillingFirms = hasPermission('settings.view');
  /** Same roles as API `role:super_admin,admin` on service category / engagement type mutations. */
  const canManageServiceCatalog =
    user?.role === ROLES.SUPER_ADMIN || user?.role === ROLES.ADMIN;
  const canBypassQuoteOtp =
    user?.role_name === ROLES.ADMIN ||
    user?.role_name === ROLES.SUPER_ADMIN ||
    user?.role === ROLES.SUPER_ADMIN ||
    user?.role === ROLES.ADMIN;
  const [tab, setTab] = useState(null);
  const [cronJobs, setCronJobs] = useState([]);
  const [cronJobsLoading, setCronJobsLoading] = useState(false);
  const [cronJobsError, setCronJobsError] = useState('');
  const [cronLogModal, setCronLogModal] = useState(null); // { job }
  const [cronLogLines, setCronLogLines] = useState([]);
  const [cronLogMeta, setCronLogMeta] = useState(null);  // { exists, mtime, size, log_file }
  const [cronLogLoading, setCronLogLoading] = useState(false);
  const [cronLogError, setCronLogError] = useState('');
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
  const [billingProfilesLoading, setBillingProfilesLoading] = useState(false);
  const [showBillingForm, setShowBillingForm] = useState(false);
  const [billingEdit, setBillingEdit] = useState(null);
  const [billingForm, setBillingForm] = useState({
    code: '', name: '', gstRegistered: false, gstin: '', stateCode: '', defaultGstRate: 18,
  });
  const [billingError, setBillingError] = useState('');
  const [billingSaving, setBillingSaving] = useState(false);

  // ── Service Configuration state ────────────────────────────────────────────
  const [serviceCategories, setServiceCategories] = useState([]);
  const [svcCatLoading, setSvcCatLoading] = useState(false);
  const [svcCatError, setSvcCatError] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [expandedCat, setExpandedCat] = useState({});
  const [newSubName, setNewSubName] = useState({});
  // newEtName is keyed by subcategory id (since engagement types now live under subcategories)
  const [newEtName, setNewEtName] = useState({});
  /** @type {[Record<number, { fee: string, hours: string }>, Function]} */
  const [etStandardsDraft, setEtStandardsDraft] = useState({});
  const [etStandardsSaving, setEtStandardsSaving] = useState({});

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
  const [quoteSaveBusy, setQuoteSaveBusy] = useState({});
  const [quoteSaveMsg, setQuoteSaveMsg] = useState('');

  const [svcStructDeleteModal, setSvcStructDeleteModal] = useState(null);
  const [svcStructDeleteBusy, setSvcStructDeleteBusy] = useState(false);
  const [svcStructDeleteModalErr, setSvcStructDeleteModalErr] = useState('');

  const [svcCatalogRenameModal, setSvcCatalogRenameModal] = useState(null);
  const [svcCatalogRenameDraft, setSvcCatalogRenameDraft] = useState('');
  const [svcCatalogRenameBusy, setSvcCatalogRenameBusy] = useState(false);
  const [svcCatalogRenameErr, setSvcCatalogRenameErr] = useState('');

  const [settingsDestructivePrompt, setSettingsDestructivePrompt] = useState(null);
  const [settingsDestructiveErr, setSettingsDestructiveErr] = useState('');
  const [settingsDestructiveBusy, setSettingsDestructiveBusy] = useState(false);

  const [officeCalendarLoading, setOfficeCalendarLoading] = useState(false);
  const [officeCalendarSaving, setOfficeCalendarSaving] = useState(false);
  const [officeCalendarError, setOfficeCalendarError] = useState('');
  const [officeCalendarMsg, setOfficeCalendarMsg] = useState('');
  const [officeCalendarWeeklyOff, setOfficeCalendarWeeklyOff] = useState(1);
  const [officeCalendarWeekdayOptions, setOfficeCalendarWeekdayOptions] = useState([]);
  const [officeCalendarHolidays, setOfficeCalendarHolidays] = useState([]);
  const [officeCalendarHolidayDate, setOfficeCalendarHolidayDate] = useState('');
  const [officeCalendarHolidayName, setOfficeCalendarHolidayName] = useState('');
  const [officeCalendarHolidayBusy, setOfficeCalendarHolidayBusy] = useState(false);

  useEffect(() => {
    if (tab !== 'office_calendar') return;
    let cancelled = false;
    (async () => {
      setOfficeCalendarLoading(true);
      setOfficeCalendarError('');
      try {
        const data = await getOfficeCalendar();
        if (cancelled) return;
        setOfficeCalendarWeeklyOff(Number(data.weekly_off_days) || 1);
        setOfficeCalendarWeekdayOptions(Array.isArray(data.weekday_options) ? data.weekday_options : []);
        setOfficeCalendarHolidays(Array.isArray(data.holidays) ? data.holidays : []);
      } catch (e) {
        if (!cancelled) setOfficeCalendarError(e.message || 'Failed to load office calendar.');
      } finally {
        if (!cancelled) setOfficeCalendarLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab]);

  async function saveOfficeCalendarWeeklyOff() {
    setOfficeCalendarSaving(true);
    setOfficeCalendarError('');
    setOfficeCalendarMsg('');
    try {
      const data = await updateOfficeCalendarWeeklyOff(officeCalendarWeeklyOff);
      setOfficeCalendarWeeklyOff(Number(data.weekly_off_days) || officeCalendarWeeklyOff);
      setOfficeCalendarMsg('Weekly off days saved.');
    } catch (e) {
      setOfficeCalendarError(e.message || 'Failed to save weekly off days.');
    } finally {
      setOfficeCalendarSaving(false);
    }
  }

  function toggleOfficeCalendarWeeklyOff(dayValue) {
    setOfficeCalendarWeeklyOff((prev) => {
      const next = (prev & dayValue) !== 0 ? prev & ~dayValue : prev | dayValue;
      return next === 127 ? prev : next;
    });
    setOfficeCalendarMsg('');
    setOfficeCalendarError('');
  }

  async function handleAddOfficeHoliday(e) {
    e.preventDefault();
    const date = officeCalendarHolidayDate.trim();
    const name = officeCalendarHolidayName.trim();
    if (!date || !name) {
      setOfficeCalendarError('Holiday date and name are required.');
      return;
    }
    setOfficeCalendarHolidayBusy(true);
    setOfficeCalendarError('');
    setOfficeCalendarMsg('');
    try {
      const created = await addOfficeHoliday({ date, name });
      setOfficeCalendarHolidays((prev) => [...prev, created].sort((a, b) => String(a.holiday_date).localeCompare(String(b.holiday_date))));
      setOfficeCalendarHolidayDate('');
      setOfficeCalendarHolidayName('');
      setOfficeCalendarMsg('Holiday added.');
    } catch (err) {
      setOfficeCalendarError(err.message || 'Failed to add holiday.');
    } finally {
      setOfficeCalendarHolidayBusy(false);
    }
  }

  async function handleDeleteOfficeHoliday(id) {
    setOfficeCalendarHolidayBusy(true);
    setOfficeCalendarError('');
    setOfficeCalendarMsg('');
    try {
      await deleteOfficeHoliday(id);
      setOfficeCalendarHolidays((prev) => prev.filter((h) => h.id !== id));
      setOfficeCalendarMsg('Holiday removed.');
    } catch (err) {
      setOfficeCalendarError(err.message || 'Failed to remove holiday.');
    } finally {
      setOfficeCalendarHolidayBusy(false);
    }
  }

  useEffect(() => {
    if (tab !== 'billing') return;
    let cancelled = false;
    (async () => {
      setBillingProfilesLoading(true);
      try {
        const rows = await listBillingFirms();
        if (!cancelled && Array.isArray(rows) && rows.length > 0) {
          setBillingProfiles(rows);
        } else if (!cancelled) {
          setBillingProfiles(loadBillingProfiles());
        }
      } catch {
        if (!cancelled) setBillingProfiles(loadBillingProfiles());
      } finally {
        if (!cancelled) setBillingProfilesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab]);

  useEffect(() => {
    if (!quotationRows.length) {
      setQuoteRowDrafts({});
      return;
    }
    const next = {};
    quotationRows.forEach((r) => {
      next[r.engagement_type_id] = {
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

  useEffect(() => {
    const next = {};
    serviceCategories.forEach((cat) => {
      (cat.subcategories || []).forEach((sub) => {
        (sub.engagementTypes || []).forEach((et) => {
          next[et.id] = draftFromEngagementType(et);
        });
      });
      (cat.engagementTypes || []).forEach((et) => {
        next[et.id] = draftFromEngagementType(et);
      });
    });
    setEtStandardsDraft(next);
  }, [serviceCategories]);

  function openQuoteSaveModal(row, draft) {
    setQuoteOtpMsg('');
    setQuoteOtpPass('');
    setQuoteOtpCode('');
    setQuoteOtpRecipient('super_admin');
    setQuoteOtpModal({ row, draft });
  }

  async function handleQuoteSaveDirect(row, draft) {
    const eid = row.engagement_type_id;
    setQuoteSaveBusy(prev => ({ ...prev, [eid]: true }));
    setQuoteSaveMsg('');
    setQuotationError('');
    try {
      const docs = (draft.documentsText || '')
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
      await saveQuotationDefault(eid, {
        documentsRequired: docs,
      });
      const refreshed = await getQuotationDefaults();
      setQuotationRows(refreshed);
      const pending = await getQuotationPendingSummary();
      setQuotationPending(pending);
      setQuoteSaveMsg('Quotation default saved.');
    } catch (e) {
      setQuotationError(e.message || 'Save failed.');
    } finally {
      setQuoteSaveBusy(prev => ({ ...prev, [eid]: false }));
    }
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

  function closeSvcStructDeleteModal() {
    setSvcStructDeleteModal(null);
    setSvcStructDeleteModalErr('');
    setSvcStructDeleteBusy(false);
  }

  function openDeleteCategoryModal(cat) {
    const subCount = (cat.subcategories || []).length;
    setSvcCatError('');
    setSvcStructDeleteModalErr('');
    setSvcStructDeleteModal({
      kind: 'category',
      categoryId: cat.id,
      targetId: cat.id,
      primaryLabel: cat.name,
      detail:
        subCount === 0
          ? 'This will remove this category row. Nested data is already empty. If any service engagements still reference this category tree, deletion will be blocked by the server.'
          : `This will remove ${subCount} subcategor${subCount === 1 ? 'y' : 'ies'} and their engagement types under “${cat.name}”. If any service engagements still reference this category or anything beneath it, deletion will be blocked by the server.`,
    });
  }

  function openDeleteSubcategoryModal(cat, sub) {
    setSvcCatError('');
    setSvcStructDeleteModalErr('');
    const etLen = (sub.engagementTypes || []).length;
    if (etLen > 0) {
      setSvcStructDeleteModal({
        kind: 'subcategory',
        categoryId: cat.id,
        subcategoryId: sub.id,
        targetId: sub.id,
        primaryLabel: sub.name,
        parentLabel: cat.name,
        blockingMessage:
          'This subcategory cannot be deleted while it has engagement types. Remove those engagement types first.',
      });
      return;
    }
    setSvcStructDeleteModal({
      kind: 'subcategory',
      categoryId: cat.id,
      subcategoryId: sub.id,
      targetId: sub.id,
      primaryLabel: sub.name,
      parentLabel: cat.name,
      detail:
        'If any service engagements still reference this subcategory, deletion will be blocked by the server.',
    });
  }

  function openDeleteEngagementTypeModal(cat, sub, et) {
    setSvcCatError('');
    setSvcStructDeleteModalErr('');
    setSvcStructDeleteModal({
      kind: 'engagementType',
      categoryId: cat.id,
      subcategoryId: sub.id,
      targetId: et.id,
      primaryLabel: et.name,
      parentLabel: `${cat.name} · ${sub.name}`,
      detail:
        'If any service engagements still use this engagement type, deletion will be blocked by the server.',
    });
  }

  async function confirmSvcStructDelete() {
    const m = svcStructDeleteModal;
    if (!m || m.blockingMessage) return;
    setSvcStructDeleteBusy(true);
    setSvcStructDeleteModalErr('');
    try {
      if (m.kind === 'category') {
        await deleteCategory(m.targetId);
        setServiceCategories((prev) => prev.filter((c) => c.id !== m.targetId));
      } else if (m.kind === 'subcategory') {
        await deleteSubcategory(m.targetId);
        setServiceCategories((prev) =>
          prev.map((c) =>
            c.id === m.categoryId
              ? {
                  ...c,
                  subcategories: (c.subcategories || []).filter((s) => s.id !== m.targetId),
                }
              : c,
          ),
        );
      } else {
        await deleteEngagementType(m.targetId);
        setServiceCategories((prev) =>
          prev.map((c) => {
            if (c.id !== m.categoryId) return c;
            return {
              ...c,
              subcategories: (c.subcategories || []).map((sub) =>
                sub.id === m.subcategoryId
                  ? {
                      ...sub,
                      engagementTypes: (sub.engagementTypes || []).filter((e) => e.id !== m.targetId),
                    }
                  : sub,
              ),
            };
          }),
        );
      }
      closeSvcStructDeleteModal();
    } catch (e) {
      setSvcStructDeleteModalErr(e.message || 'Delete failed.');
    } finally {
      setSvcStructDeleteBusy(false);
    }
  }

  function closeSvcCatalogRenameModal() {
    setSvcCatalogRenameModal(null);
    setSvcCatalogRenameDraft('');
    setSvcCatalogRenameErr('');
    setSvcCatalogRenameBusy(false);
  }

  function openRenameCategoryModal(cat) {
    setSvcCatError('');
    setSvcCatalogRenameErr('');
    setSvcCatalogRenameDraft(cat.name || '');
    setSvcCatalogRenameModal({
      kind: 'category',
      categoryId: cat.id,
      targetId: cat.id,
      primaryLabel: cat.name,
      parentLabel: '',
    });
  }

  function openRenameSubcategoryModal(cat, sub) {
    setSvcCatError('');
    setSvcCatalogRenameErr('');
    setSvcCatalogRenameDraft(sub.name || '');
    setSvcCatalogRenameModal({
      kind: 'subcategory',
      categoryId: cat.id,
      targetId: sub.id,
      primaryLabel: sub.name,
      parentLabel: `Category: ${cat.name}`,
    });
  }

  function openRenameEngagementTypeModal(cat, sub, et) {
    setSvcCatError('');
    setSvcCatalogRenameErr('');
    setSvcCatalogRenameDraft(et.name || '');
    setSvcCatalogRenameModal({
      kind: 'engagementType',
      categoryId: cat.id,
      subcategoryId: sub.id,
      targetId: et.id,
      primaryLabel: et.name,
      parentLabel: `${cat.name} · ${sub.name}`,
    });
  }

  async function confirmSvcCatalogRename() {
    const m = svcCatalogRenameModal;
    if (!m || svcCatalogRenameBusy) return;
    const name = svcCatalogRenameDraft.trim();
    if (!name) {
      setSvcCatalogRenameErr('Name is required.');
      return;
    }
    setSvcCatalogRenameBusy(true);
    setSvcCatalogRenameErr('');
    try {
      if (m.kind === 'category') {
        await updateCategory(m.targetId, { name });
      } else if (m.kind === 'subcategory') {
        await updateSubcategory(m.targetId, { name });
      } else {
        await updateEngagementType(m.targetId, { name });
      }
      const refreshed = await getCategories();
      setServiceCategories(refreshed);
      try {
        const qRows = await getQuotationDefaults();
        setQuotationRows(qRows);
      } catch { /* ignore */ }
      closeSvcCatalogRenameModal();
    } catch (e) {
      setSvcCatalogRenameErr(e.message || 'Save failed.');
    } finally {
      setSvcCatalogRenameBusy(false);
    }
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


  async function handleSaveEngagementStandards(etId) {
    const draft = etStandardsDraft[etId] || draftFromEngagementType({});
    setEtStandardsSaving((prev) => ({ ...prev, [etId]: true }));
    setSvcCatError('');
    try {
      await updateEngagementType(etId, draftToApiPayload(draft));
      const refreshed = await getCategories();
      setServiceCategories(refreshed);
      const qRows = await getQuotationDefaults();
      setQuotationRows(qRows);
      const pending = await getQuotationPendingSummary();
      setQuotationPending(pending);
    } catch (e) {
      setSvcCatError(e.message || 'Failed to save engagement pricing.');
    } finally {
      setEtStandardsSaving((prev) => ({ ...prev, [etId]: false }));
    }
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

  function promptDeletePortal(portal) {
    setPortalError('');
    setSettingsDestructiveErr('');
    setSettingsDestructivePrompt({ kind: 'portal', portal });
  }

  function promptDeleteBilling(profile) {
    setBillingError('');
    setSettingsDestructiveErr('');
    setSettingsDestructivePrompt({ kind: 'billing', profile });
  }

  function promptDeleteRegister(row) {
    setRegisterError('');
    setSettingsDestructiveErr('');
    const block = registerDeleteBlockedReason(row.key);
    setSettingsDestructivePrompt(block ? { kind: 'register', row, blockingMessage: block } : { kind: 'register', row });
  }

  function closeSettingsDestructive() {
    setSettingsDestructivePrompt(null);
    setSettingsDestructiveErr('');
    setSettingsDestructiveBusy(false);
  }

  async function confirmSettingsDestructive() {
    const p = settingsDestructivePrompt;
    if (!p || (p.kind === 'register' && p.blockingMessage)) return;
    setSettingsDestructiveBusy(true);
    setSettingsDestructiveErr('');
    try {
      if (p.kind === 'portal') {
        await deletePortalType(p.portal.id);
        setPortalTypes((prev) => prev.filter((x) => x.id !== p.portal.id));
      } else if (p.kind === 'billing') {
        await deleteBillingFirm(p.profile.code);
        await fetchBillingProfilesFromApi();
        const rows = await listBillingFirms();
        setBillingProfiles(Array.isArray(rows) && rows.length ? rows : loadBillingProfiles());
      } else if (p.kind === 'register') {
        const updated = registerTypes.filter((r) => r.key !== p.row.key);
        setRegisterTypes(updated);
        saveRegisterTypes(updated);
      }
      closeSettingsDestructive();
    } catch (e) {
      setSettingsDestructiveErr(e.message || 'Operation failed.');
    } finally {
      setSettingsDestructiveBusy(false);
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
    if (tab !== 'cron_jobs') return;
    if (cronJobs.length > 0) return;
    setCronJobsLoading(true);
    setCronJobsError('');
    fetch(`${API_BASE_URL}/admin/settings/cron-jobs`, { headers: authHeaders() })
      .then(parseApiResponse)
      .then((res) => setCronJobs(Array.isArray(res.data) ? res.data : []))
      .catch((e) => setCronJobsError(e.message || 'Failed to load cron jobs.'))
      .finally(() => setCronJobsLoading(false));
  }, [tab]);

  async function openCronLogs(job) {
    setCronLogModal({ job });
    setCronLogLines([]);
    setCronLogMeta(null);
    setCronLogError('');
    setCronLogLoading(true);
    try {
      const res = await parseApiResponse(
        await fetch(`${API_BASE_URL}/admin/settings/cron-jobs/logs?job=${encodeURIComponent(job.file)}`, {
          headers: authHeaders(),
        }),
      );
      setCronLogLines(res.data?.lines ?? []);
      setCronLogMeta({
        exists:   res.data?.exists ?? false,
        mtime:    res.data?.mtime  ?? null,
        size:     res.data?.size   ?? 0,
        log_file: res.data?.log_file ?? job.log_file,
      });
    } catch (e) {
      setCronLogError(e.message || 'Failed to load logs.');
    } finally {
      setCronLogLoading(false);
    }
  }

  async function refreshCronLogs() {
    if (!cronLogModal) return;
    await openCronLogs(cronLogModal.job);
  }

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
    <div style={{ padding:24, background: 'var(--portal-bg)', minHeight: '100%' }}>
      {/* Card-based landing when no section selected */}
      {tab === null && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28, background: '#fff', padding: '20px 24px', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--portal-primary-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>⚙️</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0B1F3B' }}>Settings</h1>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>Configure your portal, team, integrations, and preferences</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {SETTINGS_SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setTab(s.key)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', background: '#fff', border: '1px solid #E6E8F0', borderRadius: 12, cursor: 'pointer', textAlign: 'left', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', transition: 'box-shadow 0.15s, border-color 0.15s, transform 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(var(--portal-primary-rgb),0.12)'; e.currentTarget.style.borderColor = 'var(--portal-primary)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = '#E6E8F0'; e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--portal-primary-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{s.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1F3B', marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.3 }}>{s.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active section with back + tabs */}
      {tab !== null && (
        <>
      {svcStructDeleteModal && (
        <ServiceStructureDeleteModal
          target={svcStructDeleteModal}
          busy={svcStructDeleteBusy}
          error={svcStructDeleteModalErr}
          onClose={closeSvcStructDeleteModal}
          onConfirm={confirmSvcStructDelete}
        />
      )}
      {svcCatalogRenameModal && (
        <ServiceCatalogRenameModal
          target={svcCatalogRenameModal}
          draft={svcCatalogRenameDraft}
          onDraftChange={(v) => { setSvcCatalogRenameDraft(v); setSvcCatalogRenameErr(''); }}
          busy={svcCatalogRenameBusy}
          error={svcCatalogRenameErr}
          onClose={closeSvcCatalogRenameModal}
          onSave={confirmSvcCatalogRename}
        />
      )}
      {settingsDestructivePrompt && (
        <DestructiveConfirmModal
          open
          blocked={Boolean(settingsDestructivePrompt.blockingMessage)}
          title={
            settingsDestructivePrompt.blockingMessage
              ? 'Cannot delete register type'
              : settingsDestructivePrompt.kind === 'portal'
                ? 'Delete portal type?'
                : settingsDestructivePrompt.kind === 'billing'
                  ? 'Delete billing firm?'
                  : 'Delete register type?'
          }
          titleAccent={settingsDestructivePrompt.blockingMessage ? '#92400e' : '#b91c1c'}
          tone="danger"
          error={settingsDestructiveErr}
          busy={settingsDestructiveBusy}
          confirmLabel={
            settingsDestructivePrompt.kind === 'portal'
              ? 'Delete portal'
              : settingsDestructivePrompt.kind === 'billing'
                ? 'Delete firm'
                : 'Delete register type'
          }
          onClose={closeSettingsDestructive}
          onConfirm={confirmSettingsDestructive}
        >
          {settingsDestructivePrompt.blockingMessage ? (
            <div style={{ color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>
              {settingsDestructivePrompt.blockingMessage}
            </div>
          ) : settingsDestructivePrompt.kind === 'portal' ? (
            <>
              <p style={{ margin: '0 0 8px' }}>
                Delete <strong>{settingsDestructivePrompt.portal.name}</strong> from portal types?
              </p>
              <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>
                Linked credentials and references may still use this label until updated. This action cannot be undone on the server.
              </p>
            </>
          ) : settingsDestructivePrompt.kind === 'billing' ? (
            <>
              <p style={{ margin: '0 0 8px' }}>
                Delete billing firm <strong>{settingsDestructivePrompt.profile.name}</strong> (<code style={{ fontSize: 12, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{settingsDestructivePrompt.profile.code}</code>)?
              </p>
              <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>
                The server will refuse this if the firm is still in use by invoices or other records.
              </p>
            </>
          ) : (
            <>
              <p style={{ margin: '0 0 8px' }}>
                Remove <strong>{settingsDestructivePrompt.row.label}</strong> from configured register types?
              </p>
              <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>
                This updates the dropdown in this browser. It does not delete historical register rows in the database.
              </p>
            </>
          )}
        </DestructiveConfirmModal>
      )}
      <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:'2px solid #e2e8f0', alignItems: 'center' }}>
        <button onClick={() => setTab(null)} style={{ padding:'8px 12px', background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:600, color:'var(--portal-primary)', marginRight: 8 }}>← Back</button>
        {SETTINGS_SECTIONS.map(({ key, label: l }) => (
          <button key={key} onClick={()=>setTab(key)} style={{ padding:'8px 16px', background:'none', border:'none', cursor:'pointer', fontSize:12, fontWeight:600, color:tab===key?'var(--portal-primary)':'#64748b', borderBottom:tab===key?'2px solid var(--portal-primary)':'2px solid transparent', marginBottom:-2, whiteSpace: 'nowrap' }}>
            {l}
          </button>
        ))}
      </div>

      {tab==='appearance' && (
        <div style={{ maxWidth: 720 }}>
          <div style={cardStyle}>
            <PortalThemePicker />
          </div>
        </div>
      )}

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
              <p style={{ margin:0, fontSize:13, color:'#64748b' }}>Used when raising invoices. Firms are stored on the server for all users. GST registration drives tax split (CGST/SGST/UTGST/IGST) from supplier vs client state codes.</p>
              {!canManageBillingFirms && (
                <p style={{ margin:'8px 0 0 0', fontSize:12, color:'#b45309' }}>You need Settings permission to add, edit, or delete firms.</p>
              )}
              {billingProfilesLoading && <div style={{ fontSize:13, color:'#64748b', marginTop:8 }}>Loading…</div>}
            </div>
            <button
              type="button"
              style={{ ...btnPrimary, opacity: canManageBillingFirms ? 1 : 0.5 }}
              disabled={!canManageBillingFirms}
              onClick={() => {
                setBillingForm({ code:'', name:'', gstRegistered:false, gstin:'', stateCode:'', defaultGstRate:18 });
                setBillingEdit(null);
                setShowBillingForm(true);
              }}
            >➕ Add Billing Firm</button>
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
                      <button type="button" style={iconBtn} disabled={!canManageBillingFirms} onClick={() => {
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
                      <button type="button" style={{ ...iconBtn, color:'#ef4444' }} disabled={!canManageBillingFirms} onClick={() => promptDeleteBilling(p)}>🗑️</button>
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
                <button type="button" style={btnPrimary} disabled={billingSaving || !canManageBillingFirms} onClick={async () => {
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
                  setBillingSaving(true);
                  setBillingError('');
                  try {
                    const payload = {
                      name: billingForm.name.trim(),
                      gstRegistered: billingForm.gstRegistered,
                      gstin: billingForm.gstRegistered ? String(billingForm.gstin || '').replace(/\s/g,'').toUpperCase() : '',
                      stateCode: billingForm.gstRegistered ? stateCode : '',
                      defaultGstRate: billingForm.gstRegistered ? Math.min(40, Math.max(0, parseFloat(billingForm.defaultGstRate, 10) || 18)) : 18,
                    };
                    if (billingEdit) {
                      await updateBillingFirm(billingForm.code.trim(), payload);
                    } else {
                      await createBillingFirm({ code: billingForm.code.trim().toUpperCase(), ...payload });
                    }
                    await fetchBillingProfilesFromApi();
                    const rows = await listBillingFirms();
                    setBillingProfiles(Array.isArray(rows) && rows.length ? rows : loadBillingProfiles());
                    setShowBillingForm(false);
                  } catch (e) {
                    setBillingError(e.message || 'Save failed.');
                  } finally {
                    setBillingSaving(false);
                  }
                }}>{billingSaving ? 'Saving…' : '💾 Save'}</button>
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

      {tab==='office_calendar' && (
        <div style={{ maxWidth: 720 }}>
          <h2 style={{ margin:'0 0 4px 0', fontSize:18, fontWeight:700, color:'#1e293b' }}>📅 Office Calendar</h2>
          <p style={{ margin:'0 0 20px 0', fontSize:13, color:'#64748b' }}>
            Configure days when the office is closed. Shift target reports and daily timesheet emails skip these days when calculating expected punch hours.
          </p>
          {!canManageServiceCatalog && (
            <p style={{ margin:'0 0 16px 0', fontSize:12, color:'#b45309' }}>Only administrators can change weekly off days or manage holidays.</p>
          )}
          {officeCalendarLoading && (
            <div style={{ fontSize:13, color:'#64748b', marginBottom:16 }}>Loading…</div>
          )}
          {officeCalendarError && (
            <div style={{ padding:12, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, color:'#dc2626', fontSize:13, marginBottom:16 }}>{officeCalendarError}</div>
          )}
          {officeCalendarMsg && (
            <div style={{ padding:12, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, color:'#15803d', fontSize:13, marginBottom:16 }}>{officeCalendarMsg}</div>
          )}
          <div style={cardStyle}>
            <h3 style={sectionTitle}>Weekly off days</h3>
            <p style={{ fontSize:13, color:'#64748b', margin:'-12px 0 16px 0' }}>
              Checked days are treated as non-working for shift targets. At least one working day must remain.
            </p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:16 }}>
              {(officeCalendarWeekdayOptions.length ? officeCalendarWeekdayOptions : [
                { value: 1, label: 'Sunday' },
                { value: 2, label: 'Monday' },
                { value: 4, label: 'Tuesday' },
                { value: 8, label: 'Wednesday' },
                { value: 16, label: 'Thursday' },
                { value: 32, label: 'Friday' },
                { value: 64, label: 'Saturday' },
              ]).map((opt) => {
                const checked = (officeCalendarWeeklyOff & opt.value) !== 0;
                return (
                  <label
                    key={opt.value}
                    style={{
                      display:'flex', alignItems:'center', gap:8, cursor: canManageServiceCatalog ? 'pointer' : 'default',
                      fontSize:13, color:'#334155', padding:'6px 12px', border:`1px solid ${checked ? '#2563eb' : '#e2e8f0'}`,
                      borderRadius:8, background: checked ? '#eff6ff' : '#fff', userSelect:'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!canManageServiceCatalog || officeCalendarSaving}
                      onChange={() => toggleOfficeCalendarWeeklyOff(opt.value)}
                      style={{ accentColor:'#2563eb' }}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
            {canManageServiceCatalog && (
              <button
                type="button"
                style={{ ...btnPrimary, opacity: officeCalendarSaving ? 0.7 : 1 }}
                disabled={officeCalendarSaving}
                onClick={saveOfficeCalendarWeeklyOff}
              >
                {officeCalendarSaving ? 'Saving…' : 'Save weekly off days'}
              </button>
            )}
          </div>

          <div style={{ ...cardStyle, marginTop:16 }}>
            <h3 style={sectionTitle}>Public holidays</h3>
            <p style={{ fontSize:13, color:'#64748b', margin:'-12px 0 16px 0' }}>
              One-off closed dates (e.g. national holidays). These are excluded from shift target calculations on the listed dates.
            </p>
            {canManageServiceCatalog && (
              <form onSubmit={handleAddOfficeHoliday} style={{ display:'flex', flexWrap:'wrap', gap:10, alignItems:'flex-end', marginBottom:16 }}>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input
                    type="date"
                    value={officeCalendarHolidayDate}
                    onChange={(e) => setOfficeCalendarHolidayDate(e.target.value)}
                    style={inputStyle}
                    disabled={officeCalendarHolidayBusy}
                  />
                </div>
                <div style={{ flex:1, minWidth:200 }}>
                  <label style={labelStyle}>Name</label>
                  <input
                    value={officeCalendarHolidayName}
                    onChange={(e) => setOfficeCalendarHolidayName(e.target.value)}
                    placeholder="e.g. Independence Day"
                    style={inputStyle}
                    disabled={officeCalendarHolidayBusy}
                  />
                </div>
                <button type="submit" style={{ ...btnPrimary, opacity: officeCalendarHolidayBusy ? 0.7 : 1 }} disabled={officeCalendarHolidayBusy}>
                  Add holiday
                </button>
              </form>
            )}
            {officeCalendarHolidays.length === 0 ? (
              <div style={{ fontSize:13, color:'#94a3b8' }}>No holidays configured.</div>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>{['Date', 'Name', ...(canManageServiceCatalog ? [''] : [])].map((h) => <th key={h || 'actions'} style={thStyle}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {officeCalendarHolidays.map((h) => (
                    <tr key={h.id} style={trStyle}>
                      <td style={{ ...tdStyle, fontFamily:'monospace' }}>{h.holiday_date}</td>
                      <td style={tdStyle}>{h.name}</td>
                      {canManageServiceCatalog && (
                        <td style={tdStyle}>
                          <button
                            type="button"
                            style={{ ...btnOutline, fontSize:12, padding:'4px 10px', color:'#dc2626', borderColor:'#fecaca' }}
                            disabled={officeCalendarHolidayBusy}
                            onClick={() => handleDeleteOfficeHoliday(h.id)}
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab==='cron_jobs' && (
        <div>
          {/* ── Log Viewer Modal ──────────────────────────────────────────── */}
          {cronLogModal && (
            <div style={overlayStyle} onClick={() => setCronLogModal(null)}>
              <div
                style={{ background:'#fff', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,.18)', width:'min(860px,96vw)', maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden' }}
                onClick={e => e.stopPropagation()}
              >
                {/* header */}
                <div style={{ padding:'16px 20px', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15, color:'#1e293b', marginBottom:4 }}>
                      📋 Execution Logs
                    </div>
                    <code style={{ fontSize:12, color:'#475569', background:'#f1f5f9', padding:'2px 7px', borderRadius:4 }}>
                      {cronLogModal.job.file}
                    </code>
                    {cronLogMeta && (
                      <div style={{ marginTop:6, display:'flex', gap:16, flexWrap:'wrap' }}>
                        {cronLogMeta.exists ? (
                          <>
                            <span style={{ fontSize:11, color:'#64748b' }}>
                              Log: <code style={{ background:'#f8fafc', padding:'1px 4px', borderRadius:3 }}>{cronLogMeta.log_file}</code>
                            </span>
                            <span style={{ fontSize:11, color:'#64748b' }}>
                              Last modified: <strong style={{ color:'#334155' }}>{cronLogMeta.mtime}</strong>
                            </span>
                            <span style={{ fontSize:11, color:'#64748b' }}>
                              Size: <strong style={{ color:'#334155' }}>{(cronLogMeta.size / 1024).toFixed(1)} KB</strong>
                            </span>
                          </>
                        ) : (
                          <span style={{ fontSize:11, color:'#f59e0b', fontWeight:600 }}>
                            ⚠ Log file not found — either this cron has not run yet, or the cPanel command is not redirecting output to <code style={{ background:'#fef9c3', padding:'1px 4px', borderRadius:3 }}>{cronLogMeta.log_file}</code>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
                    <button
                      type="button"
                      style={{ ...btnSecondary, fontSize:12, padding:'5px 12px', display:'flex', alignItems:'center', gap:6 }}
                      onClick={refreshCronLogs}
                      disabled={cronLogLoading}
                    >
                      {cronLogLoading ? '⏳' : '🔄'} Refresh
                    </button>
                    <button type="button" style={closeBtnStyle} onClick={() => setCronLogModal(null)}>✕</button>
                  </div>
                </div>

                {/* body */}
                <div style={{ flex:1, overflowY:'auto', background:'#0f172a', padding:0 }}>
                  {cronLogLoading && (
                    <div style={{ padding:32, textAlign:'center', color:'#94a3b8', fontSize:13 }}>Loading logs…</div>
                  )}
                  {cronLogError && (
                    <div style={{ padding:16, color:'#f87171', fontSize:13 }}>{cronLogError}</div>
                  )}
                  {!cronLogLoading && !cronLogError && cronLogMeta && !cronLogMeta.exists && (
                    <div style={{ padding:32, textAlign:'center', color:'#64748b', fontSize:13 }}>
                      <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
                      No log file found. Configure your cPanel cron to redirect output:<br />
                      <code style={{ display:'inline-block', marginTop:10, background:'#1e293b', color:'#7dd3fc', padding:'6px 12px', borderRadius:6, fontSize:12 }}>
                        php /path/to/server-php/{cronLogModal.job.file} &gt;&gt; /path/to/server-php/{cronLogModal.job.log_file} 2&gt;&amp;1
                      </code>
                    </div>
                  )}
                  {!cronLogLoading && !cronLogError && cronLogLines.length > 0 && (
                    <pre style={{ margin:0, padding:'14px 18px', fontFamily:'monospace', fontSize:12, lineHeight:1.7, color:'#e2e8f0', whiteSpace:'pre-wrap', wordBreak:'break-all' }}>
                      {cronLogLines.map((line, i) => {
                        const isErr = /\[.*error.*\]|error|fail|exception/i.test(line);
                        const isOk  = /sent|success|deleted|done|ok\b/i.test(line);
                        const color = isErr ? '#f87171' : isOk ? '#86efac' : '#e2e8f0';
                        return (
                          <span key={i} style={{ display:'block', color }}>
                            <span style={{ userSelect:'none', color:'#475569', marginRight:10, minWidth:42, display:'inline-block', textAlign:'right' }}>{cronLogLines.length - cronLogLines.length + i + 1}</span>
                            {line}
                          </span>
                        );
                      })}
                    </pre>
                  )}
                  {!cronLogLoading && !cronLogError && cronLogMeta?.exists && cronLogLines.length === 0 && (
                    <div style={{ padding:32, textAlign:'center', color:'#64748b', fontSize:13 }}>Log file is empty.</div>
                  )}
                </div>

                {/* footer */}
                {cronLogLines.length > 0 && (
                  <div style={{ padding:'8px 20px', borderTop:'1px solid #1e293b', background:'#0f172a', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:11, color:'#475569' }}>Showing last {cronLogLines.length} lines</span>
                    <button
                      type="button"
                      style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:'#475569', padding:'2px 6px' }}
                      onClick={() => {
                        const blob = new Blob([cronLogLines.join('\n')], { type: 'text/plain' });
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = cronLogModal.job.file.replace(/\//g,'-').replace('.php','.log');
                        a.click();
                      }}
                    >
                      ⬇ Download
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <h2 style={{ margin:'0 0 4px 0', fontSize:18, fontWeight:700, color:'#1e293b' }}>⏱️ Cron Jobs</h2>
          <p style={{ margin:'0 0 6px 0', fontSize:13, color:'#64748b' }}>
            All scheduled CLI scripts configured in cPanel. This list is maintained in <code style={{ background:'#f1f5f9', padding:'1px 5px', borderRadius:4, fontSize:12 }}>server-php/app/Config/CronJobs.php</code> — add a new entry there whenever you create a new script.
          </p>
          <p style={{ margin:'0 0 20px 0', fontSize:12, color:'#94a3b8', fontStyle:'italic' }}>
            Note: This registry is manually maintained. cPanel does not expose a standard API that can be safely queried from within the application, so new cron jobs must be documented here after adding them in cPanel.
          </p>
          {cronJobsLoading && (
            <div style={{ padding:32, textAlign:'center', color:'#64748b', fontSize:14 }}>Loading cron jobs…</div>
          )}
          {cronJobsError && (
            <div style={{ padding:12, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, color:'#dc2626', fontSize:13, marginBottom:16 }}>{cronJobsError}</div>
          )}
          {!cronJobsLoading && !cronJobsError && cronJobs.length === 0 && (
            <div style={{ padding:32, textAlign:'center', color:'#94a3b8', fontSize:14 }}>No cron jobs registered.</div>
          )}
          {!cronJobsLoading && cronJobs.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {['report','notification','maintenance','marketing'].map(cat => {
                const items = cronJobs.filter(j => j.category === cat);
                if (!items.length) return null;
                const catMeta = {
                  report:      { label: 'Reports', color:'#dbeafe', textColor:'#1d4ed8', icon:'📊' },
                  notification:{ label: 'Notifications', color:'#dcfce7', textColor:'#15803d', icon:'🔔' },
                  maintenance: { label: 'Maintenance', color:'#fef9c3', textColor:'#854d0e', icon:'🔧' },
                  marketing:   { label: 'Marketing', color:'#fce7f3', textColor:'#9d174d', icon:'📣' },
                }[cat];
                return (
                  <div key={cat} style={cardStyle}>
                    <h3 style={{ ...sectionTitle, display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ background:catMeta.color, color:catMeta.textColor, borderRadius:6, padding:'2px 10px', fontSize:12, fontWeight:700 }}>
                        {catMeta.icon} {catMeta.label}
                      </span>
                    </h3>
                    <div style={{ overflowX:'auto' }}>
                      <table style={{ ...tableStyle, tableLayout:'fixed' }}>
                        <colgroup>
                          <col style={{ width:'24%' }} />
                          <col style={{ width:'12%' }} />
                          <col style={{ width:'15%' }} />
                          <col style={{ width:'39%' }} />
                          <col style={{ width:'10%' }} />
                        </colgroup>
                        <thead>
                          <tr>
                            {['Script File','Frequency','Timing / Cron','Purpose',''].map((h, i) => (
                              <th key={i} style={thStyle}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((job, idx) => (
                            <tr key={idx} style={trStyle}>
                              <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:12, wordBreak:'break-all', color:'#1e293b', fontWeight:600 }}>
                                {job.file}
                              </td>
                              <td style={tdStyle}>
                                <span style={{ background:'#f1f5f9', color:'#475569', padding:'2px 8px', borderRadius:12, fontSize:12, fontWeight:600, whiteSpace:'nowrap' }}>
                                  {job.frequency}
                                </span>
                              </td>
                              <td style={{ ...tdStyle, fontSize:12 }}>
                                <div style={{ color:'#334155' }}>{job.timing}</div>
                                <code style={{ display:'block', marginTop:3, fontSize:11, color:'#64748b', background:'#f8fafc', padding:'1px 5px', borderRadius:4 }}>{job.cron}</code>
                              </td>
                              <td style={{ ...tdStyle, fontSize:12, color:'#475569', lineHeight:1.5 }}>{job.purpose}</td>
                              <td style={{ ...tdStyle, textAlign:'center' }}>
                                <button
                                  type="button"
                                  style={{ ...btnOutline, fontSize:11, padding:'4px 10px', whiteSpace:'nowrap' }}
                                  onClick={() => openCronLogs(job)}
                                >
                                  📋 View Logs
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              <div style={{ fontSize:12, color:'#94a3b8', textAlign:'right', marginTop:4 }}>
                {cronJobs.length} jobs registered
              </div>
            </div>
          )}
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
                      <button onClick={() => promptDeletePortal(pt)} style={iconBtn} title="Delete">🗑️</button>
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
                <button type="button" onClick={() => promptDeleteRegister(r)} style={iconBtn} title="Delete">🗑️</button>
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
            Renaming keeps the same database IDs; existing engagements (and cached labels on services and leads) are updated automatically.
            Set quotation pricing per engagement type (fixed, hourly, or fixed + conditional additional events). These pre-fill lead quotations.
            Set <strong>Std fee (₹)</strong> and <strong>Std hours</strong> separately as the invoice variance benchmark; optional per-service overrides live on the engagement detail screen.
          </p>
          {!canManageServiceCatalog && (
            <div style={{ fontSize:12, color:'#92400e', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:'10px 14px', marginBottom:16 }}>
              Only <strong>Super Admin</strong> and <strong>Admin</strong> can add, remove, rename, or reorganize categories and engagement types. You can still view the catalog below.
            </div>
          )}

          {/* Add new category */}
          {canManageServiceCatalog && (
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
          )}

          {svcCatError && <div style={{ color:'#dc2626', background:'#fef2f2', padding:'8px 12px', borderRadius:6, fontSize:13, marginBottom:12 }}>{svcCatError}</div>}
          {svcCatLoading && <div style={{ color:'#64748b', fontSize:13 }}>Loading…</div>}

          {serviceCategories.map(cat => {
            const subs = cat.subcategories || [];
            const totalEngagementTypes = subs.reduce((sum, s) => sum + (s.engagementTypes||[]).length, 0)
              + (cat.engagementTypes||[]).length;
            return (
            <div key={cat.id} style={{ border:'1px solid #e2e8f0', borderRadius:8, marginBottom:12, overflow:'hidden' }}>
              {/* Category header */}
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'#f8fafc', cursor:'pointer', minWidth: 0 }}
                   onClick={() => setExpandedCat(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))}>
                <span style={{ fontSize:13, fontWeight:700, color:'#1e293b', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {expandedCat[cat.id] ? '▾' : '▸'} {cat.name}
                </span>
                <span style={{ fontSize:11, color:'#64748b', flexShrink:0 }}>
                  {subs.length} subcats · {totalEngagementTypes} types
                </span>
                {canManageServiceCatalog && (
                  <>
                    <button type="button" onClick={(e) => { e.stopPropagation(); openRenameCategoryModal(cat); }} style={{ ...iconBtn, color:'#2563eb', flexShrink:0 }} title="Rename category">✏️</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); openDeleteCategoryModal(cat); }} style={{ ...iconBtn, color:'#dc2626', flexShrink:0 }} title="Delete category">🗑️</button>
                  </>
                )}
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
                        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'#f1f5f9', minWidth: 0 }}>
                          <span style={{ fontSize:13, color:'#1e293b', fontWeight:600, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>📂 {sub.name}</span>
                          {canManageServiceCatalog && (
                          <>
                            <button
                              type="button"
                              onClick={() => openRenameSubcategoryModal(cat, sub)}
                              title="Rename subcategory"
                              style={{ ...iconBtn, color:'#2563eb', cursor:'pointer', flexShrink:0 }}
                            >✏️</button>
                            <button
                              type="button"
                              onClick={() => openDeleteSubcategoryModal(cat, sub)}
                              title="Delete subcategory"
                              style={{ ...iconBtn, color:'#dc2626', cursor:'pointer', flexShrink:0 }}
                            >🗑️</button>
                          </>
                          )}
                        </div>
                        {/* Engagement types under this subcategory */}
                        <div style={{ padding:'8px 12px' }}>
                          {(sub.engagementTypes || []).length === 0 && (
                            <div style={{ fontSize:12, color:'#94a3b8', marginBottom:6 }}>No engagement types yet.</div>
                          )}
                          {(sub.engagementTypes || []).map(et => {
                            const d = etStandardsDraft[et.id] || draftFromEngagementType(et);
                            const saving = etStandardsSaving[et.id];
                            return (
                              <div key={et.id} style={{ padding:'8px 0', borderBottom:'1px solid #f8fafc' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:8, minWidth: 0 }}>
                                  <span style={{ fontSize:12, color:'#334155', flex:1, minWidth:0, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>↳ {et.name}</span>
                                  {canManageServiceCatalog && (
                                  <>
                                    <button type="button" onClick={() => openRenameEngagementTypeModal(cat, sub, et)} style={{ ...iconBtn, color:'#2563eb', fontSize:12, flexShrink:0 }} title="Rename engagement type">✏️</button>
                                    <button type="button" onClick={() => openDeleteEngagementTypeModal(cat, sub, et)} style={{ ...iconBtn, color:'#dc2626', fontSize:12, flexShrink:0 }}>🗑️</button>
                                  </>
                                  )}
                                </div>
                                <EngagementTypePricingConfig
                                  draft={d}
                                  disabled={!canManageServiceCatalog}
                                  onChange={(next) => setEtStandardsDraft((prev) => ({ ...prev, [et.id]: next }))}
                                />
                                {canManageServiceCatalog && (
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => handleSaveEngagementStandards(et.id)}
                                    style={{ ...btnPrimary, fontSize:11, padding:'4px 10px', marginTop: 6, opacity: saving ? 0.6 : 1 }}
                                  >
                                    {saving ? '…' : 'Save pricing'}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          {canManageServiceCatalog && (
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
                          )}
                        </div>
                      </div>
                    ))}
                    {canManageServiceCatalog && (
                    <div style={{ display:'flex', gap:8, marginTop:8 }}>
                      <input
                        value={newSubName[cat.id] || ''}
                        onChange={e => setNewSubName(prev => ({ ...prev, [cat.id]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && handleAddSubcategory(cat.id)}
                        placeholder="New subcategory name"
                        style={{ ...inputStyle, flex:1, fontSize:12, padding:'6px 8px' }}
                      />
                      <button type="button" onClick={() => handleAddSubcategory(cat.id)} style={{ ...btnPrimary, fontSize:12, padding:'6px 12px' }}>Add Subcategory</button>
                    </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            );
          })}

          {!svcCatLoading && serviceCategories.length === 0 && (
            <div style={{ color:'#94a3b8', fontSize:13, textAlign:'center', padding:'24px 0' }}>
              {canManageServiceCatalog
                ? 'No service categories yet. Add one above to get started.'
                : 'No service categories yet. A super admin or admin can add categories in this section.'}
            </div>
          )}
        </div>

        <div style={{ ...cardStyle, marginTop: 20 }}>
          <h3 style={sectionTitle}>📋 Quotation defaults</h3>
          <p style={{ fontSize:13, color:'#64748b', margin:'-12px 0 16px 0' }}>
            Required documents per engagement type for lead quotations. Pricing is configured on each engagement type above. Saving document changes requires the setup passphrase and an email OTP (usually to the super admin).
          </p>
          {quotationPending && (
            <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#0369a1', marginBottom:14 }}>
              <strong>Pending:</strong>{' '}
              {quotationPending.engagement_types_incomplete} of {quotationPending.engagement_types_total} engagement type(s) lack a complete quotation setup (pricing or document list).{' '}
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
          {quoteSaveMsg && (
            <div style={{ color:'#15803d', background:'#f0fdf4', padding:'8px 12px', borderRadius:6, fontSize:13, marginBottom:12 }}>{quoteSaveMsg}</div>
          )}
          {quotationLoading && <div style={{ color:'#64748b', fontSize:13 }}>Loading quotation defaults…</div>}
          {!quotationLoading && quotationRows.length > 0 && (
            <div style={{ overflowX:'auto' }}>
              <table style={{ ...tableStyle, minWidth: 520 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Engagement type</th>
                    <th style={thStyle}>Category</th>
                    <th style={thStyle}>Documents (one per line)</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}> </th>
                  </tr>
                </thead>
                <tbody>
                  {quotationRows.map((r) => {
                    const draft = quoteRowDrafts[r.engagement_type_id] || { documentsText: '' };
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
                              disabled={!!quoteSaveBusy[r.engagement_type_id]}
                              onClick={() => (
                                canBypassQuoteOtp
                                  ? handleQuoteSaveDirect(r, quoteRowDrafts[r.engagement_type_id] || draft)
                                  : openQuoteSaveModal(r, quoteRowDrafts[r.engagement_type_id] || draft)
                              )}
                            >
                              {quoteSaveBusy[r.engagement_type_id]
                                ? 'Saving…'
                                : (canBypassQuoteOtp ? 'Save' : 'Save…')}
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

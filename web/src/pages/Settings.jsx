import { useState, useEffect } from 'react';
import { getPortalTypes } from '../constants/portalTypes';
import { fetchPortalTypes, createPortalType, deletePortalType } from '../services/portalTypeService';
import { getRegisterTypes, saveRegisterTypes } from '../constants/registerTypes';
import { BILLING_PROFILES } from '../constants/billingProfiles';
import {
  getCategories,
  createCategory, deleteCategory,
  createSubcategory, deleteSubcategory,
  createEngagementTypeForSubcategory, deleteEngagementType,
} from '../services/serviceCategoryService';
import { API_BASE_URL } from '../constants/config';

// ── Available permission modules ─────────────────────────────────────────────
const PERMISSION_GROUPS = [
  { group: 'Dashboard', keys: ['dashboard.view'] },
  { group: 'Clients',   keys: ['clients.view', 'clients.create', 'clients.edit', 'clients.delete'] },
  { group: 'Services',  keys: ['services.view', 'services.create', 'services.edit', 'services.delete'] },
  { group: 'Documents', keys: ['documents.view', 'documents.upload'] },
  { group: 'Invoices',  keys: ['invoices.view', 'invoices.create', 'invoices.edit'] },
  { group: 'Calendar',  keys: ['calendar.view', 'calendar.create'] },
  { group: 'Credentials', keys: ['credentials.view'] },
  { group: 'Registers', keys: ['registers.view'] },
  { group: 'Leads',     keys: ['leads.view', 'leads.create', 'leads.edit'] },
  { group: 'Settings',  keys: ['settings.view'] },
  { group: 'Users',     keys: ['users.manage'] },
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
                      {key.split('.')[1]}
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

const firmData = {
  name: 'CA Rahul Gupta & Associates',
  gstin: '27ABCDE1234F1Z5',
  pan: 'ABCDE1234F',
  address: '3rd Floor, Shree Complex, MG Road, Mumbai – 400001',
  phone: '022-12345678',
  email: 'office@carahulgupta.in',
  website: 'www.carahulgupta.in',
};

const teamMembers = [
  { id: 'u1', name: 'CA Rahul Gupta', email: 'rahul@carahulgupta.in', role: 'admin', status: 'active' },
  { id: 'u2', name: 'CA Priya Sharma', email: 'priya@carahulgupta.in', role: 'partner', status: 'active' },
  { id: 'u3', name: 'Amit Patil', email: 'amit@carahulgupta.in', role: 'staff', status: 'active' },
  { id: 'u4', name: 'Sneha Joshi', email: 'sneha@carahulgupta.in', role: 'staff', status: 'active' },
  { id: 'u5', name: 'Rohan Mehta', email: 'rohan@carahulgupta.in', role: 'manager', status: 'inactive' },
];

const roleColors = { admin:'#ede9fe', partner:'#dbeafe', manager:'#dcfce7', staff:'#f1f5f9' };
const roleTextColors = { admin:'#5b21b6', partner:'#1d4ed8', manager:'#166534', staff:'#475569' };

export default function Settings() {
  const [tab, setTab] = useState('firm');
  const [portalTypes, setPortalTypes] = useState(() => getPortalTypes());
  const [newPortal, setNewPortal] = useState('');
  const [newPortalUrl, setNewPortalUrl] = useState('');
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState('');
  const [registerTypes, setRegisterTypes] = useState(() => getRegisterTypes());
  const [newRegister, setNewRegister] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [billingProfiles, setBillingProfiles] = useState(BILLING_PROFILES);
  const [showBillingForm, setShowBillingForm] = useState(false);
  const [billingEdit, setBillingEdit] = useState(null);
  const [billingForm, setBillingForm] = useState({ code:'', name:'' });
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

  // ── Roles & Permissions state ──────────────────────────────────────────────
  const [roles, setRoles]                   = useState([]);
  const [rolesLoading, setRolesLoading]     = useState(false);
  const [configureRole, setConfigureRole]   = useState(null);

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
    if (tab === 'service_config') {
      setSvcCatLoading(true);
      setSvcCatError('');
      getCategories()
        .then(setServiceCategories)
        .catch(() => setSvcCatError('Failed to load service categories.'))
        .finally(() => setSvcCatLoading(false));
    }
  }, [tab]);

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
    if (!window.confirm('Delete this category and all its subcategories and engagement types?')) return;
    deleteCategory(id)
      .then(() => setServiceCategories(prev => prev.filter(c => c.id !== id)))
      .catch(() => setSvcCatError('Failed to delete category.'));
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
      .catch(() => setSvcCatError('Failed to delete subcategory.'));
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
      .catch(() => setSvcCatError('Failed to delete engagement type.'));
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
    try {
      await deletePortalType(portal.id);
      setPortalTypes(prev => prev.filter(p => p.id !== portal.id));
      setPortalError('');
    } catch (e) {
      setPortalError(e.message || `Cannot delete "${portal.name}".`);
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

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:'2px solid #e2e8f0' }}>
        {[['firm','Firm Profile'],['team','Team & Users'],['roles','Roles & Permissions'],['billing','Billing Firms'],['notifications','Notifications'],['other','Other Settings'],['service_config','Service Configuration']].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{ padding:'8px 20px', background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:600, color:tab===t?'#2563eb':'#64748b', borderBottom:tab===t?'2px solid #2563eb':'2px solid transparent', marginBottom:-2 }}>
            {l}
          </button>
        ))}
      </div>

      {tab==='firm' && (
        <div style={{ maxWidth:640 }}>
          <div style={cardStyle}>
            <h3 style={sectionTitle}>🏢 Firm Profile</h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              {Object.entries(firmData).map(([k,v])=>(
                <div key={k}>
                  <label style={labelStyle}>{k.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}</label>
                  <input defaultValue={v} style={inputStyle} />
                </div>
              ))}
            </div>
            <button style={{ ...btnPrimary, marginTop:20 }}>💾 Save Changes</button>
          </div>
        </div>
      )}

      {tab==='team' && (
        <div>
          <div style={{ marginBottom:16, display:'flex', justifyContent:'flex-end' }}>
            <button style={btnPrimary}>➕ Invite Team Member</button>
          </div>
          <div style={cardStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>{['Name','Email','Role','Status','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {teamMembers.map(m=>(
                  <tr key={m.id} style={trStyle}>
                    <td style={{ ...tdStyle, fontWeight:600 }}>
                      <span style={{ width:32, height:32, borderRadius:'50%', background:roleColors[m.role]||'#e2e8f0', color:roleTextColors[m.role]||'#475569', display:'inline-flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12, marginRight:10 }}>
                        {m.name.split(' ').map(n=>n[0]).join('').slice(0,2)}
                      </span>
                      {m.name}
                    </td>
                    <td style={tdStyle}>{m.email}</td>
                    <td style={tdStyle}>
                      <span style={{ background:roleColors[m.role]||'#f1f5f9', color:roleTextColors[m.role]||'#475569', padding:'2px 10px', borderRadius:12, fontSize:12, fontWeight:600, textTransform:'capitalize' }}>
                        {m.role}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ color: m.status==='active'?'#16a34a':'#dc2626', fontWeight:600, fontSize:12 }}>
                        {m.status==='active'?'● Active':'● Inactive'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <button style={iconBtn}>✏️</button>
                      <button style={iconBtn}>🔑 Reset Password</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            <p style={{ fontSize:13, color:'#64748b', marginBottom:16 }}>Define what each role can access across the portal.</p>
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
                <button style={btnOutline} onClick={() => setConfigureRole(r)}>Configure</button>
              </div>
            ))}
            {!rolesLoading && roles.length === 0 && (
              <div style={{ fontSize:13, color:'#94a3b8', padding:'16px 0' }}>No roles found.</div>
            )}
          </div>
        </div>
      )}

      {tab==='billing' && (
        <div style={{ maxWidth:700 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div>
              <h2 style={{ margin:'0 0 4px 0', fontSize:18, fontWeight:700, color:'#1e293b' }}>🏢 Billing Firms</h2>
              <p style={{ margin:0, fontSize:13, color:'#64748b' }}>These billing profiles appear as options when raising invoices.</p>
            </div>
            <button style={btnPrimary} onClick={() => { setBillingForm({ code:'', name:'' }); setBillingEdit(null); setShowBillingForm(true); }}>➕ Add Billing Firm</button>
          </div>
          <div style={cardStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>{['Code','Firm Name','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {billingProfiles.map(p=>(
                  <tr key={p.id} style={trStyle}>
                    <td style={{ ...tdStyle, fontFamily:'monospace', fontWeight:700 }}>{p.code}</td>
                    <td style={{ ...tdStyle, fontWeight:600 }}>{p.name}</td>
                    <td style={tdStyle}>
                      <button style={iconBtn} onClick={() => { setBillingForm({ code:p.code, name:p.name }); setBillingEdit(p.id); setShowBillingForm(true); }}>✏️ Edit</button>
                      <button style={{ ...iconBtn, color:'#ef4444' }} onClick={() => { if(window.confirm(`Delete "${p.name}"?`)) setBillingProfiles(prev=>prev.filter(x=>x.id!==p.id)); }}>🗑️</button>
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
                  <input value={billingForm.code} onChange={e=>{ setBillingForm(v=>({...v,code:e.target.value})); setBillingError(''); }} style={inputStyle} placeholder="e.g. RBGC-CHD" />
                </div>
                <div>
                  <label style={labelStyle}>Firm Name</label>
                  <input value={billingForm.name} onChange={e=>{ setBillingForm(v=>({...v,name:e.target.value})); setBillingError(''); }} style={inputStyle} placeholder="e.g. RAHUL B GUPTA & CO." />
                </div>
              </div>
              {billingError && <div style={{ fontSize:11, color:'#dc2626', marginBottom:8 }}>{billingError}</div>}
              <div style={{ display:'flex', gap:8 }}>
                <button style={btnPrimary} onClick={() => {
                  if (!billingForm.code.trim()) { setBillingError('Code is required.'); return; }
                  if (!billingForm.name.trim()) { setBillingError('Firm name is required.'); return; }
                  if (billingEdit) {
                    setBillingProfiles(prev => prev.map(p => p.id === billingEdit ? { ...p, code:billingForm.code.trim(), name:billingForm.name.trim() } : p));
                  } else {
                    setBillingProfiles(prev => [...prev, { id: String(Date.now()), code:billingForm.code.trim(), name:billingForm.name.trim() }]);
                  }
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
              <div key={pt.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid #f1f5f9' }}>
                <div>
                  <span style={{ fontSize:13, color:'#334155', fontWeight:600 }}>{pt.name}</span>
                  {pt.url && (
                    <a href={pt.url} target="_blank" rel="noreferrer" style={{ display:'block', fontSize:11, color:'#2563eb', marginTop:2 }}>{pt.url}</a>
                  )}
                </div>
                <button onClick={() => handleDeletePortal(pt)} style={iconBtn} title="Delete">🗑️</button>
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

      {tab==='service_config' && (
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
                          <button onClick={() => handleDeleteSubcategory(cat.id, sub.id)} style={{ ...iconBtn, color:'#dc2626' }}>🗑️</button>
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

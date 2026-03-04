import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, User, Building2, Search, X, CheckSquare, Square } from 'lucide-react';
import { getServiceCatalog } from '../data/serviceCatalog';
import { addEngagement } from '../data/engagementStore';
import { mockContacts, mockOrganizations } from '../data/mockData';

// ── Mock staff list ───────────────────────────────────────────────────────────
const mockStaff = [
  'CA Rahul Gupta',
  'CA Priya Sharma',
  'Staff A',
  'Staff B',
  'Staff C',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function currentFY() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // 1-12
  // Indian FY: April (4) to March (3)
  if (month >= 4) return `${year}-${String(year + 1).slice(-2)}`;
  return `${year - 1}-${String(year).slice(-2)}`;
}

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'eng-' + crypto.randomUUID();
  }
  return 'eng-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, onClose }) {
  return (
    <div style={toastStyle}>
      <span>{message}</span>
      <button onClick={onClose} style={toastClose}><X size={14} /></button>
    </div>
  );
}

// ── Client preview card ───────────────────────────────────────────────────────
function ClientCard({ client, type }) {
  if (!client) return null;
  const name = client.displayName;
  const sub = type === 'contact'
    ? (client.city ? `📍 ${client.city}` : '')
    : (client.constitution ? client.constitution : '');
  const extra = type === 'contact'
    ? (client.linkedOrgsCount > 0 ? `${client.linkedOrgsCount} linked org${client.linkedOrgsCount > 1 ? 's' : ''}` : null)
    : (client.primaryContact && client.primaryContact !== '—' ? `Contact: ${client.primaryContact}` : null);
  return (
    <div style={clientCardStyle}>
      <div style={clientCardAvatar}>{name[0]}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0B1F3B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{sub}</div>}
        {extra && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{extra}</div>}
      </div>
    </div>
  );
}

// ── Searchable dropdown ───────────────────────────────────────────────────────
function SearchableDropdown({ items, value, onChange, placeholder }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(
    () => items.filter(i => i.displayName.toLowerCase().includes(query.toLowerCase())),
    [items, query],
  );

  const selected = items.find(i => i.id === value);

  function select(item) {
    onChange(item.id);
    setQuery('');
    setOpen(false);
  }

  function clear(e) {
    e.stopPropagation();
    onChange('');
    setQuery('');
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{ ...searchDropdownBox, borderColor: open ? '#F37920' : '#E6E8F0' }}
        onClick={() => setOpen(v => !v)}
      >
        <Search size={13} color="#94a3b8" style={{ flexShrink: 0 }} />
        <input
          style={searchDropdownInput}
          placeholder={selected ? selected.displayName : placeholder}
          value={open ? query : ''}
          onChange={e => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => setOpen(true)}
          onClick={e => e.stopPropagation()}
        />
        {selected && (
          <button onClick={clear} style={searchDropdownClear}>
            <X size={12} />
          </button>
        )}
      </div>
      {open && (
        <div style={searchDropdownMenu}>
          {filtered.length === 0 && (
            <div style={searchDropdownEmpty}>No results found</div>
          )}
          {filtered.map(item => (
            <div
              key={item.id}
              style={{ ...searchDropdownItem, background: item.id === value ? '#FEF0E6' : undefined }}
              onClick={() => select(item)}
              onMouseEnter={e => { if (item.id !== value) e.currentTarget.style.background = '#F6F7FB'; }}
              onMouseLeave={e => { if (item.id !== value) e.currentTarget.style.background = ''; }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: '#0B1F3B' }}>{item.displayName}</div>
              {item.city && <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.city}</div>}
            </div>
          ))}
        </div>
      )}
      {open && <div style={overlay} onClick={() => setOpen(false)} />}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function NewServiceEngagement() {
  const navigate = useNavigate();
  const catalog = getServiceCatalog();
  const hasCatalog = catalog.categories && catalog.categories.length > 0;

  // Client selection
  const [clientType, setClientType] = useState('contact'); // 'contact' | 'organization'
  const [clientId, setClientId] = useState('');

  // Service catalog selection
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [engagementTypeId, setEngagementTypeId] = useState('');

  // Other fields
  const [fy, setFy] = useState(currentFY());
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('not_started');
  const [fee, setFee] = useState('');
  const [notes, setNotes] = useState('');
  const [createChecklist, setCreateChecklist] = useState(false);

  // UI state
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState('');

  // ── Derived catalog data ────────────────────────────────────────────────────
  const categories = catalog.categories;

  const selectedCategory = categories.find(c => c.id === categoryId);
  const subcategories = selectedCategory?.subcategories ?? [];

  const selectedSubcategory = subcategories.find(s => s.id === subcategoryId);
  const engagementTypes = selectedSubcategory?.engagementTypes ?? [];

  const selectedEngagementType = engagementTypes.find(e => e.id === engagementTypeId);

  // ── Client lists ────────────────────────────────────────────────────────────
  const clientList = clientType === 'contact' ? mockContacts : mockOrganizations;
  const selectedClient = clientList.find(c => c.id === clientId);

  // ── Cascade reset helpers ───────────────────────────────────────────────────
  function handleCategoryChange(id) {
    setCategoryId(id);
    setSubcategoryId('');
    setEngagementTypeId('');
  }

  function handleSubcategoryChange(id) {
    setSubcategoryId(id);
    setEngagementTypeId('');
  }

  function handleClientTypeChange(type) {
    setClientType(type);
    setClientId('');
  }

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate() {
    const e = {};
    if (!clientId) e.clientId = 'Please select a client.';
    if (!categoryId) e.categoryId = 'Category is required.';
    if (!subcategoryId) e.subcategoryId = 'Subcategory is required.';
    if (!engagementTypeId) e.engagementTypeId = 'Engagement Type is required.';
    if (!assignedTo) e.assignedTo = 'Assigned To is required.';
    if (!dueDate) e.dueDate = 'Due Date is required.';
    return e;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  function handleCreate() {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      // Scroll to first error
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setErrors({});

    const checklist = (createChecklist && selectedEngagementType?.defaultChecklist)
      ? selectedEngagementType.defaultChecklist.map((title, idx) => ({
          id: `task-${generateId()}-${idx}`,
          title,
          status: 'pending',
          assignedTo: assignedTo,
          dueDate: dueDate,
          priority: 'medium',
        }))
      : [];

    const engagement = {
      id: generateId(),
      clientType,
      clientId,
      clientName: selectedClient.displayName,
      categoryId,
      categoryName: selectedCategory.name,
      subcategoryId,
      subcategoryName: selectedSubcategory.name,
      engagementTypeId,
      engagementTypeName: selectedEngagementType.name,
      // Services table uses `type` for the service label
      type: `${selectedCategory.name} – ${selectedEngagementType.name}`,
      financialYear: fy,
      assignedTo,
      dueDate,
      status,
      feeAgreed: fee ? Number(fee) : null,
      notes,
      tasks: checklist,
    };

    addEngagement(engagement);
    setToast('Engagement created');
    setTimeout(() => navigate('/services'), 1200);
  }

  function handleCancel() {
    navigate('/services');
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={pageWrap}>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}

      {/* Breadcrumb */}
      <div style={breadcrumbRow}>
        <span style={crumb} onClick={() => navigate('/')} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && navigate('/')}>Home</span>
        <ChevronRight size={13} color="#94a3b8" />
        <span style={crumb} onClick={() => navigate('/services')} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && navigate('/services')}>Services &amp; Tasks</span>
        <ChevronRight size={13} color="#94a3b8" />
        <span style={crumbActive}>New Service Engagement</span>
      </div>

      <div style={pageTitle}>New Service Engagement</div>

      {/* Empty catalog guard */}
      {!hasCatalog && (
        <div style={emptyCatalogCard}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>⚙️</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0B1F3B', marginBottom: 4 }}>No Service Catalog configured yet.</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            Please configure your Service Catalog in Settings before creating an engagement.
          </div>
        </div>
      )}

      {hasCatalog && (
        <div style={formGrid}>
          {/* ── Section: Client ─────────────────────────────────────────── */}
          <FormSection title="Client Selection">
            {/* Toggle */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 16 }}>
              <ToggleButton
                active={clientType === 'contact'}
                onClick={() => handleClientTypeChange('contact')}
                icon={<User size={14} />}
                label="Person (Contact)"
                side="left"
              />
              <ToggleButton
                active={clientType === 'organization'}
                onClick={() => handleClientTypeChange('organization')}
                icon={<Building2 size={14} />}
                label="Organization"
                side="right"
              />
            </div>

            <FieldLabel label="Select Client" required />
            <SearchableDropdown
              items={clientList}
              value={clientId}
              onChange={id => { setClientId(id); setErrors(prev => ({ ...prev, clientId: '' })); }}
              placeholder={`Search ${clientType === 'contact' ? 'contact' : 'organization'}…`}
            />
            {errors.clientId && <ErrorMsg msg={errors.clientId} />}

            {selectedClient && (
              <div style={{ marginTop: 12 }}>
                <ClientCard client={selectedClient} type={clientType} />
              </div>
            )}
          </FormSection>

          {/* ── Section: Service ────────────────────────────────────────── */}
          <FormSection title="Service Details">
            <FieldLabel label="Category" required />
            <select
              value={categoryId}
              onChange={e => { handleCategoryChange(e.target.value); setErrors(prev => ({ ...prev, categoryId: '' })); }}
              style={{ ...selectStyle, borderColor: errors.categoryId ? '#ef4444' : '#E6E8F0' }}
            >
              <option value="">Select category…</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {errors.categoryId && <ErrorMsg msg={errors.categoryId} />}

            <FieldLabel label="Subcategory" required style={{ marginTop: 14 }} />
            <select
              value={subcategoryId}
              onChange={e => { handleSubcategoryChange(e.target.value); setErrors(prev => ({ ...prev, subcategoryId: '' })); }}
              style={{ ...selectStyle, borderColor: errors.subcategoryId ? '#ef4444' : '#E6E8F0' }}
              disabled={!categoryId}
            >
              <option value="">
                {categoryId ? 'Select subcategory…' : '← Select a category first'}
              </option>
              {subcategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {errors.subcategoryId && <ErrorMsg msg={errors.subcategoryId} />}

            <FieldLabel label="Engagement Type" required style={{ marginTop: 14 }} />
            <select
              value={engagementTypeId}
              onChange={e => { setEngagementTypeId(e.target.value); setErrors(prev => ({ ...prev, engagementTypeId: '' })); }}
              style={{ ...selectStyle, borderColor: errors.engagementTypeId ? '#ef4444' : '#E6E8F0' }}
              disabled={!subcategoryId}
            >
              <option value="">
                {subcategoryId ? 'Select engagement type…' : '← Select a subcategory first'}
              </option>
              {engagementTypes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            {errors.engagementTypeId && <ErrorMsg msg={errors.engagementTypeId} />}
          </FormSection>

          {/* ── Section: Engagement Details ─────────────────────────────── */}
          <FormSection title="Engagement Details">
            <div style={twoCol}>
              <div>
                <FieldLabel label="Financial Year" />
                <input
                  value={fy}
                  onChange={e => setFy(e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. 2025-26"
                />
              </div>
              <div>
                <FieldLabel label="Status" />
                <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="pending_info">Pending Info</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            <div style={{ ...twoCol, marginTop: 14 }}>
              <div>
                <FieldLabel label="Assigned To" required />
                <select
                  value={assignedTo}
                  onChange={e => { setAssignedTo(e.target.value); setErrors(prev => ({ ...prev, assignedTo: '' })); }}
                  style={{ ...selectStyle, borderColor: errors.assignedTo ? '#ef4444' : '#E6E8F0' }}
                >
                  <option value="">Select staff…</option>
                  {mockStaff.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {errors.assignedTo && <ErrorMsg msg={errors.assignedTo} />}
              </div>
              <div>
                <FieldLabel label="Due Date" required />
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => { setDueDate(e.target.value); setErrors(prev => ({ ...prev, dueDate: '' })); }}
                  style={{ ...inputStyle, borderColor: errors.dueDate ? '#ef4444' : '#E6E8F0' }}
                />
                {errors.dueDate && <ErrorMsg msg={errors.dueDate} />}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <FieldLabel label="Fee (₹)" />
              <div style={feeWrap}>
                <span style={feePrefix}>₹</span>
                <input
                  type="number"
                  min="0"
                  value={fee}
                  onChange={e => setFee(e.target.value)}
                  placeholder="0"
                  style={{ ...inputStyle, borderRadius: '0 8px 8px 0', borderLeft: 'none', paddingLeft: 8 }}
                />
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <FieldLabel label="Notes" />
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Optional notes…"
                style={textareaStyle}
              />
            </div>

            {/* Checklist checkbox */}
            {selectedEngagementType?.defaultChecklist?.length > 0 && (
              <div
                style={checklistToggle}
                onClick={() => setCreateChecklist(v => !v)}
                role="checkbox"
                aria-checked={createChecklist}
                tabIndex={0}
                onKeyDown={e => e.key === ' ' && setCreateChecklist(v => !v)}
              >
                {createChecklist
                  ? <CheckSquare size={18} color="#F37920" />
                  : <Square size={18} color="#94a3b8" />
                }
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0B1F3B' }}>
                    Create starter task checklist
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Generates {selectedEngagementType.defaultChecklist.length} suggested tasks based on "{selectedEngagementType.name}"
                  </div>
                </div>
              </div>
            )}

            {/* Checklist preview */}
            {createChecklist && selectedEngagementType?.defaultChecklist?.length > 0 && (
              <div style={checklistPreview}>
                {selectedEngagementType.defaultChecklist.map((task, i) => (
                  <div key={i} style={checklistItem}>
                    <div style={taskDot} />
                    <span style={{ fontSize: 12, color: '#334155' }}>{task}</span>
                  </div>
                ))}
              </div>
            )}
          </FormSection>
        </div>
      )}

      {/* Action buttons */}
      <div style={actionRow}>
        <button style={btnSecondary} onClick={handleCancel}>Cancel</button>
        {hasCatalog && (
          <button style={btnPrimary} onClick={handleCreate}>Create Engagement</button>
        )}
      </div>
    </div>
  );
}

// ── Small components ──────────────────────────────────────────────────────────
function FormSection({ title, children }) {
  return (
    <div style={sectionCard}>
      <div style={sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

function FieldLabel({ label, required, style: extra }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6, ...extra }}>
      {label}
      {required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    </div>
  );
}

function ErrorMsg({ msg }) {
  return <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{msg}</div>;
}

function ToggleButton({ active, onClick, icon, label, side }) {
  const radius = side === 'left'
    ? { borderRadius: '8px 0 0 8px' }
    : { borderRadius: '0 8px 8px 0' };
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 18px',
        border: `1.5px solid ${active ? '#F37920' : '#E6E8F0'}`,
        background: active ? '#FEF0E6' : '#fff',
        color: active ? '#C25A0A' : '#64748b',
        fontWeight: active ? 700 : 500,
        fontSize: 13,
        cursor: 'pointer',
        ...radius,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const pageWrap = { padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, background: '#F6F7FB', minHeight: '100%' };
const breadcrumbRow = { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' };
const crumb = { fontSize: 12, color: '#94a3b8', fontWeight: 500, cursor: 'pointer', textDecoration: 'none' };
const crumbActive = { fontSize: 12, color: '#F37920', fontWeight: 600 };
const pageTitle = { fontSize: 22, fontWeight: 700, color: '#0B1F3B', lineHeight: 1.2 };

const emptyCatalogCard = {
  background: '#fff', border: '1px solid #E6E8F0', borderRadius: 14,
  padding: '40px 24px', textAlign: 'center',
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
};

const formGrid = { display: 'flex', flexDirection: 'column', gap: 16 };
const sectionCard = {
  background: '#fff', borderRadius: 14, border: '1px solid #E6E8F0',
  padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
};
const sectionTitle = { fontSize: 14, fontWeight: 700, color: '#0B1F3B', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #F0F2F8' };

const twoCol = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 };

const inputStyle = {
  width: '100%', padding: '8px 12px', border: '1px solid #E6E8F0', borderRadius: 8,
  fontSize: 13, color: '#334155', outline: 'none', background: '#fff', boxSizing: 'border-box',
};
const selectStyle = {
  width: '100%', padding: '8px 12px', border: '1px solid #E6E8F0', borderRadius: 8,
  fontSize: 13, color: '#334155', outline: 'none', background: '#fff', cursor: 'pointer', boxSizing: 'border-box',
};
const textareaStyle = {
  width: '100%', padding: '8px 12px', border: '1px solid #E6E8F0', borderRadius: 8,
  fontSize: 13, color: '#334155', outline: 'none', background: '#fff',
  resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
};

const feeWrap = { display: 'flex', alignItems: 'center' };
const feePrefix = {
  padding: '8px 10px', background: '#F6F7FB', border: '1px solid #E6E8F0',
  borderRight: 'none', borderRadius: '8px 0 0 8px', fontSize: 13, color: '#64748b', fontWeight: 600, flexShrink: 0,
};

const clientCardStyle = {
  display: 'flex', alignItems: 'center', gap: 10,
  background: '#F6F7FB', border: '1px solid #E6E8F0',
  borderRadius: 10, padding: '10px 14px', maxWidth: 420,
};
const clientCardAvatar = {
  width: 34, height: 34, borderRadius: 9,
  background: 'linear-gradient(135deg, #F37920 0%, #f5a623 100%)',
  color: '#fff', fontWeight: 700, fontSize: 13,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};

const searchDropdownBox = {
  display: 'flex', alignItems: 'center', gap: 8,
  border: '1.5px solid #E6E8F0', borderRadius: 8,
  padding: '7px 10px', background: '#fff', cursor: 'text', position: 'relative',
};
const searchDropdownInput = {
  border: 'none', outline: 'none', fontSize: 13, color: '#334155',
  background: 'transparent', flex: 1, minWidth: 0,
};
const searchDropdownClear = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#94a3b8', padding: 0, display: 'flex', alignItems: 'center',
};
const searchDropdownMenu = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
  background: '#fff', border: '1px solid #E6E8F0', borderRadius: 10,
  boxShadow: '0 8px 24px rgba(0,0,0,0.10)', maxHeight: 220, overflowY: 'auto',
};
const searchDropdownItem = {
  padding: '8px 12px', cursor: 'pointer', transition: 'background 0.1s',
};
const searchDropdownEmpty = { padding: '12px', fontSize: 13, color: '#94a3b8', textAlign: 'center' };
const overlay = { position: 'fixed', inset: 0, zIndex: 199 };

const checklistToggle = {
  display: 'flex', alignItems: 'flex-start', gap: 10,
  background: '#F6F7FB', border: '1px solid #E6E8F0', borderRadius: 10,
  padding: '12px 14px', cursor: 'pointer', marginTop: 16, userSelect: 'none',
};
const checklistPreview = {
  background: '#F8FAFC', border: '1px solid #E6E8F0', borderRadius: 10,
  padding: '12px 14px', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6,
};
const checklistItem = { display: 'flex', alignItems: 'center', gap: 8 };
const taskDot = { width: 7, height: 7, borderRadius: '50%', background: '#cbd5e1', flexShrink: 0 };

const actionRow = {
  display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10,
  paddingTop: 4,
};
const btnPrimary = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '10px 22px',
  background: '#F37920', color: '#fff', border: 'none', borderRadius: 8,
  cursor: 'pointer', fontSize: 14, fontWeight: 600,
  boxShadow: '0 2px 8px rgba(243,121,32,0.30)',
};
const btnSecondary = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
  background: '#fff', color: '#64748b', border: '1px solid #E6E8F0', borderRadius: 8,
  cursor: 'pointer', fontSize: 14, fontWeight: 600,
};

const toastStyle = {
  position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
  display: 'flex', alignItems: 'center', gap: 12,
  background: '#0B1F3B', color: '#fff', padding: '12px 18px',
  borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.20)',
  fontSize: 13, fontWeight: 600,
};
const toastClose = {
  background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer',
  display: 'flex', alignItems: 'center', padding: 0,
};

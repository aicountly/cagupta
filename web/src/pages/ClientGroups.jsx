import { useState, useEffect } from 'react';
import { getGroups, createGroup, updateGroup, deleteGroup, getGroupMembers } from '../services/clientGroupService';
import { updateContact } from '../services/contactService';
import { updateOrganization } from '../services/organizationService';

const PRESET_COLORS = ['#6366f1', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed'];

export default function ClientGroups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Side panel
  const [selected, setSelected] = useState(null);
  const [members, setMembers] = useState({ contacts: [], organizations: [] });
  const [membersLoading, setMembersLoading] = useState(false);

  // Create/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [modalForm, setModalForm] = useState({ name: '', description: '', color: '#6366f1' });
  const [modalErrors, setModalErrors] = useState({});
  const [saving, setSaving] = useState(false);

  function loadGroups() {
    setLoading(true);
    getGroups()
      .then(data => { setGroups(data); setError(''); })
      .catch(err => setError(err.message || 'Failed to load groups.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadGroups(); }, []);

  function openCreateModal() {
    setEditingGroup(null);
    setModalForm({ name: '', description: '', color: '#6366f1' });
    setModalErrors({});
    setShowModal(true);
  }

  function openEditModal(g, e) {
    e.stopPropagation();
    setEditingGroup(g);
    setModalForm({ name: g.name || '', description: g.description || '', color: g.color || '#6366f1' });
    setModalErrors({});
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingGroup(null);
  }

  async function handleSave() {
    const errs = {};
    if (!modalForm.name.trim()) errs.name = 'Group name is required.';
    if (Object.keys(errs).length > 0) { setModalErrors(errs); return; }
    setSaving(true);
    try {
      if (editingGroup) {
        await updateGroup(editingGroup.id, { name: modalForm.name.trim(), description: modalForm.description.trim() || null, color: modalForm.color });
      } else {
        await createGroup({ name: modalForm.name.trim(), description: modalForm.description.trim() || null, color: modalForm.color });
      }
      closeModal();
      loadGroups();
    } catch (err) {
      setModalErrors({ general: err.message || 'Failed to save group.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(g, e) {
    e.stopPropagation();
    if (!window.confirm(`Delete group "${g.name}"? This will not delete its members.`)) return;
    try {
      await deleteGroup(g.id);
      if (selected?.id === g.id) setSelected(null);
      loadGroups();
    } catch (err) {
      alert('Failed to delete group: ' + (err.message || 'Unknown error'));
    }
  }

  function openPanel(g) {
    setSelected(g);
    setMembersLoading(true);
    getGroupMembers(g.id)
      .then(data => setMembers(data))
      .catch(() => setMembers({ contacts: [], organizations: [] }))
      .finally(() => setMembersLoading(false));
  }

  async function removeContact(contactId) {
    try {
      await updateContact(contactId, { group_id: null });
      setMembers(prev => ({ ...prev, contacts: prev.contacts.filter(c => c.id !== contactId) }));
    } catch (err) {
      alert('Failed to remove contact: ' + (err.message || 'Unknown error'));
    }
  }

  async function removeOrganization(orgId) {
    try {
      await updateOrganization(orgId, { group_id: null });
      setMembers(prev => ({ ...prev, organizations: prev.organizations.filter(o => o.id !== orgId) }));
    } catch (err) {
      alert('Failed to remove organization: ' + (err.message || 'Unknown error'));
    }
  }

  const filtered = groups.filter(g =>
    g.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: 24, background: '#F6F7FB', minHeight: '100%', display: 'flex', gap: 20 }}>
      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {error && (
          <div style={{ color: '#dc2626', marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
          <input
            placeholder="🔍 Search groups…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={inputStyle}
          />
          <button onClick={openCreateModal} style={btnPrimary}>
            ➕ Create Group
          </button>
        </div>

        {/* Cards */}
        {loading ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40, fontSize: 14 }}>Loading groups…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40, fontSize: 14 }}>
            {groups.length === 0 ? 'No groups yet. Create one to get started.' : 'No groups match your search.'}
          </div>
        ) : (
          <div style={gridStyle}>
            {filtered.map(g => {
              const contactCount = g.contact_count ?? g.contacts_count ?? 0;
              const orgCount = g.org_count ?? g.organizations_count ?? 0;
              const color = g.color || '#6366f1';
              const isActive = selected?.id === g.id;
              return (
                <div
                  key={g.id}
                  onClick={() => openPanel(g)}
                  style={{
                    ...cardStyle,
                    cursor: 'pointer',
                    outline: isActive ? `2px solid ${color}` : 'none',
                    outlineOffset: -2,
                    transition: 'box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = cardStyle.boxShadow; }}
                >
                  {/* Top row: swatch + actions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={e => openEditModal(g, e)}
                        style={iconBtn}
                        title="Edit group"
                      >✏️</button>
                      <button
                        onClick={e => handleDelete(g, e)}
                        style={iconBtn}
                        title="Delete group"
                      >🗑️</button>
                    </div>
                  </div>

                  {/* Name */}
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{g.name}</div>

                  {/* Description */}
                  {g.description && (
                    <div style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic', marginBottom: 8 }}>{g.description}</div>
                  )}

                  {/* Member count chip */}
                  <div style={{
                    display: 'inline-block',
                    background: '#F1F5F9',
                    color: '#475569',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: 20,
                    marginTop: 4,
                  }}>
                    {contactCount} Contact{contactCount !== 1 ? 's' : ''} · {orgCount} Org{orgCount !== 1 ? 's' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Side panel */}
      {selected && (
        <div style={panelStyle}>
          {/* Color bar at top */}
          <div style={{ height: 6, background: selected.color || '#6366f1', borderRadius: '12px 12px 0 0', margin: '-20px -20px 16px' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: selected.color || '#6366f1', flexShrink: 0 }} />
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1e293b' }}>{selected.name}</div>
          </div>

          {selected.description && (
            <div style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic', marginBottom: 12 }}>{selected.description}</div>
          )}

          <hr style={{ border: 'none', borderTop: '1px solid #F0F2F8', margin: '12px 0' }} />

          {membersLoading ? (
            <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 20 }}>Loading members…</div>
          ) : (
            <>
              {/* Contacts sub-list */}
              <div style={{ marginBottom: 16 }}>
                <div style={subHeading}>Contacts ({members.contacts?.length || 0})</div>
                {(members.contacts || []).length === 0 ? (
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>No contacts in this group.</div>
                ) : (
                  members.contacts.map(c => {
                    const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.organization_name || c.displayName || 'Unknown';
                    return (
                      <div key={c.id} style={memberRow}>
                        <span style={{ fontSize: 13, color: '#1e293b' }}>{name}</span>
                        <button
                          onClick={() => removeContact(c.id)}
                          style={removeBtnStyle}
                          title="Remove from group"
                        >✕</button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Organizations sub-list */}
              <div style={{ marginBottom: 16 }}>
                <div style={subHeading}>Organizations ({members.organizations?.length || 0})</div>
                {(members.organizations || []).length === 0 ? (
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>No organizations in this group.</div>
                ) : (
                  members.organizations.map(o => {
                    const name = o.name || o.displayName || 'Unknown';
                    return (
                      <div key={o.id} style={memberRow}>
                        <span style={{ fontSize: 13, color: '#1e293b' }}>{name}</span>
                        <button
                          onClick={() => removeOrganization(o.id)}
                          style={removeBtnStyle}
                          title="Remove from group"
                        >✕</button>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          <button
            onClick={() => setSelected(null)}
            style={{ ...btnOutline, width: '100%', marginTop: 8 }}
          >
            Close
          </button>
        </div>
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0B1F3B' }}>
                {editingGroup ? 'Edit Group' : 'Create Group'}
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#64748b', lineHeight: 1 }}>✕</button>
            </div>

            {modalErrors.general && (
              <div style={{ color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
                {modalErrors.general}
              </div>
            )}

            {/* Name */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Group Name <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                value={modalForm.name}
                onChange={e => { setModalForm(prev => ({ ...prev, name: e.target.value })); setModalErrors(prev => ({ ...prev, name: undefined })); }}
                placeholder="e.g. Sharma Family"
                style={{ ...inputStyle, borderColor: modalErrors.name ? '#ef4444' : '#E6E8F0' }}
                autoFocus
              />
              {modalErrors.name && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>{modalErrors.name}</div>}
            </div>

            {/* Description */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Description <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 11 }}>(optional)</span></label>
              <textarea
                value={modalForm.description}
                onChange={e => setModalForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Short description…"
                rows={2}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            {/* Color picker */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Color</label>
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setModalForm(prev => ({ ...prev, color: c }))}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', background: c,
                      border: modalForm.color === c ? '3px solid #0B1F3B' : '3px solid transparent',
                      cursor: 'pointer', outline: modalForm.color === c ? `2px solid ${c}` : 'none',
                      outlineOffset: 2, transition: 'all 0.15s',
                    }}
                    title={c}
                  >
                    {modalForm.color === c && (
                      <span style={{ color: '#fff', fontSize: 14, lineHeight: 1, display: 'block', textAlign: 'center' }}>✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={closeModal} style={btnOutline} disabled={saving}>Cancel</button>
              <button onClick={handleSave} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }} disabled={saving}>
                {saving ? '⏳ Saving…' : editingGroup ? 'Save Changes' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const cardStyle = {
  background: '#fff',
  borderRadius: 14,
  boxShadow: '0 1px 4px rgba(0,0,0,.06)',
  border: '1px solid #E6E8F0',
  padding: 18,
};

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: 16,
};

const panelStyle = {
  width: 300,
  flexShrink: 0,
  background: '#fff',
  borderRadius: 14,
  boxShadow: '0 1px 4px rgba(0,0,0,.06)',
  border: '1px solid #E6E8F0',
  padding: 20,
  alignSelf: 'flex-start',
  position: 'sticky',
  top: 16,
  maxHeight: 'calc(100vh - 100px)',
  overflowY: 'auto',
};

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #E6E8F0',
  fontSize: 13,
  color: '#1e293b',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle = { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 };

const btnPrimary = {
  background: '#F37920',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const btnOutline = {
  background: '#fff',
  color: '#475569',
  border: '1px solid #E6E8F0',
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const iconBtn = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '2px 4px',
  fontSize: 14,
  borderRadius: 4,
  lineHeight: 1,
};

const memberRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '6px 0',
  borderBottom: '1px solid #F1F5F9',
};

const removeBtnStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#94a3b8',
  fontSize: 13,
  padding: '2px 4px',
  borderRadius: 4,
  lineHeight: 1,
};

const subHeading = {
  fontSize: 11,
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 8,
};

const modalOverlay = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 16,
};

const modalBox = {
  background: '#fff',
  borderRadius: 14,
  padding: 24,
  width: '100%',
  maxWidth: 440,
  boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
};

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { API_BASE_URL, SUPER_ADMIN_EMAIL } from '../constants/config';
import { ROLE_LABELS, ROLE_BADGE_COLORS } from '../constants/roles';

/* ─── API helpers ─────────────────────────────────────────────────────────── */

async function apiFetch(token, path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `Error ${res.status}`);
  return json;
}

/* ─── Sub-components ──────────────────────────────────────────────────────── */

function RoleBadge({ role }) {
  const colors = ROLE_BADGE_COLORS[role] || ROLE_BADGE_COLORS.viewer;
  return (
    <span style={{
      display:       'inline-block',
      padding:       '2px 10px',
      borderRadius:  12,
      fontSize:      12,
      fontWeight:    600,
      background:    colors.bg,
      color:         colors.color,
      border:        `1px solid ${colors.border}`,
    }}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}

function StatusBadge({ active }) {
  return (
    <span style={{
      display:      'inline-block',
      padding:      '2px 10px',
      borderRadius: 12,
      fontSize:     12,
      fontWeight:   600,
      background:   active ? '#dcfce7' : '#f3f4f6',
      color:        active ? '#166534' : '#6b7280',
      border:       `1px solid ${active ? '#86efac' : '#d1d5db'}`,
    }}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

/* ─── Add / Edit User Modal ──────────────────────────────────────────────── */

function UserModal({ mode, user, roles, onClose, onSave }) {
  const [form, setForm] = useState({
    name:                 user?.name     || '',
    email:                user?.email    || '',
    password:             '',
    role_id:              user?.role_id  || (roles[0]?.id ?? ''),
    is_active:            user?.is_active !== false,
    shift_target_minutes: user?.shift_target_minutes ?? 510,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {mode === 'add' ? '➕ Add New User' : '✏️ Edit User'}
          </h2>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={styles.formBody}>
            {error && <div style={styles.errorBox}>{error}</div>}

            <label style={styles.label}>Full Name *</label>
            <input
              style={styles.input}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              placeholder="e.g. Priya Sharma"
            />

            <label style={styles.label}>Email Address *</label>
            <input
              style={styles.input}
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              required
              disabled={mode === 'edit'}
              placeholder="e.g. priya@example.com"
            />

            {mode === 'add' && (
              <>
                <label style={styles.label}>Password *</label>
                <input
                  style={styles.input}
                  type="password"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  required
                  minLength={8}
                  placeholder="Minimum 8 characters"
                />
              </>
            )}

            <label style={styles.label}>Role *</label>
            <select
              style={styles.input}
              value={form.role_id}
              onChange={(e) => set('role_id', Number(e.target.value))}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {ROLE_LABELS[r.name] || r.display_name}
                </option>
              ))}
            </select>

            <label style={styles.label}>Daily target (minutes)</label>
            <input
              style={styles.input}
              type="number"
              min={60}
              max={1440}
              step={1}
              value={form.shift_target_minutes}
              onChange={(e) => set('shift_target_minutes', Number(e.target.value))}
              placeholder="510"
            />

            {mode === 'edit' && (
              <>
                <label style={styles.label}>Status</label>
                <select
                  style={styles.input}
                  value={form.is_active ? 'active' : 'inactive'}
                  onChange={(e) => set('is_active', e.target.value === 'active')}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </>
            )}
          </div>

          <div style={styles.modalFooter}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={styles.saveBtn}>
              {saving ? 'Saving…' : 'Save User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */

export default function UserManagement() {
  const { session } = useAuth();
  const token = session?.token;

  const [users,      setUsers]      = useState([]);
  const [roles,      setRoles]      = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [perPage]                   = useState(20);
  const [search,     setSearch]     = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [modal,      setModal]      = useState(null); // null | { mode: 'add'|'edit', user? }

  // ── Fetch data ─────────────────────────────────────────────────────────────

  const loadRoles = useCallback(async () => {
    if (!token || !API_BASE_URL) return;
    try {
      const res = await apiFetch(token, '/admin/roles');
      setRoles(res.data || []);
    } catch {
      // roles load failure is non-fatal
    }
  }, [token]);

  const loadUsers = useCallback(async () => {
    if (!token || !API_BASE_URL) {
      // Show demo data in mock mode
      setUsers([{
        id: 1, name: 'Rahul Gupta', email: SUPER_ADMIN_EMAIL,
        role: 'super_admin', is_active: true, last_login_at: null, login_provider: 'local',
      }]);
      setTotal(1);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page:     String(page),
        per_page: String(perPage),
        ...(search     ? { search }      : {}),
        ...(roleFilter ? { role: roleFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      const res = await apiFetch(token, `/admin/users?${params}`);
      setUsers(res.data || []);
      setTotal(res.pagination?.total || 0);
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [token, page, perPage, search, roleFilter, statusFilter]);

  useEffect(() => { loadRoles(); }, [loadRoles]);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleSave(form) {
    if (!token || !API_BASE_URL) return;
    if (modal.mode === 'add') {
      await apiFetch(token, '/admin/users', {
        method: 'POST',
        body:   JSON.stringify(form),
      });
    } else {
      const { password: _pw, email: _em, ...updateData } = form;
      await apiFetch(token, `/admin/users/${modal.user.id}`, {
        method: 'PUT',
        body:   JSON.stringify(updateData),
      });
    }
    loadUsers();
  }

  async function handleDeactivate(user) {
    if (!window.confirm(`Deactivate ${user.name}?`)) return;
    try {
      await apiFetch(token, `/admin/users/${user.id}`, { method: 'DELETE' });
      loadUsers();
    } catch (err) {
      alert(err.message || 'Failed to deactivate user');
    }
  }

  // ── Pagination ─────────────────────────────────────────────────────────────
  const lastPage = Math.max(1, Math.ceil(total / perPage));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>👥 User Management</h1>
          <p style={styles.pageSubtitle}>{total} user{total !== 1 ? 's' : ''} total</p>
        </div>
        <button style={styles.addBtn} onClick={() => setModal({ mode: 'add' })}>
          + Add User
        </button>
      </div>

      {/* Filters */}
      <div style={styles.filtersRow}>
        <input
          style={{ ...styles.filterInput, flex: 2 }}
          placeholder="🔍  Search by name or email…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          style={styles.filterInput}
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Roles</option>
          {Object.entries(ROLE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          style={styles.filterInput}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Error */}
      {error && <div style={styles.errorBox}>{error}</div>}

      {/* Table */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.thead}>
              <th style={styles.th}>User</th>
              <th style={styles.th}>Role</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Last Login</th>
              <th style={styles.th}>Provider</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
                  No users found.
                </td>
              </tr>
            ) : users.map((u) => {
              const isSuperAdmin = u.email === SUPER_ADMIN_EMAIL;
              return (
                <tr key={u.id} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={styles.avatar}>
                        {(u.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>
                          {u.name}
                          {isSuperAdmin && (
                            <span title="Super Admin — protected" style={{ marginLeft: 6 }}>🔒</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={styles.td}>
                    <RoleBadge role={u.role || u.role_name} />
                  </td>
                  <td style={styles.td}>
                    <StatusBadge active={u.is_active} />
                  </td>
                  <td style={styles.td}>
                    {u.last_login_at
                      ? new Date(u.last_login_at).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })
                      : <span style={{ color: '#9ca3af' }}>Never</span>
                    }
                  </td>
                  <td style={styles.td}>
                    <span style={{ textTransform: 'capitalize', fontSize: 12, color: '#475569' }}>
                      {u.login_provider || 'local'}
                    </span>
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    {isSuperAdmin ? (
                      <span style={{ color: '#9ca3af', fontSize: 13 }}>Protected</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                          style={styles.editBtn}
                          onClick={() => setModal({ mode: 'edit', user: u })}
                        >
                          Edit
                        </button>
                        {u.is_active && (
                          <button
                            style={styles.deactivateBtn}
                            onClick={() => handleDeactivate(u)}
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {lastPage > 1 && (
        <div style={styles.pagination}>
          <button
            style={styles.pageBtn}
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            ← Prev
          </button>
          <span style={{ color: '#475569', fontSize: 13 }}>
            Page {page} of {lastPage}
          </span>
          <button
            style={styles.pageBtn}
            disabled={page >= lastPage}
            onClick={() => setPage(p => Math.min(lastPage, p + 1))}
          >
            Next →
          </button>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <UserModal
          mode={modal.mode}
          user={modal.user}
          roles={roles}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const styles = {
  page: {
    padding: '28px 32px',
    maxWidth: 1200,
    margin: '0 auto',
  },
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  pageTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: '#1e293b',
  },
  pageSubtitle: {
    margin: '4px 0 0',
    fontSize: 13,
    color: '#64748b',
  },
  addBtn: {
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '9px 18px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  filtersRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  filterInput: {
    padding: '8px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 13,
    background: '#fff',
    minWidth: 160,
    flex: 1,
  },
  errorBox: {
    background: '#fee2e2',
    border: '1px solid #fca5a5',
    color: '#991b1b',
    borderRadius: 8,
    padding: '10px 14px',
    marginBottom: 16,
    fontSize: 13,
  },
  tableWrap: {
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  thead: {
    background: '#f8fafc',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: 12,
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #e2e8f0',
  },
  tr: {
    borderBottom: '1px solid #f1f5f9',
  },
  td: {
    padding: '14px 16px',
    fontSize: 13,
    color: '#374151',
    verticalAlign: 'middle',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: '#4f46e5',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
    fontWeight: 700,
    flexShrink: 0,
  },
  editBtn: {
    background: '#eff6ff',
    color: '#1d4ed8',
    border: '1px solid #bfdbfe',
    borderRadius: 6,
    padding: '4px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  deactivateBtn: {
    background: '#fff7ed',
    color: '#c2410c',
    border: '1px solid #fed7aa',
    borderRadius: 6,
    padding: '4px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    justifyContent: 'center',
    marginTop: 20,
  },
  pageBtn: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    color: '#374151',
  },
  // Modal
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modal: {
    background: '#fff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 480,
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid #e2e8f0',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    cursor: 'pointer',
    color: '#94a3b8',
    lineHeight: 1,
  },
  formBody: {
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: '#475569',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    padding: '9px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
    background: '#fff',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    padding: '16px 24px',
    borderTop: '1px solid #e2e8f0',
    background: '#f8fafc',
  },
  cancelBtn: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '9px 20px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    color: '#374151',
  },
  saveBtn: {
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '9px 20px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

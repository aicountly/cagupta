import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getContacts, deleteContact, requestContactDeleteOtp } from '../services/contactService';
import StatusBadge from '../components/common/StatusBadge';

const NO_DELETE_CONTACT_HINT =
  'You do not have permission to delete contacts. Client edit permission is required.';

export default function Contacts() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canDeleteContact = hasPermission('clients.edit');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [orgModalContact, setOrgModalContact] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteOtpSending, setDeleteOtpSending] = useState(false);
  const [deleteOtpSent, setDeleteOtpSent] = useState(false);
  const [deleteOtp, setDeleteOtp] = useState('');
  const [deleteModalErr, setDeleteModalErr] = useState('');
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    getContacts()
      .then(data => { setContacts(data); setError(''); })
      .catch(err => setError(err.message || 'Failed to load contacts.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!orgModalContact) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOrgModalContact(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [orgModalContact]);

  useEffect(() => {
    if (!deleteTarget) return;
    setDeleteOtpSent(false);
    setDeleteOtp('');
    setDeleteModalErr('');
  }, [deleteTarget?.id]);

  useEffect(() => {
    if (!deleteTarget) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !deleteSubmitting && !deleteOtpSending) setDeleteTarget(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteTarget, deleteSubmitting, deleteOtpSending]);

  useEffect(() => {
    if (loading) return;
    // #region agent log
    fetch('http://127.0.0.1:7680/ingest/98bef636-b446-415e-8bd6-5036c92e86f1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2098b5' }, body: JSON.stringify({ sessionId: '2098b5', location: 'Contacts.jsx:tableReady', message: 'Contacts list ready', data: { rowCount: contacts.length, canDeleteContact, deleteControlExpected: true }, timestamp: Date.now(), hypothesisId: 'H1' }) }).catch(() => {});
    // #endregion
  }, [loading, contacts.length, canDeleteContact]);

  async function sendDeleteOtp() {
    const c = deleteTarget;
    if (!c) return;
    setDeleteModalErr('');
    setDeleteOtpSending(true);
    try {
      await requestContactDeleteOtp(c.id);
      setDeleteOtpSent(true);
    } catch (e) {
      setDeleteModalErr(e.message || 'Failed to send OTP.');
    } finally {
      setDeleteOtpSending(false);
    }
  }

  async function confirmDeleteContact() {
    const c = deleteTarget;
    if (!c) return;
    if (!deleteOtp.trim()) {
      setDeleteModalErr('Enter the superadmin OTP.');
      return;
    }
    setDeleteModalErr('');
    setDeleteSubmitting(true);
    // #region agent log
    fetch('http://127.0.0.1:7680/ingest/98bef636-b446-415e-8bd6-5036c92e86f1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2098b5' }, body: JSON.stringify({ sessionId: '2098b5', location: 'Contacts.jsx:confirmDeleteContact', message: 'Delete confirm invoked', data: { contactId: c.id }, timestamp: Date.now(), hypothesisId: 'H3' }) }).catch(() => {});
    // #endregion
    try {
      await deleteContact(c.id, { superadminOtp: deleteOtp.trim() });
      setContacts(prev => prev.filter(x => x.id !== c.id));
      if (selected?.id === c.id) setSelected(null);
      if (orgModalContact?.id === c.id) setOrgModalContact(null);
      setDeleteTarget(null);
      // #region agent log
      fetch('http://127.0.0.1:7680/ingest/98bef636-b446-415e-8bd6-5036c92e86f1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2098b5' }, body: JSON.stringify({ sessionId: '2098b5', location: 'Contacts.jsx:confirmDeleteContact', message: 'Delete completed', data: { contactId: c.id }, timestamp: Date.now(), runId: 'post-fix', hypothesisId: 'H3' }) }).catch(() => {});
      // #endregion
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7680/ingest/98bef636-b446-415e-8bd6-5036c92e86f1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2098b5' }, body: JSON.stringify({ sessionId: '2098b5', location: 'Contacts.jsx:confirmDeleteContact', message: 'Delete failed', data: { contactId: c.id, err: String(err?.message || err) }, timestamp: Date.now(), hypothesisId: 'H3' }) }).catch(() => {});
      // #endregion
      alert(err.message || 'Failed to delete contact.');
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const filtered = contacts.filter(c => {
    const matchSearch =
      c.displayName.toLowerCase().includes(search.toLowerCase()) ||
      (c.mobile || '').includes(search) ||
      (c.pan || '').includes(search.toUpperCase()) ||
      (c.clientCode || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.groupName || '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || c.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div style={{ padding: 24, background: '#F6F7FB', minHeight: '100%' }}>
      {error && <div style={{ color: '#dc2626', marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 8, fontSize: 13 }}>{error}</div>}
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <input
          placeholder="🔍 Search contact by name, mobile, PAN, code, group…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={inputStyle}
        />
        <select value={filter} onChange={e => setFilter(e.target.value)} style={selectStyle}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="prospect">Prospect</option>
        </select>
        <button style={btnPrimary} onClick={() => navigate('/clients/contacts/new')}>➕ Add Contact</button>
      </div>

      {/* Table */}
      <div style={cardStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {['Code', 'Name', 'Organisation', 'Group', 'Mobile', 'PAN', 'Manager', 'City', 'Status', 'Actions'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Loading contacts…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No contacts found.</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} style={trStyle}>
                <td style={tdStyle}>
                  <code style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{c.clientCode}</code>
                </td>
                <td style={{ ...tdStyle, fontWeight: 600, color: '#F37920' }}>
                  {c.displayName}{c.reference && <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 4 }}>({c.reference})</span>}
                </td>
                <td style={tdStyle}>
                  {c.linkedOrgsCount > 1 ? (
                    <button
                      type="button"
                      style={orgEyeBtnStyle}
                      title={`View ${c.linkedOrgsCount} linked organizations`}
                      aria-label={`View ${c.linkedOrgsCount} linked organizations`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOrgModalContact(c);
                      }}
                    >
                      👁️
                    </button>
                  ) : c.organisation ? (
                    <span style={orgChipStyle}>{c.organisation}</span>
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                  )}
                </td>
                <td style={tdStyle}>
                  {c.groupName ? (
                    <span style={groupChipStyle}>{c.groupName}</span>
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                  )}
                </td>
                <td style={tdStyle}>{c.mobile}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{c.pan || '—'}</td>
                <td style={tdStyle}>{c.assignedManager}</td>
                <td style={tdStyle}>{c.city}</td>
                <td style={tdStyle}><StatusBadge status={c.status} /></td>
                <td style={tdStyle}>
                  <button type="button" style={iconBtn} title="View" onClick={() => setSelected(c)}>👁️</button>
                  <button type="button" style={iconBtn} title="Edit" onClick={() => navigate(`/clients/contacts/${c.id}/edit`)}>✏️</button>
                  {canDeleteContact ? (
                    <button
                      type="button"
                      style={iconBtnDanger}
                      title="Delete contact"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(c);
                      }}
                    >
                      🗑️
                    </button>
                  ) : (
                    <button
                      type="button"
                      style={iconBtnDisabled}
                      title={NO_DELETE_CONTACT_HINT}
                      disabled
                      aria-label={NO_DELETE_CONTACT_HINT}
                    >
                      🗑️
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '12px 16px', fontSize: 12, color: '#64748b', borderTop: '1px solid #f1f5f9' }}>
          Showing {filtered.length} of {contacts.length} contacts
        </div>
      </div>
      {orgModalContact && (
        <div
          style={modalOverlayStyle}
          role="presentation"
          onClick={() => setOrgModalContact(null)}
        >
          <div
            style={modalBoxStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby="org-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 id="org-modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                Linked organizations
              </h3>
              <button
                type="button"
                onClick={() => setOrgModalContact(null)}
                style={modalCloseBtnStyle}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
              {orgModalContact.displayName}
            </p>
            <ul style={modalListStyle}>
              {(orgModalContact.linkedOrgNames || []).map((name, i) => (
                <li key={`${name}-${i}`} style={modalListItemStyle}>
                  <span style={orgChipStyle}>{name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {/* Side panel */}
      {selected && (
        <div style={panel}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
            <h3 style={{ margin:0, fontSize:16, fontWeight:700 }}>{selected.displayName}</h3>
            <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer' }}>✕</button>
          </div>
          {[
            ['Contact Code', selected.clientCode],
            ['Reference', selected.reference || '—'],
            ['Organisation', selected.organisation || (selected.linkedOrgsCount > 0
              ? `${selected.linkedOrgsCount} organization${selected.linkedOrgsCount > 1 ? 's' : ''}`
              : '—')],
            ['Group', selected.groupName ? <span key="g" style={groupChipStyle}>{selected.groupName}</span> : '—'],
            ['Mobile', selected.mobile],
            ['Email', selected.email || '—'],
            ['PAN', selected.pan || '—'],
            ['City', selected.city || '—'],
            ['Assigned Manager', selected.assignedManager],
            ['Status', <StatusBadge key="s" status={selected.status} />],
          ].map(([k, v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f1f5f9', fontSize:13 }}>
              <span style={{ color:'#64748b', fontWeight:600 }}>{k}</span>
              <span style={{ color:'#1e293b' }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop:16, display:'flex', flexWrap:'wrap', gap:8 }}>
            <button type="button" style={btnPrimary} onClick={() => navigate(`/clients/contacts/${selected.id}/edit`)}>✏️ Edit</button>
            {canDeleteContact ? (
              <button type="button" style={btnDeleteOutline} onClick={() => setDeleteTarget(selected)}>🗑️ Delete</button>
            ) : (
              <button type="button" style={btnDeleteDisabled} title={NO_DELETE_CONTACT_HINT} disabled>
                🗑️ Delete
              </button>
            )}
            <button type="button" style={btnOutline} onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}
      {deleteTarget && (
        <div style={deleteOverlayStyle} role="presentation" onClick={() => !deleteSubmitting && !deleteOtpSending && setDeleteTarget(null)}>
          <div
            style={deleteModalWideStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-contact-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={deleteModalHeaderStyle}>
              <span id="delete-contact-title" style={{ fontSize: 15, fontWeight: 700, color: '#b91c1c' }}>Delete contact</span>
              <button type="button" onClick={() => !deleteSubmitting && !deleteOtpSending && setDeleteTarget(null)} style={deleteCloseBtnStyle}>✕</button>
            </div>
            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: '#334155', margin: 0 }}>
                Permanently delete <strong>{deleteTarget.displayName}</strong> ({deleteTarget.clientCode})? This cannot be undone.
              </p>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                Request a superadmin OTP, then enter it to confirm.
              </p>
              {deleteModalErr && <div style={{ color: '#dc2626', fontSize: 13 }}>{deleteModalErr}</div>}
              <button
                type="button"
                style={deleteBtnSecondary}
                disabled={deleteOtpSending || deleteSubmitting}
                onClick={sendDeleteOtp}
              >
                {deleteOtpSending && !deleteOtpSent ? 'Sending…' : 'Request superadmin OTP'}
              </button>
              {deleteOtpSent && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>Code sent</span>}
              <label style={deleteLabelStyle}>
                Superadmin OTP *
                <input
                  type="text"
                  style={deleteInputStyle}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={deleteOtp}
                  onChange={(e) => setDeleteOtp(e.target.value.replace(/\s/g, ''))}
                />
              </label>
            </div>
            <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => !deleteSubmitting && !deleteOtpSending && setDeleteTarget(null)} style={deleteBtnSecondary}>Cancel</button>
              <button
                type="button"
                disabled={deleteSubmitting || deleteOtpSending}
                onClick={confirmDeleteContact}
                style={{ ...deleteBtnPrimary, background: '#b91c1c' }}
              >
                {deleteSubmitting ? 'Deleting…' : 'Delete contact'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle = { background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.06)', border: '1px solid #E6E8F0', overflow: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = { textAlign: 'left', padding: '10px 12px', color: '#64748b', fontWeight: 600, fontSize: 11, borderBottom: '1px solid #F0F2F8', whiteSpace: 'nowrap', background: '#F8FAFC', textTransform: 'uppercase', letterSpacing: '0.04em' };
const tdStyle = { padding: '10px 12px', color: '#334155', verticalAlign: 'middle', whiteSpace: 'nowrap', borderBottom: '1px solid #F6F7FB' };
const trStyle = { cursor: 'default', transition: 'background 0.1s' };
const inputStyle = { flex: 1, padding: '8px 12px', border: '1px solid #E6E8F0', borderRadius: 8, fontSize: 13, outline: 'none', background: '#F6F7FB' };
const selectStyle = { padding: '8px 12px', border: '1px solid #E6E8F0', borderRadius: 8, fontSize: 13, background: '#fff' };
const btnPrimary = { padding: '8px 16px', background: '#F37920', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' };
const btnOutline = { padding: '8px 12px', background: '#fff', color: '#F37920', border: '1px solid #F37920', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: '2px 4px' };
const iconBtnDanger = { ...iconBtn, color: '#b91c1c' };
const iconBtnDisabled = { ...iconBtn, opacity: 0.45, cursor: 'not-allowed' };
const btnDeleteOutline = { padding: '8px 12px', background: '#fff', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const btnDeleteDisabled = { ...btnDeleteOutline, opacity: 0.5, cursor: 'not-allowed' };
const deleteOverlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const deleteModalStyle = { background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', minWidth: 360, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto' };
const deleteModalWideStyle = { ...deleteModalStyle, minWidth: 400, maxWidth: 520 };
const deleteLabelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' };
const deleteInputStyle = { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, color: '#334155', outline: 'none' };
const deleteModalHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #f1f5f9' };
const deleteCloseBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#64748b', padding: '2px 6px', borderRadius: 4 };
const deleteBtnPrimary = { padding: '8px 16px', background: '#F37920', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const deleteBtnSecondary = { padding: '8px 16px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const orgChipStyle = { display: 'inline-block', background: '#EFF6FF', color: '#3B82F6', borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 600 };
const groupChipStyle = { display: 'inline-block', background: '#FFF7ED', color: '#C2410C', borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 600 };
const orgEyeBtnStyle = { ...iconBtn, verticalAlign: 'middle' };
const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
  padding: 16,
};
const modalBoxStyle = {
  background: '#fff',
  borderRadius: 14,
  boxShadow: '0 20px 50px rgba(0,0,0,.15)',
  border: '1px solid #E6E8F0',
  padding: 24,
  maxWidth: 420,
  width: '100%',
  maxHeight: 'min(70vh, 480px)',
  overflowY: 'auto',
};
const modalCloseBtnStyle = { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b', lineHeight: 1, padding: 4 };
const modalListStyle = { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 };
const modalListItemStyle = { margin: 0 };
const panel = { position:'fixed', right:0, top:56, width:360, height:'calc(100vh - 56px)', background:'#fff', boxShadow:'-4px 0 20px rgba(0,0,0,.12)', padding:24, overflowY:'auto', zIndex:100 };

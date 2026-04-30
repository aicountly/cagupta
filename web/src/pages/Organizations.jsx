import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  getOrganizationsWithMeta,
  requestOrganizationDeleteOtp,
  deleteOrganization,
} from '../services/organizationService';
import StatusBadge from '../components/common/StatusBadge';
import ListPaginationBar from '../components/common/ListPaginationBar';

const PER_PAGE = 100;

const NO_DELETE_ORG_HINT =
  'You do not have permission to delete organizations. Please contact an Admin or Super Admin.';

function DeleteOrganizationModal({ org, onClose, onDeleted }) {
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendOtp() {
    setErr('');
    setBusy(true);
    try {
      await requestOrganizationDeleteOtp(org.id);
      setOtpSent(true);
    } catch (e) {
      setErr(e.message || 'Failed to send OTP.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!otp.trim()) {
      setErr('Enter the superadmin OTP.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await deleteOrganization(org.id, { superadminOtp: otp.trim() });
      onDeleted(org.id);
      onClose();
    } catch (e) {
      setErr(e.message || 'Delete failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={deleteOverlayStyle}>
      <div style={deleteModalStyle}>
        <div style={deleteModalHeaderStyle}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#b91c1c' }}>Delete organization</span>
          <button type="button" onClick={onClose} style={deleteCloseBtnStyle}>✕</button>
        </div>
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 13, color: '#334155', margin: 0 }}>
            Permanently delete <strong>{org.displayName}</strong> ({org.clientCode})? This cannot be undone.
          </p>
          <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
            Request a superadmin OTP, then enter it to confirm.
          </p>
          {err && <div style={{ color: '#dc2626', fontSize: 13 }}>{err}</div>}
          <button type="button" style={deleteBtnSecondary} disabled={busy} onClick={sendOtp}>
            {busy && !otpSent ? 'Sending…' : 'Request superadmin OTP'}
          </button>
          {otpSent && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>Code sent</span>}
          <label style={deleteLabelStyle}>
            Superadmin OTP *
            <input
              type="text"
              style={deleteInputStyle}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\s/g, ''))}
            />
          </label>
        </div>
        <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose} style={deleteBtnSecondary}>Cancel</button>
          <button
            type="button"
            disabled={busy}
            onClick={confirmDelete}
            style={{ ...deleteBtnPrimary, background: '#b91c1c' }}
          >
            Delete organization
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Organizations() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const role = session?.user?.role ?? '';
  const isOrgDeleteRole = role === 'super_admin' || role === 'admin';

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [serverTotal, setServerTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [deleteOrg, setDeleteOrg] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Debounce search input — also resets to page 1
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Server fetch — reruns whenever page, debounced search, or filter changes
  useEffect(() => {
    setLoading(true);
    getOrganizationsWithMeta({ page, perPage: PER_PAGE, search, status: filter })
      .then(({ orgs: data, total, lastPage }) => {
        setOrgs(data);
        setServerTotal(total);
        setTotalPages(Math.max(1, lastPage));
        setError('');
      })
      .catch(err => setError(err.message || 'Failed to load organizations.'))
      .finally(() => setLoading(false));
  }, [search, filter, page]);

  function handleFilterChange(val) {
    setFilter(val);
    setPage(1);
  }

  return (
    <div style={{ padding: 24, background: '#F6F7FB', minHeight: '100%' }}>
      {error && <div style={{ color: '#dc2626', marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 8, fontSize: 13 }}>{error}</div>}
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <input
          placeholder="🔍 Search by name, GSTIN, PAN, CIN, email…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          style={inputStyle}
        />
        <select value={filter} onChange={e => handleFilterChange(e.target.value)} style={selectStyle}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="prospect">Prospect</option>
        </select>
        <button style={btnPrimary} onClick={() => navigate('/clients/organizations/new')}>➕ Add Organization</button>
      </div>

      {/* Table */}
      <div style={cardStyle}>
        <ListPaginationBar
          placement="top"
          total={serverTotal}
          page={page}
          totalPages={totalPages}
          perPage={PER_PAGE}
          loading={loading}
          setPage={setPage}
          entityPlural="organizations"
        />
        <table style={tableStyle}>
          <thead>
            <tr>
              {['Code', 'Name', 'Group', 'Constitution', 'PAN', 'GSTIN', 'Primary Contact', 'Manager', 'City', 'Status', 'Actions'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Loading organizations…</td></tr>
            ) : orgs.length === 0 ? (
              <tr><td colSpan={11} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No organizations found.</td></tr>
            ) : orgs.map(o => (
              <tr key={o.id} style={trStyle} onClick={() => setSelected(o)}>
                <td style={tdStyle}>
                  <code style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{o.clientCode}</code>
                </td>
                <td style={{ ...tdStyle, fontWeight: 600, color: '#F37920' }}>
                  {o.displayName}{o.reference && <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 4 }}>({o.reference})</span>}
                </td>
                <td style={tdStyle}>
                  {o.groupName ? (
                    <span style={groupChipStyle}>{o.groupName}</span>
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                  )}
                </td>
                <td style={tdStyle}>{o.constitution}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{o.pan || '—'}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>{o.gstin || '—'}</td>
                <td style={tdStyle}>{o.primaryContact || '—'}</td>
                <td style={tdStyle}>{o.assignedManager}</td>
                <td style={tdStyle}>{o.city}</td>
                <td style={tdStyle}><StatusBadge status={o.status} /></td>
                <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                  <button type="button" style={iconBtn} title="View" onClick={() => setSelected(o)}>👁️</button>
                  <button type="button" style={iconBtn} title="Edit" onClick={() => navigate(`/clients/organizations/${o.id}/edit`)}>✏️</button>
                  {isOrgDeleteRole ? (
                    <button type="button" style={iconBtnDanger} title="Delete" onClick={() => setDeleteOrg(o)}>🗑️</button>
                  ) : (
                    <button type="button" style={iconBtnDisabled} title={NO_DELETE_ORG_HINT} disabled aria-label={NO_DELETE_ORG_HINT}>
                      🗑️
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ListPaginationBar
          placement="bottom"
          total={serverTotal}
          page={page}
          totalPages={totalPages}
          perPage={PER_PAGE}
          loading={loading}
          setPage={setPage}
          entityPlural="organizations"
        />
      </div>
      {/* Side panel */}
      {selected && (
        <div style={panel}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
            <h3 style={{ margin:0, fontSize:16, fontWeight:700 }}>{selected.displayName}</h3>
            <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer' }}>✕</button>
          </div>
          {[
            ['Org Code', selected.clientCode],
            ['Constitution', selected.constitution || '—'],
            ['PAN', selected.pan || '—'],
            ['GSTIN', selected.gstin || '—'],
            ['CIN', selected.cin || '—'],
            ['Reference', selected.reference || '—'],
            ['Group', selected.groupName ? <span key="g" style={groupChipStyle}>{selected.groupName}</span> : '—'],
            ['Primary Contact', selected.primaryContact || '—'],
            ['Email', selected.email || '—'],
            ['Phone', selected.phone || '—'],
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
            <button type="button" style={btnPrimary} onClick={() => navigate(`/clients/organizations/${selected.id}/edit`)}>✏️ Edit</button>
            {isOrgDeleteRole ? (
              <button type="button" style={btnDeleteOutline} onClick={() => setDeleteOrg(selected)}>🗑️ Delete</button>
            ) : (
              <button type="button" style={btnDeleteDisabled} title={NO_DELETE_ORG_HINT} disabled>
                🗑️ Delete
              </button>
            )}
            <button type="button" style={btnOutline} onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}
      {deleteOrg && (
        <DeleteOrganizationModal
          org={deleteOrg}
          onClose={() => setDeleteOrg(null)}
          onDeleted={(id) => {
            setOrgs(prev => prev.filter(x => x.id !== id));
            if (selected?.id === id) setSelected(null);
          }}
        />
      )}
    </div>
  );
}

const cardStyle = { background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.06)', border: '1px solid #E6E8F0', overflow: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = { textAlign: 'left', padding: '10px 12px', color: '#64748b', fontWeight: 600, fontSize: 11, borderBottom: '1px solid #F0F2F8', whiteSpace: 'nowrap', background: '#F8FAFC', textTransform: 'uppercase', letterSpacing: '0.04em' };
const tdStyle = { padding: '10px 12px', color: '#334155', verticalAlign: 'middle', whiteSpace: 'nowrap', borderBottom: '1px solid #F6F7FB' };
const trStyle = { cursor: 'pointer', transition: 'background 0.15s' };
const inputStyle = { flex: 1, padding: '8px 12px', border: '1px solid #E6E8F0', borderRadius: 8, fontSize: 13, outline: 'none', background: '#F6F7FB' };
const selectStyle = { padding: '8px 12px', border: '1px solid #E6E8F0', borderRadius: 8, fontSize: 13, background: '#fff' };
const btnPrimary = { padding: '8px 16px', background: '#F37920', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' };
const btnOutline = { padding: '8px 12px', background: '#fff', color: '#F37920', border: '1px solid #F37920', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: '2px 4px' };
const iconBtnDanger = { ...iconBtn, color: '#b91c1c' };
const iconBtnDisabled = { ...iconBtn, opacity: 0.45, cursor: 'not-allowed' };
const btnDeleteOutline = { padding: '8px 12px', background: '#fff', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const btnDeleteDisabled = { ...btnDeleteOutline, opacity: 0.5, cursor: 'not-allowed' };
const groupChipStyle = { display: 'inline-block', background: '#FFF7ED', color: '#C2410C', borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 600 };
const panel = { position:'fixed', right:0, top:56, width:360, height:'calc(100vh - 56px)', background:'#fff', boxShadow:'-4px 0 20px rgba(0,0,0,.12)', padding:24, overflowY:'auto', zIndex:100 };
const deleteOverlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const deleteModalStyle = { background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', minWidth: 400, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto' };
const deleteModalHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #f1f5f9' };
const deleteCloseBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#64748b', padding: '2px 6px', borderRadius: 4 };
const deleteBtnPrimary = { padding: '8px 16px', background: '#F37920', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const deleteBtnSecondary = { padding: '8px 16px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const deleteLabelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' };
const deleteInputStyle = { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, color: '#334155', outline: 'none' };

import { useState, useEffect, useMemo } from 'react';
import { getCredentialsWithMeta, createCredential, updateCredential, deleteCredential } from '../services/credentialService';
import { fetchPortalTypes } from '../services/portalTypeService';
import EntitySearchDropdown from '../../../components/common/EntitySearchDropdown';
import DestructiveConfirmModal from '../../../components/common/DestructiveConfirmModal';
import ListPaginationBar from '../../../components/common/ListPaginationBar';

const PER_PAGE = 100;

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'complete', label: 'Complete' },
  { value: 'missing_password', label: 'Missing password' },
  { value: 'missing_username', label: 'Missing username' },
];

function CredentialModal({ onClose, onSave, initial }) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    clientId:      initial?.clientId      || '',
    clientName:    initial?.clientName    || '',
    entityType:    initial?.entityType    || 'contact',
    portalName:    initial?.portalName    || '',
    portalUrl:     initial?.portalUrl     || '',
    username:      initial?.username      || '',
    password:      '',
    notes:         initial?.notes         || '',
  });
  const [portalTypes, setPortalTypes] = useState([]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    fetchPortalTypes().then(setPortalTypes).catch(() => {});
  }, []);

  function handlePortalSelect(name) {
    const portal = portalTypes.find(p => p.name === name);
    setForm(f => ({ ...f, portalName: name, portalUrl: portal?.url || f.portalUrl }));
  }

  const handleSave = () => {
    if (!form.portalName.trim()) return;
    const payload = { ...form };
    if (isEdit && !payload.password) delete payload.password;
    onSave(payload);
    onClose();
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={modalHeaderStyle}>
          <span style={{ fontSize:15, fontWeight:700 }}>{isEdit ? '✏️ Edit Credential' : '➕ Add Credential'}</span>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
          <label style={labelStyle}>
            Client
            <EntitySearchDropdown
              value={form.clientId}
              displayValue={form.clientName}
              entityType={form.entityType}
              onChange={c => setForm(f => ({ ...f, clientId: c.id, clientName: c.displayName, entityType: c.entityType }))}
              placeholder="Search contact or organization…"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Portal Name *
            <select
              style={inputStyle}
              value={form.portalName}
              onChange={e => handlePortalSelect(e.target.value)}
            >
              <option value="">— Select Portal —</option>
              {portalTypes.map(p => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Portal URL <span style={{ fontWeight:400, color:'#94a3b8', fontSize:11 }}>(auto-filled · editable)</span>
            <input
              type="url"
              style={inputStyle}
              placeholder="https://..."
              value={form.portalUrl}
              onChange={e => set('portalUrl', e.target.value)}
            />
          </label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <label style={labelStyle}>
              Username
              <input type="text" style={inputStyle} placeholder="Username / PAN / Email" value={form.username} onChange={e=>set('username',e.target.value)} />
            </label>
            <label style={labelStyle}>
              Password {isEdit && <span style={{ fontWeight:400, color:'#94a3b8' }}>(leave blank to keep)</span>}
              <input type="password" style={inputStyle} placeholder="Password" value={form.password} onChange={e=>set('password',e.target.value)} />
            </label>
          </div>
          <label style={labelStyle}>
            Notes
            <input type="text" style={inputStyle} placeholder="Optional notes" value={form.notes} onChange={e=>set('notes',e.target.value)} />
          </label>
        </div>
        <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10 }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button onClick={handleSave} style={btnPrimary}>{isEdit ? 'Save Changes' : 'Add Credential'}</button>
        </div>
      </div>
    </div>
  );
}

export default function Credentials() {
  const [clientFilterId, setClientFilterId]       = useState('');
  const [clientFilterName, setClientFilterName]   = useState('');
  const [clientFilterType, setClientFilterType]   = useState('contact');
  const [portalFilter, setPortalFilter]           = useState('');
  const [statusFilter, setStatusFilter]           = useState('all');
  const [page, setPage]                           = useState(1);
  const [totalPages, setTotalPages]               = useState(1);
  const [serverTotal, setServerTotal]             = useState(0);
  const [portalTypes, setPortalTypes]             = useState([]);
  const [revealed, setRevealed]                 = useState({});
  const [credentials, setCredentials]           = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [error, setError]                       = useState('');
  const [showAddModal, setShowAddModal]         = useState(false);
  const [editCredential, setEditCredential]     = useState(null);
  const [deleteCredentialMeta, setDeleteCredentialMeta] = useState(null);
  const [deleteCredentialBusy, setDeleteCredentialBusy] = useState(false);
  const [deleteCredentialErr, setDeleteCredentialErr] = useState('');

  useEffect(() => {
    fetchPortalTypes().then(setPortalTypes).catch(() => {});
  }, []);

  const fetchParams = useMemo(() => ({
    page,
    perPage: PER_PAGE,
    clientId: clientFilterType === 'contact' && clientFilterId ? clientFilterId : '',
    organizationId: clientFilterType === 'organization' && clientFilterId ? clientFilterId : '',
    portalName: portalFilter,
    status: statusFilter,
  }), [page, clientFilterId, clientFilterType, portalFilter, statusFilter]);

  function reloadCredentials(params = fetchParams) {
    setLoading(true);
    return getCredentialsWithMeta(params)
      .then(({ credentials: data, total, lastPage }) => {
        setCredentials(data);
        setServerTotal(total);
        setTotalPages(Math.max(1, lastPage));
        setError('');
      })
      .catch(err => setError(err.message || 'Failed to load credentials.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setLoading(true);
    getCredentialsWithMeta(fetchParams)
      .then(({ credentials: data, total, lastPage }) => {
        setCredentials(data);
        setServerTotal(total);
        setTotalPages(Math.max(1, lastPage));
        setError('');
      })
      .catch(err => setError(err.message || 'Failed to load credentials.'))
      .finally(() => setLoading(false));
  }, [fetchParams]);

  const portalOptions = useMemo(() => (
    portalTypes.map(p => p.name).filter(Boolean).sort((a, b) => a.localeCompare(b))
  ), [portalTypes]);

  const hasActiveFilters = Boolean(clientFilterId) || Boolean(portalFilter) || statusFilter !== 'all';

  function clearAllFilters() {
    setClientFilterId('');
    setClientFilterName('');
    setClientFilterType('contact');
    setPortalFilter('');
    setStatusFilter('all');
    setPage(1);
  }

  function handleAdd(payload) {
    createCredential(payload)
      .then(() => {
        if (page === 1) {
          reloadCredentials({ ...fetchParams, page: 1 });
        } else {
          setPage(1);
        }
      })
      .catch(() => {});
  }

  function handleEdit(payload) {
    if (!editCredential) return;
    updateCredential(editCredential.id, payload)
      .then(() => reloadCredentials())
      .catch(() => {});
  }

  async function executeDeleteCredential() {
    const id = deleteCredentialMeta?.id;
    if (!id) return;
    setDeleteCredentialBusy(true);
    setDeleteCredentialErr('');
    try {
      await deleteCredential(id);
      const remainingOnPage = credentials.length - 1;
      if (remainingOnPage === 0 && page > 1) {
        setPage(p => p - 1);
      } else {
        await reloadCredentials();
      }
      setDeleteCredentialMeta(null);
    } catch (e) {
      setDeleteCredentialErr(e.message || 'Failed to delete.');
    } finally {
      setDeleteCredentialBusy(false);
    }
  }

  return (
    <div style={{ padding:24 }}>
      {showAddModal && (
        <CredentialModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAdd}
        />
      )}
      {editCredential && (
        <CredentialModal
          initial={editCredential}
          onClose={() => setEditCredential(null)}
          onSave={handleEdit}
        />
      )}

      {deleteCredentialMeta && (
        <DestructiveConfirmModal
          open
          title="Delete stored credential?"
          error={deleteCredentialErr}
          busy={deleteCredentialBusy}
          confirmLabel="Delete credential"
          onClose={() => {
            if (deleteCredentialBusy) return;
            setDeleteCredentialErr('');
            setDeleteCredentialMeta(null);
          }}
          onConfirm={executeDeleteCredential}
        >
          <p style={{ margin: '0 0 8px' }}>
            Remove login for <strong>{deleteCredentialMeta.portalName}</strong> ({deleteCredentialMeta.clientName})?
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
            The encrypted password bundle will be removed from the vault. This cannot be undone.
          </p>
        </DestructiveConfirmModal>
      )}

      <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:8, padding:'12px 16px', marginBottom:20, fontSize:13, color:'#78350f' }}>
        🔒 <strong>Credentials Vault</strong> — All passwords are stored AES-256 encrypted. Access is logged. Handle with care.
      </div>

      {error && (
        <div style={{ color: '#dc2626', marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display:'flex', gap:12, marginBottom:20, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ flex:'0 0 280px', minWidth:220 }}>
          <EntitySearchDropdown
            value={clientFilterId}
            displayValue={clientFilterName}
            entityType={clientFilterType}
            onChange={c => {
              setClientFilterId(String(c.id));
              setClientFilterName(c.displayName);
              setClientFilterType(c.entityType);
              setPage(1);
            }}
            onAllClients={() => {
              setClientFilterId('');
              setClientFilterName('');
              setClientFilterType('contact');
              setPage(1);
            }}
            allowAll
            placeholder="Filter by contact or organization…"
            style={{ ...selectStyle, width:'100%' }}
          />
        </div>
        <select
          value={portalFilter}
          onChange={e => { setPortalFilter(e.target.value); setPage(1); }}
          style={{ ...selectStyle, minWidth:180 }}
          aria-label="Filter by portal"
        >
          <option value="">All Portals</option>
          {portalOptions.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ ...selectStyle, minWidth:160 }}
          aria-label="Filter by status"
        >
          {STATUS_FILTER_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {hasActiveFilters && (
          <button
            type="button"
            style={{ ...btnSecondary, fontSize:12, padding:'6px 10px' }}
            onClick={clearAllFilters}
          >
            ✕ Clear filters
          </button>
        )}
        <button type="button" style={{ ...btnPrimary, marginLeft:'auto' }} onClick={() => setShowAddModal(true)}>
          ➕ Add Credential
        </button>
      </div>

      <div style={cardStyle}>
        <ListPaginationBar
          placement="top"
          total={serverTotal}
          page={page}
          totalPages={totalPages}
          perPage={PER_PAGE}
          loading={loading}
          setPage={setPage}
          entityPlural="credentials"
        />
        <table style={tableStyle}>
          <thead>
            <tr>{['Client','Portal Name','Portal URL','Username','Password','Last Changed','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding:'24px', textAlign:'center', color:'#64748b' }}>Loading credentials…</td></tr>
            ) : credentials.length === 0 ? (
              <tr><td colSpan={7} style={{ padding:'24px', textAlign:'center', color:'#94a3b8' }}>No credentials found.</td></tr>
            ) : credentials.map(cr=>(
              <tr key={cr.id} style={trStyle}>
                <td style={{ ...tdStyle, fontWeight:600 }}>{cr.clientName}</td>
                <td style={tdStyle}>{cr.portalName}</td>
                <td style={tdStyle}><a href={cr.portalUrl} target="_blank" rel="noreferrer" style={{ color:'#2563eb', fontSize:12 }}>{cr.portalUrl}</a></td>
                <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:12 }}>{cr.username}</td>
                <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:12 }}>
                  {revealed[cr.id]
                    ? <span style={{ color:'#dc2626' }}>{cr.password || '—'}</span>
                    : '••••••••'}
                  <button
                    type="button"
                    onClick={() => setRevealed(r => ({ ...r, [cr.id]: !r[cr.id] }))}
                    style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, marginLeft:6 }}
                    title={revealed[cr.id] ? 'Hide password' : 'Show password'}
                    aria-label={revealed[cr.id] ? 'Hide password' : 'Show password'}
                  >
                    {revealed[cr.id] ? '🙈' : '👁️'}
                  </button>
                </td>
                <td style={tdStyle}>{cr.lastChangedAt}</td>
                <td style={tdStyle}>
                  <button style={iconBtn} title="Edit" onClick={() => setEditCredential(cr)}>✏️</button>
                  <button style={iconBtn} title="Copy Username" onClick={() => navigator.clipboard?.writeText(cr.username || '')}>📋</button>
                  <button style={iconBtn} title="Delete" onClick={() => setDeleteCredentialMeta(cr)}>🗑️</button>
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
          entityPlural="credentials"
        />
      </div>
    </div>
  );
}

const cardStyle = { background:'#fff', borderRadius:10, boxShadow:'0 1px 3px rgba(0,0,0,.08)', overflow:'auto' };
const tableStyle = { width:'100%', borderCollapse:'collapse', fontSize:13 };
const thStyle = { textAlign:'left', padding:'10px 12px', color:'#64748b', fontWeight:600, fontSize:12, borderBottom:'2px solid #f1f5f9', background:'#f8fafc', whiteSpace:'nowrap' };
const tdStyle = { padding:'10px 12px', color:'#334155', verticalAlign:'middle', whiteSpace:'nowrap' };
const trStyle = { borderBottom:'1px solid #f8fafc' };
const selectStyle = { padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, background:'#fff' };
const btnPrimary = { padding:'8px 16px', background:'#2563eb', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600 };
const btnSecondary = { padding:'8px 16px', background:'#f8fafc', color:'#475569', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600 };
const iconBtn = { background:'none', border:'none', cursor:'pointer', fontSize:15, padding:'2px 4px' };
const overlayStyle = { position:'fixed', inset:0, background:'rgba(15,23,42,0.35)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' };
const modalStyle = { background:'#fff', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.18)', minWidth:480, maxWidth:560, width:'100%' };
const modalHeaderStyle = { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 24px', borderBottom:'1px solid #f1f5f9' };
const closeBtnStyle = { background:'none', border:'none', cursor:'pointer', fontSize:16, color:'#64748b', padding:'2px 6px', borderRadius:4 };
const labelStyle = { display:'flex', flexDirection:'column', gap:4, fontSize:12, fontWeight:600, color:'#475569' };
const inputStyle = { padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, color:'#334155', outline:'none' };

import { useState, useEffect } from 'react';
import { getCredentials, createCredential, updateCredential, deleteCredential } from '../services/credentialService';
import ClientSearchDropdown from '../components/common/ClientSearchDropdown';

function CredentialModal({ onClose, onSave, initial }) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    clientId:   initial?.clientId   || '',
    clientName: initial?.clientName || '',
    portalName: initial?.portalName || '',
    portalUrl:  initial?.portalUrl  || '',
    username:   initial?.username   || '',
    password:   '',
    notes:      initial?.notes      || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
            <ClientSearchDropdown
              value={form.clientId}
              displayValue={form.clientName}
              onChange={c => setForm(f => ({ ...f, clientId: c.id, clientName: c.displayName }))}
              placeholder="Search client by name…"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Portal Name *
            <input type="text" style={inputStyle} placeholder="e.g. Income Tax e-Filing" value={form.portalName} onChange={e=>set('portalName',e.target.value)} />
          </label>
          <label style={labelStyle}>
            Portal URL
            <input type="url" style={inputStyle} placeholder="https://..." value={form.portalUrl} onChange={e=>set('portalUrl',e.target.value)} />
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
  const [clientFilterId, setClientFilterId]     = useState('');
  const [clientFilterName, setClientFilterName] = useState('');
  const [revealed, setRevealed]                 = useState({});
  const [credentials, setCredentials]           = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [showAddModal, setShowAddModal]         = useState(false);
  const [editCredential, setEditCredential]     = useState(null);

  useEffect(() => {
    setLoading(true);
    getCredentials().catch(() => [])
      .then(creds => setCredentials(creds))
      .finally(() => setLoading(false));
  }, []);

  const filtered = credentials.filter(c =>
    !clientFilterId || String(c.clientId) === String(clientFilterId)
  );

  function handleAdd(payload) {
    createCredential(payload)
      .then(newCred => setCredentials(prev => [newCred, ...prev]))
      .catch(() => {});
  }

  function handleEdit(payload) {
    if (!editCredential) return;
    updateCredential(editCredential.id, payload)
      .then(updated => setCredentials(prev => prev.map(c => c.id === updated.id ? updated : c)))
      .catch(() => {});
  }

  function handleDelete(id) {
    if (window.confirm('Delete this credential?')) {
      deleteCredential(id)
        .then(() => setCredentials(prev => prev.filter(c => c.id !== id)))
        .catch(() => {});
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

      <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:8, padding:'12px 16px', marginBottom:20, fontSize:13, color:'#78350f' }}>
        🔒 <strong>Credentials Vault</strong> — All passwords are stored AES-256 encrypted. Access is logged. Handle with care.
      </div>

      <div style={{ display:'flex', gap:12, marginBottom:20, alignItems:'center' }}>
        <div style={{ flex:'0 0 280px' }}>
          <ClientSearchDropdown
            value={clientFilterId}
            displayValue={clientFilterName}
            onChange={c => { setClientFilterId(String(c.id)); setClientFilterName(c.displayName); }}
            onAllClients={() => { setClientFilterId(''); setClientFilterName(''); }}
            allowAll
            placeholder="Filter by client…"
            style={{ ...selectStyle, width:'100%' }}
          />
        </div>
        {clientFilterId && (
          <button
            style={{ ...btnSecondary, fontSize:12, padding:'6px 10px' }}
            onClick={() => { setClientFilterId(''); setClientFilterName(''); }}
          >
            ✕ Clear
          </button>
        )}
        <button style={btnPrimary} onClick={() => setShowAddModal(true)}>➕ Add Credential</button>
      </div>

      <div style={cardStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>{['Client','Portal Name','Portal URL','Username','Password','Last Changed','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding:'24px', textAlign:'center', color:'#64748b' }}>Loading credentials…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding:'24px', textAlign:'center', color:'#94a3b8' }}>No credentials found.</td></tr>
            ) : filtered.map(cr=>(
              <tr key={cr.id} style={trStyle}>
                <td style={{ ...tdStyle, fontWeight:600 }}>{cr.clientName}</td>
                <td style={tdStyle}>{cr.portalName}</td>
                <td style={tdStyle}><a href={cr.portalUrl} target="_blank" rel="noreferrer" style={{ color:'#2563eb', fontSize:12 }}>{cr.portalUrl}</a></td>
                <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:12 }}>{cr.username}</td>
                <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:12 }}>
                  {revealed[cr.id] ? <span style={{ color:'#dc2626' }}>••••••••</span> : '••••••••'}
                  <button onClick={()=>setRevealed(r=>({...r,[cr.id]:!r[cr.id]}))} style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, marginLeft:6 }}>
                    {revealed[cr.id]?'🙈':'👁️'}
                  </button>
                </td>
                <td style={tdStyle}>{cr.lastChangedAt}</td>
                <td style={tdStyle}>
                  <button style={iconBtn} title="Edit" onClick={() => setEditCredential(cr)}>✏️</button>
                  <button style={iconBtn} title="Copy Username" onClick={() => navigator.clipboard?.writeText(cr.username || '')}>📋</button>
                  <button style={iconBtn} title="Delete" onClick={() => handleDelete(cr.id)}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

import { useState, useEffect } from 'react';
import { getCredentials, createCredential, deleteCredential } from '../services/credentialService';
import { getContacts } from '../services/contactService';

export default function Credentials() {
  const [clientFilter, setClientFilter] = useState('all');
  const [revealed, setRevealed] = useState({});
  const [credentials, setCredentials] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getCredentials().catch(() => []),
      getContacts().catch(() => []),
    ]).then(([creds, cts]) => {
      setCredentials(creds);
      setClients(cts);
    }).finally(() => setLoading(false));
  }, []);

  const filtered = credentials.filter(c => clientFilter==='all' || String(c.clientId)===String(clientFilter));

  function handleDelete(id) {
    if (window.confirm('Delete this credential?')) {
      deleteCredential(id)
        .then(() => setCredentials(prev => prev.filter(c => c.id !== id)))
        .catch(() => {});
    }
  }

  return (
    <div style={{ padding:24 }}>
      <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:8, padding:'12px 16px', marginBottom:20, fontSize:13, color:'#78350f' }}>
        🔒 <strong>Credentials Vault</strong> — All passwords are stored AES-256 encrypted. Access is logged. Handle with care.
      </div>

      <div style={{ display:'flex', gap:12, marginBottom:20 }}>
        <select value={clientFilter} onChange={e=>setClientFilter(e.target.value)} style={selectStyle}>
          <option value="all">All Clients</option>
          {clients.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}
        </select>
        <button style={btnPrimary}>➕ Add Credential</button>
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
                  <button style={iconBtn} title="Edit">✏️</button>
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
const iconBtn = { background:'none', border:'none', cursor:'pointer', fontSize:15, padding:'2px 4px' };

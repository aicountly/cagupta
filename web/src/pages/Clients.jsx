import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockClients } from '../data/mockData';
import StatusBadge from '../components/common/StatusBadge';

const entityLabels = { individual:'Individual', pvt_ltd:'Pvt Ltd', llp:'LLP', partnership:'Partnership', trust:'Trust', huf:'HUF' };

export default function Clients() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  const filtered = mockClients.filter(c => {
    const matchSearch = c.displayName.toLowerCase().includes(search.toLowerCase()) || c.pan?.includes(search.toUpperCase()) || c.clientCode.includes(search);
    const matchFilter = filter === 'all' || c.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div style={{ padding: 24, background: '#F6F7FB', minHeight: '100%' }}>
      {/* Toolbar */}
      <div style={{ display:'flex', gap:12, marginBottom:20, alignItems:'center' }}>
        <input placeholder="🔍 Search by name, PAN, code…" value={search} onChange={e=>setSearch(e.target.value)} style={inputStyle} />
        <select value={filter} onChange={e=>setFilter(e.target.value)} style={selectStyle}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="prospect">Prospect</option>
        </select>
        <button style={btnPrimary}>➕ Add Client</button>
      </div>

      {/* Table */}
      <div style={cardStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>{['Code','Name','Type','PAN','GSTIN','Manager','City','Status','Actions'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} style={trStyle}>
                <td style={tdStyle}><code style={{ fontSize:11, background:'#f1f5f9', padding:'2px 6px', borderRadius:4 }}>{c.clientCode}</code></td>
                <td style={{ ...tdStyle, fontWeight:600, color:'#F37920', cursor:'pointer' }}>{c.displayName}</td>
                <td style={tdStyle}>{entityLabels[c.entityType] || c.entityType}</td>
                <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:12 }}>{c.pan || '—'}</td>
                <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:11 }}>{c.gstin || '—'}</td>
                <td style={tdStyle}>{c.assignedManager}</td>
                <td style={tdStyle}>{c.city}</td>
                <td style={tdStyle}><StatusBadge status={c.status} /></td>
                <td style={tdStyle}>
                  <button style={iconBtn} title="View" onClick={e => { e.stopPropagation(); setSelected(c); }}>👁️</button>
                  <button style={iconBtn} title="Edit" onClick={e => { e.stopPropagation(); navigate(`/clients/${c.id}/edit`); }}>✏️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding:'12px 16px', fontSize:12, color:'#64748b', borderTop:'1px solid #f1f5f9' }}>
          Showing {filtered.length} of {mockClients.length} clients
        </div>
      </div>

      {/* Side panel */}
      {selected && (
        <div style={panel}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
            <h3 style={{ margin:0, fontSize:16, fontWeight:700 }}>{selected.displayName}</h3>
            <button onClick={()=>setSelected(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer' }}>✕</button>
          </div>
          {[
            ['Client Code', selected.clientCode],
            ['Entity Type', entityLabels[selected.entityType] || selected.entityType],
            ['PAN', selected.pan || '—'],
            ['GSTIN', selected.gstin || '—'],
            ['Email', selected.primaryEmail],
            ['Phone', selected.primaryPhone],
            ['City', selected.city],
            ['Assigned Manager', selected.assignedManager],
            ['Status', <StatusBadge key="s" status={selected.status} />],
            ['Onboarded', selected.onboardingDate],
          ].map(([k, v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f1f5f9', fontSize:13 }}>
              <span style={{ color:'#64748b', fontWeight:600 }}>{k}</span>
              <span style={{ color:'#1e293b' }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop:16, display:'flex', gap:8 }}>
            <button style={btnPrimary}>📋 Services</button>
            <button style={btnOutline}>📂 Documents</button>
            <button style={btnOutline}>💰 Ledger</button>
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle = { background:'#fff', borderRadius:14, boxShadow:'0 1px 4px rgba(0,0,0,.06)', border:'1px solid #E6E8F0', overflow:'auto' };
const tableStyle = { width:'100%', borderCollapse:'collapse', fontSize:13 };
const thStyle = { textAlign:'left', padding:'10px 12px', color:'#64748b', fontWeight:600, fontSize:11, borderBottom:'1px solid #F0F2F8', whiteSpace:'nowrap', background:'#F8FAFC', textTransform:'uppercase', letterSpacing:'0.04em' };
const tdStyle = { padding:'10px 12px', color:'#334155', verticalAlign:'middle', whiteSpace:'nowrap', borderBottom:'1px solid #F6F7FB' };
const trStyle = { cursor:'pointer', transition:'background 0.1s' };
const inputStyle = { flex:1, padding:'8px 12px', border:'1px solid #E6E8F0', borderRadius:8, fontSize:13, outline:'none', background:'#F6F7FB' };
const selectStyle = { padding:'8px 12px', border:'1px solid #E6E8F0', borderRadius:8, fontSize:13, background:'#fff' };
const btnPrimary = { padding:'8px 16px', background:'#F37920', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600, whiteSpace:'nowrap' };
const btnOutline = { padding:'8px 12px', background:'#fff', color:'#F37920', border:'1px solid #F37920', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600 };
const iconBtn = { background:'none', border:'none', cursor:'pointer', fontSize:15, padding:'2px 4px' };
const panel = { position:'fixed', right:0, top:56, width:360, height:'calc(100vh - 56px)', background:'#fff', boxShadow:'-4px 0 20px rgba(0,0,0,.12)', padding:24, overflowY:'auto', zIndex:100 };

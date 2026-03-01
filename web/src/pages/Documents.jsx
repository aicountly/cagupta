import { useState } from 'react';
import { mockDocuments } from '../data/mockData';
import StatusBadge from '../components/common/StatusBadge';

const categoryColors = {
  ITR:{ bg:'#dbeafe', color:'#1d4ed8' }, GST:{ bg:'#dcfce7', color:'#166534' },
  Audit:{ bg:'#ede9fe', color:'#5b21b6' }, 'Bank Statement':{ bg:'#fef3c7', color:'#92400e' },
};

export default function Documents() {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');

  const filtered = mockDocuments.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase()) || d.clientName.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === 'all' || d.category === catFilter;
    return matchSearch && matchCat;
  });

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', gap:12, marginBottom:20 }}>
        <input placeholder="🔍 Search documents…" value={search} onChange={e=>setSearch(e.target.value)} style={inputStyle} />
        <select value={catFilter} onChange={e=>setCatFilter(e.target.value)} style={selectStyle}>
          <option value="all">All Categories</option>
          {['ITR','GST','Audit','Bank Statement'].map(c=><option key={c}>{c}</option>)}
        </select>
        <button style={btnPrimary}>⬆️ Upload Document</button>
      </div>

      {/* Category summary */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        {['ITR','GST','Audit','Bank Statement'].map(cat => {
          const count = mockDocuments.filter(d=>d.category===cat).length;
          const c = categoryColors[cat] || { bg:'#f1f5f9', color:'#64748b' };
          return (
            <button key={cat} onClick={()=>setCatFilter(catFilter===cat?'all':cat)}
              style={{ background: c.bg, color: c.color, border: catFilter===cat?`2px solid ${c.color}`:'2px solid transparent', padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer' }}>
              {cat} ({count})
            </button>
          );
        })}
      </div>

      <div style={cardStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>{['Name','Client','Category','FY','Size','Uploaded By','Date','Shared','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map(d=>{
              const c = categoryColors[d.category] || { bg:'#f1f5f9', color:'#64748b' };
              return (
                <tr key={d.id} style={trStyle}>
                  <td style={{ ...tdStyle, fontWeight:600 }}>📄 {d.name}</td>
                  <td style={tdStyle}>{d.clientName}</td>
                  <td style={tdStyle}><span style={{ background:c.bg, color:c.color, padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:600 }}>{d.category}</span></td>
                  <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:12 }}>{d.financialYear}</td>
                  <td style={tdStyle}>{d.size}</td>
                  <td style={tdStyle}>{d.uploadedBy}</td>
                  <td style={tdStyle}>{d.uploadedAt}</td>
                  <td style={tdStyle}>{d.sharedWithClient ? <span style={{ color:'#16a34a', fontWeight:600 }}>✓ Shared</span> : <span style={{ color:'#94a3b8' }}>—</span>}</td>
                  <td style={tdStyle}>
                    <button style={iconBtn} title="View">👁️</button>
                    <button style={iconBtn} title="Download">⬇️</button>
                    <button style={iconBtn} title="Share">🔗</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding:'12px 16px', fontSize:12, color:'#64748b', borderTop:'1px solid #f1f5f9' }}>
          {filtered.length} documents · Total {mockDocuments.reduce((a,d)=>a,0)} files
        </div>
      </div>
    </div>
  );
}

const cardStyle = { background:'#fff', borderRadius:10, boxShadow:'0 1px 3px rgba(0,0,0,.08)', overflow:'auto' };
const tableStyle = { width:'100%', borderCollapse:'collapse', fontSize:13 };
const thStyle = { textAlign:'left', padding:'10px 12px', color:'#64748b', fontWeight:600, fontSize:12, borderBottom:'2px solid #f1f5f9', background:'#f8fafc', whiteSpace:'nowrap' };
const tdStyle = { padding:'10px 12px', color:'#334155', verticalAlign:'middle', whiteSpace:'nowrap' };
const trStyle = { borderBottom:'1px solid #f8fafc' };
const inputStyle = { flex:1, padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13 };
const selectStyle = { padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, background:'#fff' };
const btnPrimary = { padding:'8px 16px', background:'#2563eb', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600, whiteSpace:'nowrap' };
const iconBtn = { background:'none', border:'none', cursor:'pointer', fontSize:15, padding:'2px 4px' };

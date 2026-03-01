import { useState } from 'react';
import StatusBadge from '../components/common/StatusBadge';

const gstRegister = [
  { client:'Sunita Enterprises Pvt Ltd', gstin:'27AACCS5678D1Z3', returnType:'GSTR-3B', period:'Mar 2025', dueDate:'2025-04-20', filedDate:'2025-04-18', status:'filed', lateFee:0 },
  { client:'Sunita Enterprises Pvt Ltd', gstin:'27AACCS5678D1Z3', returnType:'GSTR-1', period:'Mar 2025', dueDate:'2025-04-11', filedDate:'2025-04-10', status:'filed', lateFee:0 },
  { client:'Techno Traders', gstin:'27AAFT7890G1Z1', returnType:'GSTR-3B', period:'Mar 2025', dueDate:'2025-04-20', filedDate:null, status:'pending', lateFee:0 },
  { client:'Techno Traders', gstin:'27AAFT7890G1Z1', returnType:'GSTR-1', period:'Mar 2025', dueDate:'2025-04-11', filedDate:null, status:'late', lateFee:1000 },
];

const tdsRegister = [
  { client:'Sunita Enterprises Pvt Ltd', tan:'MUMA12345B', returnType:'26Q', quarter:'Q4', fy:'2024-25', dueDate:'2025-05-31', filedDate:'2025-05-28', status:'filed' },
  { client:'Techno Traders', tan:'MUMR56789C', returnType:'26Q', quarter:'Q4', fy:'2024-25', dueDate:'2025-05-31', filedDate:null, status:'pending' },
];

const rocRegister = [
  { client:'Sunita Enterprises Pvt Ltd', cin:'U74999MH2015PTC123456', filingType:'AOC-4', fy:'2023-24', dueDate:'2024-10-29', filedDate:'2024-10-25', status:'filed', feePaid:300 },
  { client:'Sunita Enterprises Pvt Ltd', cin:'U74999MH2015PTC123456', filingType:'MGT-7', fy:'2023-24', dueDate:'2024-11-29', filedDate:null, status:'pending', feePaid:null },
];

export default function Registers() {
  const [tab, setTab] = useState('gst');

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'2px solid #e2e8f0' }}>
        {[['gst','GST Register'],['tds','TDS Register'],['roc','ROC Register']].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{ padding:'8px 20px', background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:600, color:tab===t?'#2563eb':'#64748b', borderBottom:tab===t?'2px solid #2563eb':'2px solid transparent', marginBottom:-2 }}>
            📊 {l}
          </button>
        ))}
      </div>

      {tab==='gst' && (
        <div style={cardStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>{['Client','GSTIN','Return Type','Period','Due Date','Filed Date','Status','Late Fee'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {gstRegister.map((r,i)=>(
                <tr key={i} style={trStyle}>
                  <td style={{ ...tdStyle, fontWeight:600 }}>{r.client}</td>
                  <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:11 }}>{r.gstin}</td>
                  <td style={tdStyle}>{r.returnType}</td>
                  <td style={tdStyle}>{r.period}</td>
                  <td style={tdStyle}>{r.dueDate}</td>
                  <td style={tdStyle}>{r.filedDate || '—'}</td>
                  <td style={tdStyle}><StatusBadge status={r.status} /></td>
                  <td style={{ ...tdStyle, color: r.lateFee?'#dc2626':'#16a34a', fontWeight:600 }}>{r.lateFee ? `₹${r.lateFee}` : 'Nil'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==='tds' && (
        <div style={cardStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>{['Client','TAN','Return Type','Quarter','FY','Due Date','Filed Date','Status'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {tdsRegister.map((r,i)=>(
                <tr key={i} style={trStyle}>
                  <td style={{ ...tdStyle, fontWeight:600 }}>{r.client}</td>
                  <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:12 }}>{r.tan}</td>
                  <td style={tdStyle}>{r.returnType}</td>
                  <td style={tdStyle}>{r.quarter}</td>
                  <td style={tdStyle}>{r.fy}</td>
                  <td style={tdStyle}>{r.dueDate}</td>
                  <td style={tdStyle}>{r.filedDate || '—'}</td>
                  <td style={tdStyle}><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==='roc' && (
        <div style={cardStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>{['Client','CIN','Filing Type','FY','Due Date','Filed Date','Status','Fee Paid'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rocRegister.map((r,i)=>(
                <tr key={i} style={trStyle}>
                  <td style={{ ...tdStyle, fontWeight:600 }}>{r.client}</td>
                  <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:11 }}>{r.cin}</td>
                  <td style={tdStyle}>{r.filingType}</td>
                  <td style={tdStyle}>{r.fy}</td>
                  <td style={tdStyle}>{r.dueDate}</td>
                  <td style={tdStyle}>{r.filedDate || '—'}</td>
                  <td style={tdStyle}><StatusBadge status={r.status} /></td>
                  <td style={tdStyle}>{r.feePaid ? `₹${r.feePaid}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const cardStyle = { background:'#fff', borderRadius:10, boxShadow:'0 1px 3px rgba(0,0,0,.08)', overflow:'auto' };
const tableStyle = { width:'100%', borderCollapse:'collapse', fontSize:13 };
const thStyle = { textAlign:'left', padding:'10px 12px', color:'#64748b', fontWeight:600, fontSize:12, borderBottom:'2px solid #f1f5f9', background:'#f8fafc', whiteSpace:'nowrap' };
const tdStyle = { padding:'10px 12px', color:'#334155', verticalAlign:'middle', whiteSpace:'nowrap' };
const trStyle = { borderBottom:'1px solid #f8fafc' };

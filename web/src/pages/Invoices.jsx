import { useState } from 'react';
import { mockInvoices, mockClients } from '../data/mockData';
import StatusBadge from '../components/common/StatusBadge';

const ledger = [
  { date:'2025-04-01', narration:'Invoice RG/24-25/001', debit:5900, credit:0, balance:5900 },
  { date:'2025-04-10', narration:'Payment received – NEFT', debit:0, credit:5900, balance:0 },
  { date:'2025-04-05', narration:'Invoice RG/24-25/002', debit:35400, credit:0, balance:35400 },
  { date:'2025-04-20', narration:'Part payment – UPI', debit:0, credit:20000, balance:15400 },
];

export default function Invoices() {
  const [tab, setTab] = useState('invoices');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = mockInvoices.filter(i => statusFilter==='all' || i.status===statusFilter);
  const totalOutstanding = mockInvoices.filter(i=>i.status!=='paid'&&i.status!=='cancelled').reduce((a,i)=>a+(i.totalAmount-i.amountPaid),0);
  const totalOverdue = mockInvoices.filter(i=>i.status==='overdue').reduce((a,i)=>a+(i.totalAmount-i.amountPaid),0);

  return (
    <div style={{ padding:24 }}>
      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        {[
          { label:'Total Billed (FY 24-25)', value:`₹${mockInvoices.reduce((a,i)=>a+i.totalAmount,0).toLocaleString('en-IN')}`, color:'#2563eb' },
          { label:'Total Collected', value:`₹${mockInvoices.reduce((a,i)=>a+i.amountPaid,0).toLocaleString('en-IN')}`, color:'#16a34a' },
          { label:'Outstanding', value:`₹${totalOutstanding.toLocaleString('en-IN')}`, color:'#d97706' },
          { label:'Overdue', value:`₹${totalOverdue.toLocaleString('en-IN')}`, color:'#dc2626' },
        ].map(s=>(
          <div key={s.label} style={{ background:'#fff', borderRadius:10, padding:'16px 20px', boxShadow:'0 1px 3px rgba(0,0,0,.08)', borderLeft:`4px solid ${s.color}` }}>
            <div style={{ fontSize:22, fontWeight:700, color:'#1e293b' }}>{s.value}</div>
            <div style={{ fontSize:12, color:'#64748b', marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:'2px solid #e2e8f0' }}>
        {['invoices','ledger'].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{ padding:'8px 20px', background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:600, color: tab===t?'#2563eb':'#64748b', borderBottom: tab===t?'2px solid #2563eb':'2px solid transparent', marginBottom:-2 }}>
            {t==='invoices'?'🧾 Invoices':'📒 Ledger'}
          </button>
        ))}
        <button style={{ ...btnPrimary, marginLeft:'auto' }}>🧾 Raise Invoice</button>
      </div>

      {tab==='invoices' && (
        <div style={cardStyle}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #f1f5f9', display:'flex', gap:8 }}>
            {['all','draft','sent','partially_paid','paid','overdue'].map(s=>(
              <button key={s} onClick={()=>setStatusFilter(s)} style={{ padding:'4px 12px', background: statusFilter===s?'#2563eb':'#f8fafc', color: statusFilter===s?'#fff':'#64748b', border:'1px solid #e2e8f0', borderRadius:16, fontSize:12, cursor:'pointer', fontWeight:600 }}>
                {s==='all'?'All':s.replace(/_/g,' ')}
              </button>
            ))}
          </div>
          <table style={tableStyle}>
            <thead>
              <tr>{['Invoice #','Client','Date','Due Date','Amount','Paid','Balance','Status','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map(i=>(
                <tr key={i.id} style={trStyle}>
                  <td style={{ ...tdStyle, fontWeight:600, fontFamily:'monospace', fontSize:12 }}>{i.invoiceNumber}</td>
                  <td style={tdStyle}>{i.clientName}</td>
                  <td style={tdStyle}>{i.invoiceDate}</td>
                  <td style={tdStyle}>{i.dueDate}</td>
                  <td style={{ ...tdStyle, fontWeight:600 }}>₹{i.totalAmount.toLocaleString('en-IN')}</td>
                  <td style={{ ...tdStyle, color:'#16a34a' }}>₹{i.amountPaid.toLocaleString('en-IN')}</td>
                  <td style={{ ...tdStyle, color: i.status==='paid'?'#16a34a':'#dc2626', fontWeight:600 }}>₹{(i.totalAmount-i.amountPaid).toLocaleString('en-IN')}</td>
                  <td style={tdStyle}><StatusBadge status={i.status} /></td>
                  <td style={tdStyle}>
                    <button style={iconBtn}>👁️</button>
                    <button style={iconBtn}>📧</button>
                    <button style={iconBtn}>💳 Record Payment</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==='ledger' && (
        <div style={cardStyle}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #f1f5f9', display:'flex', gap:12, alignItems:'center' }}>
            <span style={{ fontSize:13, color:'#64748b' }}>Client:</span>
            <select style={{ padding:'6px 10px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13 }}>
              {mockClients.map(c=><option key={c.id}>{c.displayName}</option>)}
            </select>
          </div>
          <table style={tableStyle}>
            <thead>
              <tr>{['Date','Narration','Debit (Dr)','Credit (Cr)','Balance'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {ledger.map((e,i)=>(
                <tr key={i} style={trStyle}>
                  <td style={tdStyle}>{e.date}</td>
                  <td style={tdStyle}>{e.narration}</td>
                  <td style={{ ...tdStyle, color:'#dc2626', fontWeight: e.debit?600:400 }}>{e.debit ? `₹${e.debit.toLocaleString('en-IN')}` : '—'}</td>
                  <td style={{ ...tdStyle, color:'#16a34a', fontWeight: e.credit?600:400 }}>{e.credit ? `₹${e.credit.toLocaleString('en-IN')}` : '—'}</td>
                  <td style={{ ...tdStyle, fontWeight:700 }}>₹{e.balance.toLocaleString('en-IN')}</td>
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
const btnPrimary = { padding:'8px 16px', background:'#2563eb', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600 };
const iconBtn = { background:'none', border:'none', cursor:'pointer', fontSize:13, padding:'2px 6px', marginRight:2, color:'#2563eb' };

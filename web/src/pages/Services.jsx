import { useState } from 'react';
import { mockServices, mockTasks } from '../data/mockData';
import StatusBadge from '../components/common/StatusBadge';

export default function Services() {
  const [selectedService, setSelectedService] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredServices = mockServices.filter(s => filterStatus === 'all' || s.status === filterStatus);
  const serviceTasks = selectedService ? mockTasks.filter(t => t.serviceId === selectedService.id) : [];

  const completedTasks = serviceTasks.filter(t => t.status === 'done').length;
  const progress = serviceTasks.length ? Math.round((completedTasks / serviceTasks.length) * 100) : 0;

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', gap:12, marginBottom:20 }}>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="all">All Statuses</option>
          {['not_started','in_progress','pending_info','review','completed','cancelled'].map(s=>(
            <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
          ))}
        </select>
        <button style={btnPrimary}>➕ New Service Engagement</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: selectedService ? '1fr 380px' : '1fr', gap:20 }}>
        {/* Services list */}
        <div style={cardStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>{['Client','Service','FY','Assigned To','Due Date','Fee','Status','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filteredServices.map(s=>(
                <tr key={s.id} style={{ ...trStyle, background: selectedService?.id === s.id ? '#eff6ff':'transparent' }} onClick={()=>setSelectedService(s)}>
                  <td style={{ ...tdStyle, fontWeight:600 }}>{s.clientName}</td>
                  <td style={tdStyle}>{s.type}</td>
                  <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:12 }}>{s.financialYear}</td>
                  <td style={tdStyle}>{s.assignedTo}</td>
                  <td style={tdStyle}>{s.dueDate}</td>
                  <td style={tdStyle}>₹{s.feeAgreed?.toLocaleString('en-IN')}</td>
                  <td style={tdStyle}><StatusBadge status={s.status} /></td>
                  <td style={tdStyle}>
                    <button style={iconBtn}>✏️</button>
                    <button style={iconBtn}>📂</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Task panel */}
        {selectedService && (
          <div style={sidePanel}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:15 }}>{selectedService.type}</div>
                <div style={{ fontSize:12, color:'#64748b' }}>{selectedService.clientName} · {selectedService.financialYear}</div>
              </div>
              <button onClick={()=>setSelectedService(null)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18 }}>✕</button>
            </div>

            {/* Progress bar */}
            <div style={{ marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#64748b', marginBottom:4 }}>
                <span>Progress</span><span>{completedTasks}/{serviceTasks.length} tasks</span>
              </div>
              <div style={{ height:8, background:'#e2e8f0', borderRadius:4, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${progress}%`, background:'#2563eb', borderRadius:4, transition:'width 0.3s' }} />
              </div>
            </div>

            <div style={{ marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontWeight:600, fontSize:13 }}>Tasks</span>
              <button style={{ ...btnPrimary, padding:'4px 10px', fontSize:12 }}>➕ Add Task</button>
            </div>
            {serviceTasks.length === 0 && <div style={{ color:'#94a3b8', fontSize:13 }}>No tasks yet.</div>}
            {serviceTasks.map(t=>(
              <div key={t.id} style={{ padding:'10px 0', borderBottom:'1px solid #f1f5f9' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:13, fontWeight: t.status==='done' ? 400:600, textDecoration: t.status==='done' ? 'line-through':'none', color: t.status==='done' ? '#94a3b8':'#1e293b' }}>
                    {t.status==='done'?'✅':'⬜'} {t.title}
                  </span>
                  <StatusBadge status={t.priority} />
                </div>
                <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>{t.assignedTo} · Due: {t.dueDate}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const cardStyle = { background:'#fff', borderRadius:10, boxShadow:'0 1px 3px rgba(0,0,0,.08)', overflow:'auto' };
const sidePanel = { background:'#fff', borderRadius:10, boxShadow:'0 1px 3px rgba(0,0,0,.08)', padding:20, overflowY:'auto' };
const tableStyle = { width:'100%', borderCollapse:'collapse', fontSize:13 };
const thStyle = { textAlign:'left', padding:'10px 12px', color:'#64748b', fontWeight:600, fontSize:12, borderBottom:'2px solid #f1f5f9', background:'#f8fafc', whiteSpace:'nowrap' };
const tdStyle = { padding:'10px 12px', color:'#334155', verticalAlign:'middle', whiteSpace:'nowrap' };
const trStyle = { borderBottom:'1px solid #f8fafc', cursor:'pointer' };
const selectStyle = { padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, background:'#fff' };
const btnPrimary = { padding:'8px 16px', background:'#2563eb', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600 };
const iconBtn = { background:'none', border:'none', cursor:'pointer', fontSize:15, padding:'2px 4px' };

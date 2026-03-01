import { useState } from 'react';
import { mockAppointments } from '../data/mockData';
import StatusBadge from '../components/common/StatusBadge';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

export default function Calendar() {
  const [tab, setTab] = useState('appointments');
  const [year, setYear] = useState(2025);
  const [month, setMonth] = useState(5); // June

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const cells = Array(firstDay).fill(null).concat(Array.from({length:daysInMonth},(_,i)=>i+1));
  while (cells.length % 7) cells.push(null);

  const apptByDate = {};
  mockAppointments.forEach(a => {
    const d = parseInt(a.date.split('-')[2]);
    if (!apptByDate[d]) apptByDate[d] = [];
    apptByDate[d].push(a);
  });

  const filingDeadlines = [
    { day:11, label:'GSTR-1 (Apr)', color:'#dcfce7', textColor:'#166534' },
    { day:20, label:'GSTR-3B (Apr)', color:'#dbeafe', textColor:'#1d4ed8' },
    { day:30, label:'TDS Q4 Due', color:'#fef3c7', textColor:'#92400e' },
  ];
  const deadlinesByDay = {};
  filingDeadlines.forEach(d=>{ if(!deadlinesByDay[d.day]) deadlinesByDay[d.day]=[]; deadlinesByDay[d.day].push(d); });

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:'2px solid #e2e8f0' }}>
        {['calendar','appointments'].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{ padding:'8px 20px', background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:600, color:tab===t?'#2563eb':'#64748b', borderBottom:tab===t?'2px solid #2563eb':'2px solid transparent', marginBottom:-2 }}>
            {t==='calendar'?'📅 Calendar View':'📋 Appointments List'}
          </button>
        ))}
        <button style={{ ...btnPrimary, marginLeft:'auto' }}>➕ Book Appointment</button>
      </div>

      {tab==='calendar' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
            <button onClick={()=>{ if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); }} style={navBtn}>‹</button>
            <span style={{ fontSize:18, fontWeight:700, minWidth:160, textAlign:'center' }}>{MONTHS[month]} {year}</span>
            <button onClick={()=>{ if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); }} style={navBtn}>›</button>
          </div>
          <div style={{ background:'#fff', borderRadius:10, boxShadow:'0 1px 3px rgba(0,0,0,.08)', overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
              {DAYS.map(d=><div key={d} style={{ padding:'10px', textAlign:'center', fontSize:12, fontWeight:700, color:'#64748b' }}>{d}</div>)}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
              {cells.map((day, i) => (
                <div key={i} style={{ minHeight:90, border:'1px solid #f1f5f9', padding:'6px', background: day===18?'#eff6ff':'#fff' }}>
                  {day && (
                    <>
                      <div style={{ fontSize:12, fontWeight: day===18?700:400, color: day===18?'#2563eb':'#334155', marginBottom:4 }}>{day}</div>
                      {(deadlinesByDay[day]||[]).map((dl,di)=>(
                        <div key={di} style={{ background:dl.color, color:dl.textColor, fontSize:10, padding:'1px 5px', borderRadius:4, marginBottom:2, fontWeight:600, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>{dl.label}</div>
                      ))}
                      {(apptByDate[day]||[]).map((a,ai)=>(
                        <div key={ai} style={{ background:'#ede9fe', color:'#5b21b6', fontSize:10, padding:'1px 5px', borderRadius:4, marginBottom:2, fontWeight:600, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>
                          {a.startTime} {a.clientName.split(' ')[0]}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop:12, display:'flex', gap:12, fontSize:12 }}>
            {[['#dcfce7','#166534','GST/Filing Deadline'],['#fef3c7','#92400e','TDS Deadline'],['#ede9fe','#5b21b6','Appointment'],['#eff6ff','#2563eb','Today']].map(([bg,c,l])=>(
              <span key={l} style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ width:12, height:12, borderRadius:2, background:bg, border:`1px solid ${c}` }}></span>
                <span style={{ color:'#64748b' }}>{l}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {tab==='appointments' && (
        <div style={cardStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>{['Client','Staff','Date & Time','Mode','Subject','Status','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {mockAppointments.map(a=>(
                <tr key={a.id} style={trStyle}>
                  <td style={{ ...tdStyle, fontWeight:600 }}>{a.clientName}</td>
                  <td style={tdStyle}>{a.staffName}</td>
                  <td style={tdStyle}>{a.date} {a.startTime}–{a.endTime}</td>
                  <td style={tdStyle}><span style={{ background:'#f1f5f9', padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:600 }}>{a.mode.replace('_',' ')}</span></td>
                  <td style={tdStyle}>{a.subject}</td>
                  <td style={tdStyle}><StatusBadge status={a.status} /></td>
                  <td style={tdStyle}>
                    <button style={iconBtn}>✏️</button>
                    <button style={iconBtn}>✕</button>
                  </td>
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
const navBtn = { padding:'4px 14px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, cursor:'pointer', fontSize:18 };
const iconBtn = { background:'none', border:'none', cursor:'pointer', fontSize:15, padding:'2px 4px' };

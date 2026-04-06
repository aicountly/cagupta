import { useState, useEffect } from 'react';
import { getAppointments, createAppointment, updateAppointment, deleteAppointment } from '../services/appointmentService';
import StatusBadge from '../components/common/StatusBadge';
import { useNotification } from '../context/NotificationContext';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

const emptyForm = { clientName:'', staffName:'', date:'', startTime:'', endTime:'', mode:'in_person', subject:'' };

export default function Calendar() {
  const [tab, setTab] = useState('appointments');
  const [year, setYear] = useState(2025);
  const [month, setMonth] = useState(5); // June
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAppointments()
      .then(data => setAppointments(data))
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false));
  }, []);
  const [showBookModal, setShowBookModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const { addNotification } = useNotification();

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const cells = Array(firstDay).fill(null).concat(Array.from({length:daysInMonth},(_,i)=>i+1));
  while (cells.length % 7) cells.push(null);

  const apptByDate = {};
  appointments.forEach(a => {
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

  function openAddModal() {
    setForm(emptyForm);
    setEditId(null);
    setShowBookModal(true);
  }

  function openEditModal(a) {
    setForm({ clientName:a.clientName, staffName:a.staffName, date:a.date, startTime:a.startTime, endTime:a.endTime, mode:a.mode, subject:a.subject });
    setEditId(a.id);
    setShowBookModal(true);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (editId) {
      updateAppointment(editId, form)
        .then(updated => setAppointments(prev => prev.map(a => a.id === editId ? updated : a)))
        .catch(() => {});
    } else {
      createAppointment({ ...form, status: 'scheduled' })
        .then(newAppt => {
          setAppointments(prev => [...prev, newAppt]);
          addNotification('Appointment booked: ' + form.subject, 'appointment');
        })
        .catch(() => {});
    }
    setShowBookModal(false);
  }

  function handleCancel(id) {
    if (window.confirm('Cancel this appointment?')) {
      deleteAppointment(id)
        .then(() => setAppointments(prev => prev.filter(a => a.id !== id)))
        .catch(() => {});
    }
  }

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:'2px solid #e2e8f0' }}>
        {['calendar','appointments'].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{ padding:'8px 20px', background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:600, color:tab===t?'#2563eb':'#64748b', borderBottom:tab===t?'2px solid #2563eb':'2px solid transparent', marginBottom:-2 }}>
            {t==='calendar'?'📅 Calendar View':'📋 Appointments List'}
          </button>
        ))}
        <button style={{ ...btnPrimary, marginLeft:'auto' }} onClick={openAddModal}>➕ Book Appointment</button>
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
              {appointments.map(a=>(
                <tr key={a.id} style={trStyle}>
                  <td style={{ ...tdStyle, fontWeight:600 }}>{a.clientName}</td>
                  <td style={tdStyle}>{a.staffName}</td>
                  <td style={tdStyle}>{a.date} {a.startTime}–{a.endTime}</td>
                  <td style={tdStyle}><span style={{ background:'#f1f5f9', padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:600 }}>{a.mode.replace('_',' ')}</span></td>
                  <td style={tdStyle}>{a.subject}</td>
                  <td style={tdStyle}><StatusBadge status={a.status} /></td>
                  <td style={tdStyle}>
                    <button style={iconBtn} onClick={() => openEditModal(a)}>✏️</button>
                    <button style={iconBtn} onClick={() => handleCancel(a.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showBookModal && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:16, fontWeight:700 }}>{editId ? 'Edit Appointment' : 'Book Appointment'}</h3>
              <button onClick={() => setShowBookModal(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer' }}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              {[
                { label:'Client Name', key:'clientName', type:'text', required:true },
                { label:'Staff Name', key:'staffName', type:'text', required:true },
                { label:'Date', key:'date', type:'date', required:true },
                { label:'Start Time', key:'startTime', type:'time', required:true },
                { label:'End Time', key:'endTime', type:'time', required:true },
                { label:'Subject', key:'subject', type:'text', required:true },
              ].map(f=>(
                <div key={f.key} style={{ marginBottom:12 }}>
                  <label style={labelStyle}>{f.label}{f.required && <span style={{ color:'#ef4444' }}> *</span>}</label>
                  <input type={f.type} required={f.required} value={form[f.key]} onChange={e=>setForm(v=>({...v,[f.key]:e.target.value}))} style={inputStyle} />
                </div>
              ))}
              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>Mode</label>
                <select value={form.mode} onChange={e=>setForm(v=>({...v,mode:e.target.value}))} style={inputStyle}>
                  <option value="in_person">In Person</option>
                  <option value="video">Video</option>
                  <option value="phone">Phone</option>
                </select>
              </div>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button type="button" onClick={() => setShowBookModal(false)} style={btnOutline}>Cancel</button>
                <button type="submit" style={btnPrimary}>{editId ? 'Save Changes' : 'Book Appointment'}</button>
              </div>
            </form>
          </div>
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
const btnOutline = { padding:'8px 16px', background:'#fff', color:'#2563eb', border:'1px solid #2563eb', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600 };
const navBtn = { padding:'4px 14px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, cursor:'pointer', fontSize:18 };
const iconBtn = { background:'none', border:'none', cursor:'pointer', fontSize:15, padding:'2px 4px' };
const modalOverlay = { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' };
const modalBox = { background:'#fff', borderRadius:12, padding:28, width:440, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 16px 48px rgba(0,0,0,0.2)' };
const labelStyle = { display:'block', fontSize:12, color:'#64748b', fontWeight:600, marginBottom:4 };
const inputStyle = { width:'100%', padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, boxSizing:'border-box' };

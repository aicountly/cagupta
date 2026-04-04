import { useState } from 'react';
import { getPortalTypes, savePortalTypes } from '../constants/portalTypes';

const firmData = {
  name: 'CA Rahul Gupta & Associates',
  gstin: '27ABCDE1234F1Z5',
  pan: 'ABCDE1234F',
  address: '3rd Floor, Shree Complex, MG Road, Mumbai – 400001',
  phone: '022-12345678',
  email: 'office@carahulgupta.in',
  website: 'www.carahulgupta.in',
};

const teamMembers = [
  { id: 'u1', name: 'CA Rahul Gupta', email: 'rahul@carahulgupta.in', role: 'admin', status: 'active' },
  { id: 'u2', name: 'CA Priya Sharma', email: 'priya@carahulgupta.in', role: 'partner', status: 'active' },
  { id: 'u3', name: 'Amit Patil', email: 'amit@carahulgupta.in', role: 'staff', status: 'active' },
  { id: 'u4', name: 'Sneha Joshi', email: 'sneha@carahulgupta.in', role: 'staff', status: 'active' },
  { id: 'u5', name: 'Rohan Mehta', email: 'rohan@carahulgupta.in', role: 'manager', status: 'inactive' },
];

const roleColors = { admin:'#ede9fe', partner:'#dbeafe', manager:'#dcfce7', staff:'#f1f5f9' };
const roleTextColors = { admin:'#5b21b6', partner:'#1d4ed8', manager:'#166534', staff:'#475569' };

export default function Settings() {
  const [tab, setTab] = useState('firm');
  const [portalTypes, setPortalTypes] = useState(() => getPortalTypes());
  const [newPortal, setNewPortal] = useState('');
  const [portalError, setPortalError] = useState('');

  function handleAddPortal() {
    const val = newPortal.trim();
    if (!val) { setPortalError('Portal name cannot be empty.'); return; }
    if (portalTypes.includes(val)) { setPortalError('This portal already exists.'); return; }
    const updated = [...portalTypes, val];
    setPortalTypes(updated);
    savePortalTypes(updated);
    setNewPortal('');
    setPortalError('');
  }

  function handleDeletePortal(name) {
    const updated = portalTypes.filter(p => p !== name);
    setPortalTypes(updated);
    savePortalTypes(updated);
  }

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:'2px solid #e2e8f0' }}>
        {[['firm','Firm Profile'],['team','Team & Users'],['roles','Roles & Permissions'],['billing','Billing Firms'],['notifications','Notifications'],['other','Other Settings']].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{ padding:'8px 20px', background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:600, color:tab===t?'#2563eb':'#64748b', borderBottom:tab===t?'2px solid #2563eb':'2px solid transparent', marginBottom:-2 }}>
            {l}
          </button>
        ))}
      </div>

      {tab==='firm' && (
        <div style={{ maxWidth:640 }}>
          <div style={cardStyle}>
            <h3 style={sectionTitle}>🏢 Firm Profile</h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              {Object.entries(firmData).map(([k,v])=>(
                <div key={k}>
                  <label style={labelStyle}>{k.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}</label>
                  <input defaultValue={v} style={inputStyle} />
                </div>
              ))}
            </div>
            <button style={{ ...btnPrimary, marginTop:20 }}>💾 Save Changes</button>
          </div>
        </div>
      )}

      {tab==='team' && (
        <div>
          <div style={{ marginBottom:16, display:'flex', justifyContent:'flex-end' }}>
            <button style={btnPrimary}>➕ Invite Team Member</button>
          </div>
          <div style={cardStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>{['Name','Email','Role','Status','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {teamMembers.map(m=>(
                  <tr key={m.id} style={trStyle}>
                    <td style={{ ...tdStyle, fontWeight:600 }}>
                      <span style={{ width:32, height:32, borderRadius:'50%', background:roleColors[m.role]||'#e2e8f0', color:roleTextColors[m.role]||'#475569', display:'inline-flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12, marginRight:10 }}>
                        {m.name.split(' ').map(n=>n[0]).join('').slice(0,2)}
                      </span>
                      {m.name}
                    </td>
                    <td style={tdStyle}>{m.email}</td>
                    <td style={tdStyle}>
                      <span style={{ background:roleColors[m.role]||'#f1f5f9', color:roleTextColors[m.role]||'#475569', padding:'2px 10px', borderRadius:12, fontSize:12, fontWeight:600, textTransform:'capitalize' }}>
                        {m.role}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ color: m.status==='active'?'#16a34a':'#dc2626', fontWeight:600, fontSize:12 }}>
                        {m.status==='active'?'● Active':'● Inactive'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <button style={iconBtn}>✏️</button>
                      <button style={iconBtn}>🔑 Reset Password</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==='roles' && (
        <div style={{ maxWidth:600 }}>
          <div style={cardStyle}>
            <h3 style={sectionTitle}>🔐 Roles & Permissions</h3>
            <p style={{ fontSize:13, color:'#64748b', marginBottom:16 }}>Define what each role can access across the portal.</p>
            {[
              { role:'Admin', desc:'Full access to all modules, settings, and user management.' },
              { role:'Partner', desc:'Access to all client data, financials, and reports. Cannot manage users.' },
              { role:'Manager', desc:'Manage assigned clients, services, tasks, and documents. View-only for financials.' },
              { role:'Staff', desc:'Work on assigned tasks and services. Cannot view credentials or financials.' },
              { role:'Client', desc:'View-only access to own documents, invoices, and appointments.' },
            ].map(r=>(
              <div key={r.role} style={{ padding:'14px 0', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <span style={{ fontWeight:700, fontSize:13 }}>{r.role}</span>
                  <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{r.desc}</div>
                </div>
                <button style={btnOutline}>Configure</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(tab==='billing'||tab==='notifications') && (
        <div style={{ ...cardStyle, maxWidth:600, padding:32, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🚧</div>
          <div style={{ fontWeight:700, fontSize:16, color:'#1e293b' }}>{tab==='billing'?'Billing Firms':'Notifications'} Configuration</div>
          <div style={{ color:'#64748b', fontSize:13, marginTop:8 }}>This section will allow you to configure {tab==='billing'?'multiple billing firm profiles and GST numbers':'email and SMS notification templates and triggers'}.</div>
        </div>
      )}

      {tab==='other' && (
        <div style={{ maxWidth:640 }}>
          <h2 style={{ margin:'0 0 4px 0', fontSize:18, fontWeight:700, color:'#1e293b' }}>⚙️ Other Settings</h2>
          <p style={{ margin:'0 0 20px 0', fontSize:13, color:'#64748b' }}>Manage lookup lists and occasional configuration used across the portal.</p>
          <div style={cardStyle}>
            <h3 style={sectionTitle}>🔑 Portal Types</h3>
            <p style={{ fontSize:13, color:'#64748b', margin:'-12px 0 16px 0' }}>These portal names appear as a dropdown when adding credentials in the Credentials Vault.</p>
            {portalTypes.map(name => (
              <div key={name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid #f1f5f9' }}>
                <span style={{ fontSize:13, color:'#334155' }}>{name}</span>
                <button onClick={() => handleDeletePortal(name)} style={iconBtn} title="Delete">🗑️</button>
              </div>
            ))}
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <input
                value={newPortal}
                onChange={e => { setNewPortal(e.target.value); setPortalError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleAddPortal()}
                placeholder="e.g. NSDL e-Gov Portal"
                style={{ ...inputStyle, flex:1 }}
              />
              <button onClick={handleAddPortal} style={btnPrimary}>➕ Add</button>
            </div>
            {portalError && <div style={{ fontSize:11, color:'#dc2626', marginTop:4 }}>{portalError}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle = { background:'#fff', borderRadius:10, boxShadow:'0 1px 3px rgba(0,0,0,.08)', padding:24 };
const sectionTitle = { margin:'0 0 20px 0', fontSize:15, fontWeight:700, color:'#1e293b' };
const tableStyle = { width:'100%', borderCollapse:'collapse', fontSize:13 };
const thStyle = { textAlign:'left', padding:'10px 12px', color:'#64748b', fontWeight:600, fontSize:12, borderBottom:'2px solid #f1f5f9', background:'#f8fafc' };
const tdStyle = { padding:'10px 12px', color:'#334155', verticalAlign:'middle' };
const trStyle = { borderBottom:'1px solid #f8fafc' };
const btnPrimary = { padding:'8px 16px', background:'#2563eb', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600 };
const btnOutline = { padding:'6px 14px', background:'#fff', color:'#2563eb', border:'1px solid #2563eb', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:600 };
const iconBtn = { background:'none', border:'none', cursor:'pointer', fontSize:13, padding:'2px 6px', color:'#2563eb' };
const labelStyle = { display:'block', fontSize:12, color:'#64748b', fontWeight:600, marginBottom:4 };
const inputStyle = { width:'100%', padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, boxSizing:'border-box' };

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getLeads, createLead, updateLead } from '../services/leadService';
import { createContact } from '../services/contactService';
import { getOrganizations } from '../services/organizationService';
import ClientSearchDropdown from '../components/common/ClientSearchDropdown';
import { useStaffUsers } from '../hooks/useStaffUsers';
import StatusBadge from '../components/common/StatusBadge';
import { useNotification } from '../context/NotificationContext';

const stages = ['new','contacted','qualified','proposal_sent','negotiation','won','lost'];

const emptyLeadForm = {
  clientType: 'contact', // 'contact' | 'organization' — mutually exclusive client
  contactId: null, contactName: '', contactMode: 'existing',
  newContactName: '', newContactEmail: '', newContactPhone: '',
  organizationId: null, organizationName: '',
  company: '', email: '', phone: '',
  source: 'Referral', stage: 'new', estimatedValue: '',
  assignedTo: '', nextFollowUp: '', notes: '',
};

function leadClientTypeFromRow(l) {
  if (l.contactId) return 'contact';
  if (l.organizationId) return 'organization';
  return 'contact';
}

export default function Leads() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState('pipeline');
  const [selected, setSelected] = useState(null);
  const [leads, setLeads] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewLeadModal, setShowNewLeadModal] = useState(false);
  const [editLeadId, setEditLeadId] = useState(null);
  const [form, setForm] = useState(emptyLeadForm);
  const { addNotification } = useNotification();
  const { staffUsers } = useStaffUsers();

  useEffect(() => {
    setLoading(true);
    getLeads()
      .then(data => setLeads(data))
      .catch(() => setLeads([]))
      .finally(() => setLoading(false));
    getOrganizations()
      .then(data => setOrganizations(data))
      .catch(() => setOrganizations([]));
  }, []);

  const byStage = stages.reduce((acc,s)=>({ ...acc,[s]:leads.filter(l=>l.stage===s) }), {});
  const stageColors = { new:'#f1f5f9', contacted:'#dbeafe', qualified:'#ede9fe', proposal_sent:'#fef3c7', negotiation:'#ffedd5', won:'#dcfce7', lost:'#fee2e2' };

  function openAddModal() {
    setForm(emptyLeadForm);
    setEditLeadId(null);
    setShowNewLeadModal(true);
  }

  function openEditModal(l) {
    const ct = leadClientTypeFromRow(l);
    const orgName =
      ct === 'organization' && l.organizationId
        ? organizations.find(o => o.id === l.organizationId)?.displayName || ''
        : '';
    setForm({
      clientType: ct,
      contactId: ct === 'contact' ? l.contactId || null : null,
      contactName: ct === 'contact' ? l.contactName || '' : '',
      contactMode: 'existing',
      newContactName: '', newContactEmail: '', newContactPhone: '',
      organizationId: ct === 'organization' ? l.organizationId || null : null,
      organizationName: orgName,
      company: l.company || '', email: l.email || '', phone: l.phone || '',
      source: l.source, stage: l.stage,
      estimatedValue: l.estimatedValue || '',
      assignedTo: l.assignedTo || '',
      nextFollowUp: l.nextFollowUp || '',
      notes: l.notes || '',
    });
    setEditLeadId(l.id);
    setShowNewLeadModal(true);
  }

  useEffect(() => {
    const raw = searchParams.get('openLead');
    if (raw == null || !leads.length) return;
    const l = leads.find(x => String(x.id) === String(raw));
    if (l) {
      const ct = leadClientTypeFromRow(l);
      const orgName =
        ct === 'organization' && l.organizationId
          ? organizations.find(o => o.id === l.organizationId)?.displayName || ''
          : '';
      setForm({
        clientType: ct,
        contactId: ct === 'contact' ? l.contactId || null : null,
        contactName: ct === 'contact' ? l.contactName || '' : '',
        contactMode: 'existing',
        newContactName: '', newContactEmail: '', newContactPhone: '',
        organizationId: ct === 'organization' ? l.organizationId || null : null,
        organizationName: orgName,
        company: l.company || '', email: l.email || '', phone: l.phone || '',
        source: l.source, stage: l.stage,
        estimatedValue: l.estimatedValue || '',
        assignedTo: l.assignedTo || '',
        nextFollowUp: l.nextFollowUp || '',
        notes: l.notes || '',
      });
      setEditLeadId(l.id);
      setShowNewLeadModal(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('openLead');
    setSearchParams(next, { replace: true });
  }, [searchParams, leads, organizations, setSearchParams]);

  function setLeadClientType(next) {
    setForm(v => {
      if (next === 'contact') {
        return {
          ...v,
          clientType: 'contact',
          organizationId: null,
          organizationName: '',
        };
      }
      return {
        ...v,
        clientType: 'organization',
        contactId: null,
        contactName: '',
        contactMode: 'existing',
        newContactName: '',
        newContactEmail: '',
        newContactPhone: '',
      };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (form.clientType === 'organization') {
      if (!form.organizationId) {
        addNotification('Select an organization, or switch to Person (contact) to link a contact.', 'warning');
        return;
      }
    } else if (form.contactMode === 'existing' && !form.contactId) {
      addNotification('Select a contact, or switch to Organization to link a company.', 'warning');
      return;
    } else if (form.contactMode === 'new' && !form.newContactName.trim()) {
      addNotification('Enter the new contact’s name.', 'warning');
      return;
    }

    let contactId = null;
    let organizationId = null;
    let contactNameForApi = '';

    if (form.clientType === 'organization') {
      organizationId = form.organizationId;
      contactNameForApi =
        form.organizationName ||
        organizations.find(o => o.id === form.organizationId)?.displayName ||
        '';
    } else {
      contactId = form.contactId || null;
      contactNameForApi =
        form.contactMode === 'existing'
          ? form.contactName
          : form.newContactName.trim();

      if (form.contactMode === 'new' && form.newContactName.trim()) {
        try {
          const newContact = await createContact({
            displayName: form.newContactName.trim(),
            email: form.newContactEmail.trim() || undefined,
            mobile: form.newContactPhone.trim() || undefined,
            status: 'active',
          });
          contactId = newContact.id;
          contactNameForApi = form.newContactName.trim();
        } catch {
          addNotification('Contact creation failed — lead will be saved without a linked contact.', 'warning');
        }
      }
    }

    const payload = {
      ...form,
      contactId,
      organizationId,
      contactName: contactNameForApi,
      estimatedValue: Number(form.estimatedValue) || 0,
    };

    if (editLeadId) {
      updateLead(editLeadId, payload)
        .then(updated => {
          setLeads(prev => prev.map(l => l.id === editLeadId ? updated : l));
        })
        .catch(() => {});
    } else {
      createLead({ ...payload, probability: 50 })
        .then(newLead => {
          setLeads(prev => [...prev, newLead]);
          addNotification('New lead: ' + contactNameForApi, 'lead');
        })
        .catch(() => {});
    }
    setShowNewLeadModal(false);
  }

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'2px solid #e2e8f0' }}>
        {[['pipeline','Kanban Pipeline'],['list','List View']].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{ padding:'8px 20px', background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:600, color:tab===t?'#2563eb':'#64748b', borderBottom:tab===t?'2px solid #2563eb':'2px solid transparent', marginBottom:-2 }}>
            🎯 {l}
          </button>
        ))}
        <button style={{ ...btnPrimary, marginLeft:'auto' }} onClick={openAddModal}>➕ New Lead</button>
      </div>

      {tab==='pipeline' && (
        <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:8 }}>
          {stages.map(stage=>(
            <div key={stage} style={{ minWidth:220, background:'#f8fafc', borderRadius:10, padding:'12px', border:'1px solid #e2e8f0' }}>
              <div style={{ fontWeight:700, fontSize:12, color:'#64748b', textTransform:'uppercase', letterSpacing:1, marginBottom:12, display:'flex', justifyContent:'space-between' }}>
                <span>{stage.replace(/_/g,' ')}</span>
                <span style={{ background:'#e2e8f0', borderRadius:10, padding:'1px 8px' }}>{byStage[stage].length}</span>
              </div>
              {byStage[stage].map(l=>(
                <div key={l.id} onClick={()=>setSelected(l)} style={{ background:'#fff', borderRadius:8, padding:'12px', marginBottom:8, boxShadow:'0 1px 2px rgba(0,0,0,.07)', cursor:'pointer', borderLeft:`3px solid ${stageColors[stage]}` }}>
                  <div style={{ fontWeight:600, fontSize:13, color:'#1e293b' }}>{l.contactName}</div>
                  {l.company && <div style={{ fontSize:12, color:'#64748b' }}>{l.company}</div>}
                  <div style={{ fontSize:12, color:'#2563eb', marginTop:4 }}>₹{l.estimatedValue?.toLocaleString('en-IN')}</div>
                  <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>Follow-up: {l.nextFollowUp}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {tab==='list' && (
        <div style={cardStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>{['Contact','Company','Source','Stage','Probability','Est. Value','Assigned To','Follow-up','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {leads.map(l=>(
                <tr key={l.id} style={trStyle}>
                  <td style={{ ...tdStyle, fontWeight:600 }}>{l.contactName}</td>
                  <td style={tdStyle}>{l.company || '—'}</td>
                  <td style={tdStyle}>{l.source}</td>
                  <td style={tdStyle}><StatusBadge status={l.stage} /></td>
                  <td style={tdStyle}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:60, height:6, background:'#e2e8f0', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${l.probability}%`, background: l.probability>60?'#16a34a':l.probability>30?'#d97706':'#dc2626', borderRadius:3 }} />
                      </div>
                      <span style={{ fontSize:11 }}>{l.probability}%</span>
                    </div>
                  </td>
                  <td style={tdStyle}>₹{l.estimatedValue?.toLocaleString('en-IN')}</td>
                  <td style={tdStyle}>{l.assignedTo}</td>
                  <td style={tdStyle}>{l.nextFollowUp}</td>
                  <td style={tdStyle}>
                    <button style={iconBtn} onClick={() => openEditModal(l)}>✏️</button>
                    <button style={iconBtn}>📄 Quotation</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div style={panel}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
            <h3 style={{ margin:0, fontSize:15, fontWeight:700 }}>{selected.contactName}</h3>
            <button onClick={()=>setSelected(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer' }}>✕</button>
          </div>
          {[['Company',selected.company||'—'],['Email',selected.email],['Phone',selected.phone],['Source',selected.source],['Stage',<StatusBadge key="s" status={selected.stage} />],['Probability',`${selected.probability}%`],['Est. Value',`₹${selected.estimatedValue?.toLocaleString('en-IN')}`],['Assigned To',selected.assignedTo],['Follow-up',selected.nextFollowUp]].map(([k,v])=>(
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f1f5f9', fontSize:13 }}>
              <span style={{ color:'#64748b', fontWeight:600 }}>{k}</span>
              <span>{v}</span>
            </div>
          ))}
          <button style={{ ...btnPrimary, width:'100%', marginTop:16 }}>📄 Create Quotation</button>
        </div>
      )}

      {showNewLeadModal && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:16, fontWeight:700 }}>{editLeadId ? 'Edit Lead' : 'New Lead'}</h3>
              <button onClick={() => setShowNewLeadModal(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer' }}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Lead is for</label>
                  <p style={{ margin:'0 0 8px', fontSize:12, color:'#64748b' }}>Link this lead to either a person (contact) or an organization — not both.</p>
                  <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                    <button type="button" onClick={() => setLeadClientType('contact')}
                      style={{ ...toggleBtn, ...(form.clientType==='contact' ? toggleBtnActive : {}) }}>
                      Person (contact)
                    </button>
                    <button type="button" onClick={() => setLeadClientType('organization')}
                      style={{ ...toggleBtn, ...(form.clientType==='organization' ? toggleBtnActive : {}) }}>
                      Organization
                    </button>
                  </div>
                </div>
                {form.clientType === 'contact' && (
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Contact</label>
                  <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                    <button type="button" onClick={() => setForm(v => ({ ...v, contactMode:'existing' }))}
                      style={{ ...toggleBtn, ...(form.contactMode==='existing' ? toggleBtnActive : {}) }}>
                      Select existing contact
                    </button>
                    <button type="button" onClick={() => setForm(v => ({ ...v, contactMode:'new' }))}
                      style={{ ...toggleBtn, ...(form.contactMode==='new' ? toggleBtnActive : {}) }}>
                      Create new contact
                    </button>
                  </div>
                  {form.contactMode === 'existing' ? (
                    <ClientSearchDropdown
                      value={form.contactId}
                      displayValue={form.contactName}
                      placeholder="Search contact by name or email…"
                      onChange={c => setForm(v => ({
                        ...v,
                        contactId: c.id,
                        contactName: c.displayName,
                        email: v.email || c.email || '',
                        phone: v.phone || c.mobile || '',
                      }))}
                      style={{ width:'100%' }}
                    />
                  ) : (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                      <div>
                        <label style={labelStyle}>Full Name <span style={{ color:'#ef4444' }}>*</span></label>
                        <input required value={form.newContactName} onChange={e => setForm(v => ({ ...v, newContactName:e.target.value }))} style={inputStyle} placeholder="Contact full name" />
                      </div>
                      <div>
                        <label style={labelStyle}>Email</label>
                        <input type="email" value={form.newContactEmail} onChange={e => setForm(v => ({ ...v, newContactEmail:e.target.value }))} style={inputStyle} placeholder="email@example.com" />
                      </div>
                      <div>
                        <label style={labelStyle}>Phone</label>
                        <input value={form.newContactPhone} onChange={e => setForm(v => ({ ...v, newContactPhone:e.target.value }))} style={inputStyle} placeholder="+91 …" />
                      </div>
                    </div>
                  )}
                </div>
                )}
                {form.clientType === 'organization' && (
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Organization</label>
                  <select
                    value={form.organizationId || ''}
                    onChange={e => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      const org = id ? organizations.find(o => o.id === id) : null;
                      setForm(v => ({
                        ...v,
                        organizationId: id,
                        organizationName: org?.displayName || '',
                      }));
                    }}
                    style={inputStyle}
                  >
                    <option value="">— Select organization —</option>
                    {organizations.map(o => (
                      <option key={o.id} value={o.id}>{o.displayName}</option>
                    ))}
                  </select>
                </div>
                )}
                <div>
                  <label style={labelStyle}>Company (free text)</label>
                  <input value={form.company} onChange={e=>setForm(v=>({...v,company:e.target.value}))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={form.email} onChange={e=>setForm(v=>({...v,email:e.target.value}))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input value={form.phone} onChange={e=>setForm(v=>({...v,phone:e.target.value}))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Source</label>
                  <select value={form.source} onChange={e=>setForm(v=>({...v,source:e.target.value}))} style={inputStyle}>
                    {['Referral','Website','Cold Call','Social Media','Other'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Stage</label>
                  <select value={form.stage} onChange={e=>setForm(v=>({...v,stage:e.target.value}))} style={inputStyle}>
                    {stages.map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Estimated Value (₹)</label>
                  <input type="number" value={form.estimatedValue} onChange={e=>setForm(v=>({...v,estimatedValue:e.target.value}))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Assigned To</label>
                  <select value={form.assignedTo} onChange={e => setForm(v => ({ ...v, assignedTo: e.target.value }))} style={inputStyle}>
                    <option value="">— Select staff —</option>
                    {staffUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Next Follow-up</label>
                  <input type="date" value={form.nextFollowUp} onChange={e=>setForm(v=>({...v,nextFollowUp:e.target.value}))} style={inputStyle} />
                </div>
              </div>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
                <button type="button" onClick={() => setShowNewLeadModal(false)} style={btnOutline}>Cancel</button>
                <button type="submit" style={btnPrimary}>{editLeadId ? 'Save Changes' : 'Add Lead'}</button>
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
const iconBtn = { background:'none', border:'none', cursor:'pointer', fontSize:13, padding:'2px 6px', color:'#2563eb' };
const panel = { position:'fixed', right:0, top:56, width:340, height:'calc(100vh - 56px)', background:'#fff', boxShadow:'-4px 0 20px rgba(0,0,0,.12)', padding:24, overflowY:'auto', zIndex:100 };
const modalOverlay = { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' };
const modalBox = { background:'#fff', borderRadius:12, padding:28, width:600, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 16px 48px rgba(0,0,0,0.2)' };
const labelStyle = { display:'block', fontSize:12, color:'#64748b', fontWeight:600, marginBottom:4 };
const inputStyle = { width:'100%', padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, boxSizing:'border-box' };
const toggleBtn = { padding:'6px 14px', background:'#f1f5f9', color:'#64748b', border:'1px solid #e2e8f0', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:600 };
const toggleBtnActive = { background:'#2563eb', color:'#fff', border:'1px solid #2563eb' };

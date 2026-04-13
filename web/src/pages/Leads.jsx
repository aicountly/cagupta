import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getLeads, createLead, updateLead } from '../services/leadService';
import { createContact } from '../services/contactService';
import { getOrganizations, createOrganization } from '../services/organizationService';
import ClientSearchDropdown from '../components/common/ClientSearchDropdown';
import DateInput from '../components/common/DateInput';
import { useStaffUsers } from '../hooks/useStaffUsers';
import StatusBadge from '../components/common/StatusBadge';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../auth/AuthContext';
import {
  getQuotationDefaults,
  getQuotationDefaultByEngagementType,
  getQuotationPendingSummary,
  getLeadQuotations,
  createLeadQuotation,
  updateLeadQuotation,
} from '../services/quotationService';

const stages = ['new','contacted','qualified','proposal_sent','negotiation','won','lost'];

const emptyLeadForm = {
  clientType: 'contact', // 'contact' | 'organization' — mutually exclusive client
  contactId: null, contactName: '', contactMode: 'existing',
  newContactName: '', newContactEmail: '', newContactPhone: '',
  organizationId: null, organizationName: '', organizationMode: 'existing',
  newOrgName: '', newOrgEmail: '', newOrgPhone: '',
  company: '', email: '', phone: '',
  source: 'Referral', stage: 'new', estimatedValue: '',
  assignedTo: '', nextFollowUp: '', notes: '',
  engagementTypeId: null, engagementTypeName: '',
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
  const { hasPermission } = useAuth();

  const [engTypes, setEngTypes] = useState([]);
  const [pendingSummary, setPendingSummary] = useState(null);

  const [quoteModal, setQuoteModal] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quotePrice, setQuotePrice] = useState('');
  const [quoteDocs, setQuoteDocs] = useState('');
  const [quoteStatus, setQuoteStatus] = useState('draft');
  const [quoteEngId, setQuoteEngId] = useState(null);
  const [quoteEditId, setQuoteEditId] = useState(null);
  const [quoteSaving, setQuoteSaving] = useState(false);
  const [quoteMsg, setQuoteMsg] = useState('');

  useEffect(() => {
    setLoading(true);
    getLeads()
      .then(data => setLeads(data))
      .catch(() => setLeads([]))
      .finally(() => setLoading(false));
    getOrganizations()
      .then(data => setOrganizations(data))
      .catch(() => setOrganizations([]));
    getQuotationDefaults()
      .then(rows => setEngTypes([...rows].sort((a, b) =>
        `${a.category_name} ${a.engagement_type_name}`.localeCompare(`${b.category_name} ${b.engagement_type_name}`),
      )))
      .catch(() => setEngTypes([]));
    getQuotationPendingSummary()
      .then(setPendingSummary)
      .catch(() => setPendingSummary(null));
  }, []);

  const needingQuotationIds = new Set(pendingSummary?.lead_ids_needing_quotation || pendingSummary?.sample_lead_ids_needing_quotation || []);

  async function refreshPendingSummary() {
    try {
      setPendingSummary(await getQuotationPendingSummary());
    } catch { /* ignore */ }
  }

  async function openQuotationModal(lead) {
    setQuoteModal(lead);
    setQuoteLoading(true);
    setQuoteMsg('');
    try {
      const qs = await getLeadQuotations(lead.id);
      let engId = lead.engagementTypeId || null;
      const draft = qs.find(q => q.status === 'draft');
      if (draft) {
        setQuoteEditId(draft.id);
        setQuotePrice(draft.price != null ? String(draft.price) : '');
        setQuoteDocs(Array.isArray(draft.documents_required) ? draft.documents_required.join('\n') : '');
        setQuoteStatus(draft.status);
        setQuoteEngId(draft.engagement_type_id || engId);
      } else {
        setQuoteEditId(null);
        setQuoteEngId(engId);
        if (engId) {
          const def = await getQuotationDefaultByEngagementType(engId);
          setQuotePrice(def?.default_price != null ? String(def.default_price) : '');
          setQuoteDocs(Array.isArray(def?.documents_required) ? def.documents_required.join('\n') : '');
        } else {
          setQuotePrice('');
          setQuoteDocs('');
        }
        setQuoteStatus('draft');
      }
    } catch (e) {
      setQuoteMsg(e.message || 'Could not load quotation data.');
    } finally {
      setQuoteLoading(false);
    }
  }

  async function handleSaveQuotation() {
    if (!quoteModal || !hasPermission('quotations.manage')) return;
    setQuoteSaving(true);
    setQuoteMsg('');
    try {
      const docs = quoteDocs.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const payload = {
        engagement_type_id: quoteEngId || null,
        price: quotePrice === '' || quotePrice == null ? null : Number(quotePrice),
        documents_required: docs,
        status: quoteStatus,
      };
      if (quoteEditId) {
        await updateLeadQuotation(quoteModal.id, quoteEditId, payload);
      } else {
        await createLeadQuotation(quoteModal.id, payload);
      }
      addNotification('Quotation saved', 'lead');
      await refreshPendingSummary();
      setQuoteModal(null);
    } catch (e) {
      setQuoteMsg(e.message || 'Save failed.');
    } finally {
      setQuoteSaving(false);
    }
  }

  function handleShareQuotation() {
    if (!quoteModal) return;
    const lines = [
      `Quotation for ${quoteModal.contactName}`,
      quoteEngId ? `Engagement type ID: ${quoteEngId}` : '',
      `Price: ${quotePrice ? `₹${Number(quotePrice).toLocaleString('en-IN')}` : '—'}`,
      'Documents required:',
      ...quoteDocs.split(/\r?\n/).filter(s => s.trim()),
    ].filter(Boolean);
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      addNotification('Quotation copied to clipboard', 'lead');
    }).catch(() => {
      addNotification('Could not copy — select and copy manually.', 'warning');
    });
  }

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
      organizationMode: 'existing',
      newOrgName: '', newOrgEmail: '', newOrgPhone: '',
      organizationId: ct === 'organization' ? l.organizationId || null : null,
      organizationName: orgName,
      company: l.company || '', email: l.email || '', phone: l.phone || '',
      source: l.source, stage: l.stage,
      estimatedValue: l.estimatedValue || '',
      assignedTo: l.assignedTo || '',
      nextFollowUp: l.nextFollowUp || '',
      notes: l.notes || '',
      engagementTypeId: l.engagementTypeId || null,
      engagementTypeName: l.engagementTypeName || '',
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
        organizationMode: 'existing',
        newOrgName: '', newOrgEmail: '', newOrgPhone: '',
        organizationId: ct === 'organization' ? l.organizationId || null : null,
        organizationName: orgName,
        company: l.company || '', email: l.email || '', phone: l.phone || '',
        source: l.source, stage: l.stage,
        estimatedValue: l.estimatedValue || '',
        assignedTo: l.assignedTo || '',
        nextFollowUp: l.nextFollowUp || '',
        notes: l.notes || '',
        engagementTypeId: l.engagementTypeId || null,
        engagementTypeName: l.engagementTypeName || '',
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
          organizationMode: 'existing',
          newOrgName: '',
          newOrgEmail: '',
          newOrgPhone: '',
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
        organizationMode: 'existing',
        newOrgName: '',
        newOrgEmail: '',
        newOrgPhone: '',
      };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (form.clientType === 'organization') {
      if (form.organizationMode === 'existing' && !form.organizationId) {
        addNotification('Select an organization, or create a new one, or switch to Person (contact).', 'warning');
        return;
      }
      if (form.organizationMode === 'new' && !form.newOrgName.trim()) {
        addNotification('Enter the new organization’s name.', 'warning');
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
      if (form.organizationMode === 'new' && form.newOrgName.trim()) {
        try {
          const newOrg = await createOrganization({
            displayName: form.newOrgName.trim(),
            email: form.newOrgEmail.trim() || undefined,
            phone: form.newOrgPhone.trim() || undefined,
            status: 'active',
          });
          organizationId = newOrg.id;
          contactNameForApi = newOrg.displayName;
          setOrganizations(prev =>
            prev.some(o => o.id === newOrg.id) ? prev : [...prev, newOrg],
          );
        } catch {
          addNotification('Could not create the organization. Fix any errors and try again.', 'warning');
          return;
        }
      } else {
        organizationId = form.organizationId;
        contactNameForApi =
          form.organizationName ||
          organizations.find(o => o.id === form.organizationId)?.displayName ||
          '';
      }
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
        {[['pipeline','Kanban Pipeline'],['list','List View'],['pending','Pending & setup']].map(([t,l])=>(
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
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:6 }}>
                    <div style={{ fontWeight:600, fontSize:13, color:'#1e293b' }}>{l.contactName}</div>
                    {needingQuotationIds.has(l.id) && (
                      <span title="No final quotation yet" style={{ fontSize:10, fontWeight:700, background:'#fef3c7', color:'#92400e', padding:'2px 6px', borderRadius:4, flexShrink:0 }}>QUOTE</span>
                    )}
                  </div>
                  {l.company && <div style={{ fontSize:12, color:'#64748b' }}>{l.company}</div>}
                  <div style={{ fontSize:12, color:'#2563eb', marginTop:4 }}>₹{l.estimatedValue?.toLocaleString('en-IN')}</div>
                  <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>Follow-up: {l.nextFollowUp}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {tab==='pending' && (
        <div style={cardStyle}>
          {loading && <div style={{ padding:16, color:'#64748b' }}>Loading…</div>}
          {!loading && pendingSummary && (
            <div style={{ padding:8 }}>
              <h3 style={{ margin:'0 0 12px', fontSize:15, fontWeight:700 }}>Quotation &amp; setup status</h3>
              <ul style={{ margin:0, paddingLeft:20, fontSize:14, color:'#334155', lineHeight:1.7 }}>
                <li><strong>{pendingSummary.engagement_types_incomplete}</strong> engagement type(s) still need a default price or document list (configure under Settings → Service Configuration).</li>
                <li><strong>{pendingSummary.leads_needing_final_quotation}</strong> lead(s) in <em>Qualified</em> or <em>Proposal sent</em> have no final quotation saved yet.</li>
              </ul>
              {pendingSummary.lead_ids_needing_quotation?.length > 0 && (
                <div style={{ marginTop:16 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:8 }}>Open a lead</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {pendingSummary.lead_ids_needing_quotation.slice(0, 24).map(id => {
                      const lead = leads.find(x => x.id === id);
                      return (
                        <button
                          key={id}
                          type="button"
                          style={{ ...btnModalSecondary, fontSize:12 }}
                          onClick={() => {
                            const l = leads.find(x => x.id === id);
                            if (l) setSelected(l);
                          }}
                        >
                          {lead ? lead.contactName : `Lead #${id}`}
                        </button>
                      );
                    })}
                  </div>
                  {pendingSummary.leads_needing_final_quotation > 24 && (
                    <p style={{ fontSize:12, color:'#94a3b8', marginTop:8 }}>Showing first 24; filter the list by stage for the rest.</p>
                  )}
                </div>
              )}
            </div>
          )}
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
                    <button
                      type="button"
                      style={iconBtn}
                      onClick={(e) => { e.stopPropagation(); openQuotationModal(l); }}
                    >
                      📄 Quotation
                    </button>
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
          {[['Company',selected.company||'—'],['Email',selected.email],['Phone',selected.phone],['Source',selected.source],['Stage',<StatusBadge key="s" status={selected.stage} />],['Probability',`${selected.probability}%`],['Est. Value',`₹${selected.estimatedValue?.toLocaleString('en-IN')}`],['Assigned To',selected.assignedTo],['Follow-up',selected.nextFollowUp],['Engagement', selected.engagementTypeName || '—']].map(([k,v])=>(
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f1f5f9', fontSize:13 }}>
              <span style={{ color:'#64748b', fontWeight:600 }}>{k}</span>
              <span>{v}</span>
            </div>
          ))}
          <button
            type="button"
            style={{ ...btnPrimary, width:'100%', marginTop:16 }}
            onClick={() => openQuotationModal(selected)}
          >
            📄 Create / edit quotation
          </button>
        </div>
      )}

      {quoteModal && (
        <div style={{ ...modalOverlay, zIndex: 600 }}>
          <div style={{ ...modalBox, maxWidth: 520 }}>
            <div style={modalHeader}>
              <div>
                <h3 style={modalTitle}>Quotation — {quoteModal.contactName}</h3>
                <p style={modalSubtitle}>Pre-filled from setup defaults when an engagement type is set; adjust per lead.</p>
              </div>
              <button type="button" onClick={() => setQuoteModal(null)} style={btnModalClose} aria-label="Close">✕</button>
            </div>
            <div style={{ ...modalFormBody, paddingBottom: 16 }}>
              {quoteLoading && <div style={{ color:'#64748b', fontSize:13 }}>Loading…</div>}
              {!quoteLoading && (
                <>
                  <label style={labelStyle}>Engagement type</label>
                  <select
                    value={quoteEngId || ''}
                    onChange={async (e) => {
                      const v = e.target.value;
                      const id = v ? Number(v) : null;
                      setQuoteEngId(id);
                      if (id) {
                        try {
                          const def = await getQuotationDefaultByEngagementType(id);
                          setQuotePrice(def?.default_price != null ? String(def.default_price) : '');
                          setQuoteDocs(Array.isArray(def?.documents_required) ? def.documents_required.join('\n') : '');
                        } catch { /* ignore */ }
                      }
                    }}
                    style={{ ...inputStyle, marginBottom:12 }}
                  >
                    <option value="">— Select —</option>
                    {engTypes.map(t => (
                      <option key={t.engagement_type_id} value={t.engagement_type_id}>
                        {t.category_name}{t.subcategory_name ? ` / ${t.subcategory_name}` : ''} — {t.engagement_type_name}
                      </option>
                    ))}
                  </select>
                  <label style={labelStyle}>Price (₹)</label>
                  <input type="number" value={quotePrice} onChange={e => setQuotePrice(e.target.value)} style={{ ...inputStyle, marginBottom:12 }} />
                  <label style={labelStyle}>Documents required (one per line)</label>
                  <textarea value={quoteDocs} onChange={e => setQuoteDocs(e.target.value)} style={{ ...inputStyle, minHeight:100, marginBottom:12 }} />
                  <label style={labelStyle}>Status</label>
                  <select value={quoteStatus} onChange={e => setQuoteStatus(e.target.value)} style={{ ...inputStyle, marginBottom:12 }}>
                    <option value="draft">Draft</option>
                    <option value="final">Final</option>
                    <option value="sent">Sent</option>
                  </select>
                  {quoteMsg && <div style={{ fontSize:12, color:'#dc2626', marginBottom:8 }}>{quoteMsg}</div>}
                </>
              )}
            </div>
            <div style={modalFooter}>
              <button type="button" style={btnModalSecondary} onClick={handleShareQuotation}>Copy text</button>
              <button type="button" style={btnModalSecondary} onClick={() => setQuoteModal(null)}>Close</button>
              {hasPermission('quotations.manage') && (
                <button type="button" style={btnPrimary} disabled={quoteSaving || quoteLoading} onClick={handleSaveQuotation}>
                  {quoteSaving ? 'Saving…' : 'Save quotation'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showNewLeadModal && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <div style={modalHeader}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={modalTitle}>{editLeadId ? 'Edit Lead' : 'New Lead'}</h3>
                <p style={modalSubtitle}>Link a person or organization, then save pipeline details.</p>
              </div>
              <button type="button" onClick={() => setShowNewLeadModal(false)} style={btnModalClose} aria-label="Close">✕</button>
            </div>
            <form id="lead-modal-form" onSubmit={handleSubmit} style={modalFormBody}>
              <div style={{ overflowY:'auto', flex:1, minHeight:0, paddingBottom:4 }}>
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
                  <div style={{ display:'flex', gap:8, marginBottom:8, flexWrap:'wrap' }}>
                    <button type="button" onClick={() => setForm(v => ({
                      ...v,
                      organizationMode: 'existing',
                      newOrgName: '',
                      newOrgEmail: '',
                      newOrgPhone: '',
                    }))}
                      style={{ ...toggleBtn, ...(form.organizationMode==='existing' ? toggleBtnActive : {}) }}>
                      Select existing
                    </button>
                    <button type="button" onClick={() => setForm(v => ({ ...v, organizationMode:'new', organizationId:null, organizationName:'' }))}
                      style={{ ...toggleBtn, ...(form.organizationMode==='new' ? toggleBtnActive : {}) }}>
                      Create new organization
                    </button>
                  </div>
                  {form.organizationMode === 'existing' ? (
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
                  ) : (
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:8 }}>
                      <div>
                        <label style={labelStyle}>Organization name <span style={{ color:'#ef4444' }}>*</span></label>
                        <input value={form.newOrgName} onChange={e => setForm(v => ({ ...v, newOrgName:e.target.value }))} style={inputStyle} placeholder="Legal or trading name" />
                      </div>
                      <div>
                        <label style={labelStyle}>Email</label>
                        <input type="email" value={form.newOrgEmail} onChange={e => setForm(v => ({ ...v, newOrgEmail:e.target.value }))} style={inputStyle} placeholder="billing@company.com" />
                      </div>
                      <div>
                        <label style={labelStyle}>Phone</label>
                        <input value={form.newOrgPhone} onChange={e => setForm(v => ({ ...v, newOrgPhone:e.target.value }))} style={inputStyle} placeholder="+91 …" />
                      </div>
                    </div>
                  )}
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
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Engagement type (for quotations)</label>
                  <select
                    value={form.engagementTypeId || ''}
                    onChange={e => {
                      const v = e.target.value;
                      const id = v ? Number(v) : null;
                      const row = id ? engTypes.find(t => t.engagement_type_id === id) : null;
                      setForm(prev => ({
                        ...prev,
                        engagementTypeId: id,
                        engagementTypeName: row?.engagement_type_name || '',
                      }));
                    }}
                    style={inputStyle}
                  >
                    <option value="">— Optional —</option>
                    {engTypes.map(t => (
                      <option key={t.engagement_type_id} value={t.engagement_type_id}>
                        {t.category_name}{t.subcategory_name ? ` / ${t.subcategory_name}` : ''} — {t.engagement_type_name}
                      </option>
                    ))}
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
                  <DateInput value={form.nextFollowUp} onChange={e=>setForm(v=>({...v,nextFollowUp:e.target.value}))} style={inputStyle} />
                </div>
              </div>
              </div>
              <div style={modalFooter}>
                <button type="button" onClick={() => setShowNewLeadModal(false)} style={btnModalSecondary}>Cancel</button>
                <button type="submit" style={btnPrimary}>{editLeadId ? 'Save changes' : 'Add lead'}</button>
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
const iconBtn = { background:'none', border:'none', cursor:'pointer', fontSize:13, padding:'2px 6px', color:'#2563eb' };
const panel = { position:'fixed', right:0, top:56, width:340, height:'calc(100vh - 56px)', background:'#fff', boxShadow:'-4px 0 20px rgba(0,0,0,.12)', padding:24, overflowY:'auto', zIndex:100 };
const modalOverlay = { position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:16 };
const modalBox = { background:'#fff', borderRadius:14, width:'min(720px, 100%)', maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 25px 50px -12px rgba(15,23,42,0.25)', border:'1px solid #e2e8f0' };
const modalHeader = { display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, padding:'18px 22px', background:'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)', borderBottom:'1px solid #e2e8f0', flexShrink:0 };
const modalTitle = { margin:0, fontSize:17, fontWeight:700, color:'#0f172a', letterSpacing:'-0.02em' };
const modalSubtitle = { margin:'4px 0 0', fontSize:12, color:'#64748b', lineHeight:1.4, maxWidth:320 };
const btnModalSecondary = { padding:'8px 14px', background:'#fff', color:'#475569', border:'1px solid #cbd5e1', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600 };
const btnModalClose = { flexShrink:0, width:36, height:36, padding:0, background:'#fff', color:'#64748b', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', fontSize:16, lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center' };
const modalFormBody = { padding:'20px 22px 0', overflowY:'auto', flex:1, display:'flex', flexDirection:'column', minHeight:0 };
const modalFooter = { display:'flex', justifyContent:'flex-end', alignItems:'center', gap:8, flexShrink:0, marginTop:'auto', padding:'16px 22px 22px', borderTop:'1px solid #e2e8f0', background:'#fafbfc' };
const labelStyle = { display:'block', fontSize:12, color:'#64748b', fontWeight:600, marginBottom:4 };
const inputStyle = { width:'100%', padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, boxSizing:'border-box' };
const toggleBtn = { padding:'6px 14px', background:'#f1f5f9', color:'#64748b', border:'1px solid #e2e8f0', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:600 };
const toggleBtnActive = { background:'#2563eb', color:'#fff', border:'1px solid #2563eb' };

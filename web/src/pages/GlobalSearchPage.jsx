import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getContacts } from '../services/contactService';
import { getOrganizationsForSearch } from '../services/organizationService';
import { getEngagements } from '../services/engagementService';
import { getLeads } from '../services/leadService';
import { getTxns } from '../services/txnService';
import { getAppointments } from '../services/appointmentService';

const TYPE_ICONS = {
  contact: '👤',
  organization: '🏢',
  service: '📋',
  lead: '🎯',
  invoice: '🧾',
  appointment: '📅',
};

const SECTION_LABELS = {
  contact: 'Contacts',
  organization: 'Organizations',
  service: 'Services & tasks',
  lead: 'Leads',
  invoice: 'Invoices',
  appointment: 'Calendar',
};

function matchesQuery(q, parts) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return parts.some(p => String(p || '').toLowerCase().includes(s));
}

function openRecord(navigate, type, id) {
  const n = encodeURIComponent(String(id));
  switch (type) {
    case 'contact':
      navigate(`/clients/contacts/${id}/edit`);
      break;
    case 'organization':
      navigate(`/clients/organizations/${id}/edit`);
      break;
    case 'service':
      navigate(`/services?openService=${n}`);
      break;
    case 'lead':
      navigate(`/leads?openLead=${n}`);
      break;
    case 'invoice':
      navigate(`/invoices?openTxn=${n}`);
      break;
    case 'appointment':
      navigate(`/calendar?openAppointment=${n}`);
      break;
    default:
      break;
  }
}

export default function GlobalSearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qParam = searchParams.get('q') || '';
  const highlightParam = searchParams.get('highlight') || '';

  const [input, setInput] = useState(qParam);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [services, setServices] = useState([]);
  const [leads, setLeads] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [appointments, setAppointments] = useState([]);

  const effectiveQuery = input.trim();

  const runSearch = useCallback(async (raw) => {
    const q = raw.trim();
    if (q.length < 2) {
      setContacts([]);
      setOrganizations([]);
      setServices([]);
      setLeads([]);
      setInvoices([]);
      setAppointments([]);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [c, o, s, l, inv, appt] = await Promise.all([
        getContacts({ search: q, perPage: 50 }).catch(() => []),
        getOrganizationsForSearch(q, 50).catch(() => []),
        getEngagements({ search: q, perPage: 50 }).catch(() => []),
        getLeads({ search: q, perPage: 50 }).catch(() => []),
        getTxns({ txnType: 'invoice', search: q, perPage: 50 }).then(r => r.txns).catch(() => []),
        getAppointments({ search: q, perPage: 50 }).catch(() => []),
      ]);
      setContacts(Array.isArray(c) ? c : []);
      setOrganizations(Array.isArray(o) ? o : []);
      setServices(Array.isArray(s) ? s : []);
      setLeads(Array.isArray(l) ? l : []);
      setInvoices(Array.isArray(inv) ? inv : []);
      setAppointments(Array.isArray(appt) ? appt : []);
    } catch (e) {
      setError(e.message || 'Search failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setInput(qParam);
  }, [qParam]);

  useEffect(() => {
    runSearch(effectiveQuery);
  }, [effectiveQuery, runSearch]);

  useEffect(() => {
    if (!highlightParam || loading) return;
    const [t, idStr] = highlightParam.split(':');
    if (!t || !idStr) return;
    const el = document.getElementById(`search-hit-${t}-${idStr}`);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [highlightParam, loading, contacts, organizations, services, leads, invoices, appointments]);

  function applyUrlQuery(nextQ, nextHighlight) {
    const p = new URLSearchParams();
    if (nextQ.trim()) p.set('q', nextQ.trim());
    if (nextHighlight) p.set('highlight', nextHighlight);
    setSearchParams(p, { replace: true });
  }

  function handleSubmit(e) {
    e.preventDefault();
    applyUrlQuery(input, '');
  }

  const sections = useMemo(() => {
    const q = effectiveQuery;
    if (q.length < 2) return [];
    const out = [];
    const cFiltered = contacts.filter(c =>
      matchesQuery(q, [
        c.displayName,
        c.city,
        c.clientCode,
        c.pan,
        c.mobile,
        c.organisation,
        ...(c.linkedOrgNames || []),
      ]),
    );
    if (cFiltered.length) out.push({ type: 'contact', label: SECTION_LABELS.contact, rows: cFiltered });

    const oFiltered = organizations.filter(o =>
      matchesQuery(q, [o.displayName, o.city, o.clientCode, o.pan, o.email]),
    );
    if (oFiltered.length) out.push({ type: 'organization', label: SECTION_LABELS.organization, rows: oFiltered });

    const sFiltered = services.filter(s =>
      matchesQuery(q, [s.clientName, s.type, s.financialYear, s.engagementTypeName, s.categoryName]),
    );
    if (sFiltered.length) out.push({ type: 'service', label: SECTION_LABELS.service, rows: sFiltered });

    const lFiltered = leads.filter(l =>
      matchesQuery(q, [l.contactName, l.company, l.email, l.phone, l.source]),
    );
    if (lFiltered.length) out.push({ type: 'lead', label: SECTION_LABELS.lead, rows: lFiltered });

    const iFiltered = invoices.filter(i =>
      matchesQuery(q, [i.invoiceNumber, i.clientName, i.narration]),
    );
    if (iFiltered.length) out.push({ type: 'invoice', label: SECTION_LABELS.invoice, rows: iFiltered });

    const aFiltered = appointments.filter(a =>
      matchesQuery(q, [a.clientName, a.subject, a.staffName, a.date]),
    );
    if (aFiltered.length) out.push({ type: 'appointment', label: SECTION_LABELS.appointment, rows: aFiltered });

    return out;
  }, [effectiveQuery, contacts, organizations, services, leads, invoices, appointments]);

  function rowSublabel(type, row) {
    switch (type) {
      case 'contact':
        return [row.city, row.clientCode].filter(Boolean).join(' · ') || 'Contact';
      case 'organization':
        return [row.city, row.clientCode].filter(Boolean).join(' · ') || 'Organization';
      case 'service':
        return [row.type, row.financialYear].filter(Boolean).join(' · ') || 'Engagement';
      case 'lead':
        return [row.company, row.stage].filter(Boolean).join(' · ') || 'Lead';
      case 'invoice':
        return [row.clientName, row.invoiceNumber || `INV-${row.id}`].filter(Boolean).join(' · ');
      case 'appointment':
        return [row.date, row.startTime].filter(Boolean).join(' ') || 'Appointment';
      default:
        return '';
    }
  }

  function rowLabel(type, row) {
    switch (type) {
      case 'contact':
        return row.displayName;
      case 'organization':
        return row.displayName;
      case 'service':
        return row.clientName || 'Service';
      case 'lead':
        return row.contactName || 'Lead';
      case 'invoice':
        return row.invoiceNumber || `Invoice #${row.id}`;
      case 'appointment':
        return row.subject || row.clientName || 'Appointment';
      default:
        return '';
    }
  }

  const totalHits = sections.reduce((n, s) => n + s.rows.length, 0);

  return (
    <div style={{ padding: 24, background: '#F6F7FB', minHeight: '100%' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#0B1F3B' }}>Search</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>
        Find contacts, organizations, services, leads, invoices, and appointments in one place. Open a row to go to that record.
      </p>

      <form onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Search by name, code, invoice #, subject…"
            style={{
              flex: 1,
              minWidth: 260,
              maxWidth: 560,
              padding: '10px 14px',
              border: '1px solid #E6E8F0',
              borderRadius: 10,
              fontSize: 14,
              background: '#fff',
              outline: 'none',
            }}
            autoFocus
          />
          <button
            type="submit"
            style={{
              padding: '10px 20px',
              background: '#F37920',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Search
          </button>
        </div>
      </form>

      {effectiveQuery.length > 0 && effectiveQuery.length < 2 && (
        <div style={{ fontSize: 13, color: '#94a3b8' }}>Type at least 2 characters to search.</div>
      )}

      {loading && <div style={{ fontSize: 13, color: '#64748b' }}>Searching…</div>}
      {error && <div style={{ fontSize: 13, color: '#dc2626' }}>{error}</div>}

      {!loading && effectiveQuery.length >= 2 && !error && totalHits === 0 && (
        <div style={{ fontSize: 14, color: '#94a3b8', padding: '24px 0' }}>No results for &ldquo;{effectiveQuery}&rdquo;.</div>
      )}

      {!loading && sections.map(section => (
        <div key={section.type} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            {section.label} <span style={{ fontWeight: 600, color: '#94a3b8' }}>({section.rows.length})</span>
          </div>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E6E8F0', overflow: 'hidden' }}>
            {section.rows.map(row => {
              const id = row.id;
              const hl = `${section.type}:${id}` === highlightParam;
              return (
                <button
                  key={`${section.type}-${id}`}
                  type="button"
                  id={`search-hit-${section.type}-${id}`}
                  onClick={() => openRecord(navigate, section.type, id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 14px',
                    border: 'none',
                    borderBottom: '1px solid #f1f5f9',
                    background: hl ? '#FEF0E6' : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{TYPE_ICONS[section.type]}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {rowLabel(section.type, row)}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {rowSublabel(section.type, row)}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: '#F37920', fontWeight: 600, flexShrink: 0 }}>Open →</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { Inbox, Mail, Search, MailOpen, CheckCircle, UserPlus, AlertCircle, Send, RefreshCw } from 'lucide-react';
import {
  fetchInboundEmails, fetchSupportTickets, fetchSupportTicket,
  pickTicket, replyTicket, resolveTicket, patchInboundEmail,
} from '../../../services/inboxService';

const STATUS_COLORS = {
  open: { bg: '#DBEAFE', color: '#1E40AF' },
  in_progress: { bg: '#FEF3C7', color: '#92400E' },
  resolved: { bg: '#DCFCE7', color: '#166534' },
  closed: { bg: '#F1F5F9', color: '#64748b' },
};

function TicketStatus({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.open;
  return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: s.bg, color: s.color, textTransform: 'capitalize' }}>{(status || 'open').replace(/_/g, ' ')}</span>;
}

export default function InboxAndTickets() {
  const [tab, setTab] = useState('tickets');
  const [emails, setEmails] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [selTicket, setSelTicket] = useState(null);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [actionBusy, setActionBusy] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setErr('');
    const p = tab === 'emails'
      ? fetchInboundEmails({ page: 1, perPage: 50 }).then((r) => setEmails(r.rows))
      : fetchSupportTickets({ page: 1, perPage: 50 }).then((r) => setTickets(r.rows));
    p.catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const openTicket = (id) => {
    fetchSupportTicket(id).then(setSelTicket).catch((e) => setErr(e.message));
  };

  async function handlePick() {
    if (!selTicket) return;
    setActionBusy('pick');
    try { await pickTicket(selTicket.id); openTicket(selTicket.id); load(); }
    catch (e) { setErr(e.message); }
    finally { setActionBusy(''); }
  }

  async function handleResolve() {
    if (!selTicket) return;
    setActionBusy('resolve');
    try { await resolveTicket(selTicket.id, { status: 'resolved', resolution_notes: '' }); openTicket(selTicket.id); load(); }
    catch (e) { setErr(e.message); }
    finally { setActionBusy(''); }
  }

  async function handleReply() {
    if (!selTicket || !reply.trim()) return;
    setActionBusy('reply');
    try { await replyTicket(selTicket.id, { text: reply.trim(), html: '' }); setReply(''); openTicket(selTicket.id); }
    catch (e) { setErr(e.message); }
    finally { setActionBusy(''); }
  }

  const filteredTickets = tickets.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (t.public_id || '').toLowerCase().includes(q) || (t.subject || '').toLowerCase().includes(q);
  });

  const filteredEmails = emails.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.subject || '').toLowerCase().includes(q) || (e.from_email || '').toLowerCase().includes(q);
  });

  return (
    <div style={pageWrap}>
      {/* Header */}
      <div style={headerCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={iconWrap}><Inbox size={20} color="#F37920" /></div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0B1F3B' }}>Inbox & Tickets</h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>
              Manage support tickets and inbound emails
            </p>
          </div>
        </div>
        <button type="button" onClick={load} style={btnRefresh}><RefreshCw size={14} /> Refresh</button>
      </div>

      {err && <div style={errorBanner}><AlertCircle size={14} /> {err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, minHeight: 500 }}>
        {/* Left panel: list */}
        <div style={panelCard}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9' }}>
            <button type="button" onClick={() => { setTab('tickets'); setSelTicket(null); }} style={tabBtn(tab === 'tickets')}>
              <Inbox size={13} /> Tickets
            </button>
            <button type="button" onClick={() => { setTab('emails'); setSelTicket(null); }} style={tabBtn(tab === 'emails')}>
              <Mail size={13} /> Inbound Mail
            </button>
          </div>

          {/* Search */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #F8FAFC', position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text" placeholder={tab === 'tickets' ? 'Search tickets...' : 'Search emails...'}
              value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 34 }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 450 }}>
            {loading && <div style={emptyState}>Loading...</div>}

            {!loading && tab === 'tickets' && filteredTickets.length === 0 && <div style={emptyState}>No tickets found</div>}
            {!loading && tab === 'tickets' && filteredTickets.map((t) => (
              <button key={t.id} type="button" onClick={() => openTicket(t.id)} style={{ ...listItem, background: selTicket?.id === t.id ? '#FFF7ED' : '#fff', borderLeft: selTicket?.id === t.id ? '3px solid #F37920' : '3px solid transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#0B1F3B' }}>{t.public_id}</span>
                  <TicketStatus status={t.status} />
                </div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{t.subject || '(No subject)'}</div>
                {t.client_name && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{t.client_name}</div>}
              </button>
            ))}

            {!loading && tab === 'emails' && filteredEmails.length === 0 && <div style={emptyState}>No emails found</div>}
            {!loading && tab === 'emails' && filteredEmails.map((e) => (
              <div key={e.id} style={{ ...listItem, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#0B1F3B', flex: 1 }}>{e.subject || '(no subject)'}</span>
                  {!e.read && <span style={{ width: 8, height: 8, borderRadius: 4, background: '#F37920', flexShrink: 0, marginTop: 4 }} />}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{e.from_email}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{e.received_at}</div>
                {!e.read && (
                  <button type="button" onClick={() => patchInboundEmail(e.id, { read: true }).then(load)} style={btnSmGhost}>
                    <MailOpen size={11} /> Mark Read
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right panel: detail */}
        <div style={panelCard}>
          {!selTicket && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', gap: 12 }}>
              <Inbox size={40} color="#E2E8F0" />
              <div style={{ fontSize: 14 }}>Select a ticket to view details</div>
            </div>
          )}
          {selTicket && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Ticket header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0B1F3B' }}>{selTicket.public_id}</h2>
                  <TicketStatus status={selTicket.status} />
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  {selTicket.subject || '—'}
                  {selTicket.picked_by_name && <span style={{ marginLeft: 10 }}>· Assigned: {selTicket.picked_by_name}</span>}
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="button" onClick={handlePick} disabled={!!actionBusy} style={actionBtn}>
                    <UserPlus size={13} /> {actionBusy === 'pick' ? '...' : 'Pick'}
                  </button>
                  <button type="button" onClick={handleResolve} disabled={!!actionBusy} style={{ ...actionBtn, background: '#16A34A', boxShadow: '0 2px 6px rgba(22,163,106,0.2)' }}>
                    <CheckCircle size={13} /> {actionBusy === 'resolve' ? '...' : 'Resolve'}
                  </button>
                </div>
              </div>

              {/* Messages thread */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {(selTicket.messages || []).length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>No messages yet.</div>}
                {(selTicket.messages || []).map((m) => {
                  const isInbound = m.direction === 'inbound';
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: isInbound ? 'flex-start' : 'flex-end', marginBottom: 12 }}>
                      <div style={{
                        maxWidth: '75%', padding: '10px 14px', borderRadius: 12,
                        background: isInbound ? '#F8FAFC' : '#FFF7ED',
                        border: `1px solid ${isInbound ? '#E6E8F0' : '#FDE6CC'}`,
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: isInbound ? '#64748b' : '#F37920', marginBottom: 4 }}>
                          {isInbound ? 'Client' : (m.sent_by_name || 'Agent')}
                        </div>
                        <div style={{ fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                          {m.body_text || m.body_html || ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reply */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <textarea
                  value={reply} onChange={(e) => setReply(e.target.value)}
                  placeholder="Type your reply..."
                  rows={2}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #E6E8F0', fontSize: 13, resize: 'vertical', minHeight: 44, outline: 'none' }}
                />
                <button type="button" onClick={handleReply} disabled={!reply.trim() || !!actionBusy} style={{ ...actionBtn, padding: '10px 16px' }}>
                  <Send size={14} /> {actionBusy === 'reply' ? '...' : 'Send'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const pageWrap = { padding: 24, display: 'flex', flexDirection: 'column', gap: 20, background: '#F6F7FB', minHeight: '100%' };
const headerCard = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '20px 24px', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' };
const iconWrap = { width: 44, height: 44, borderRadius: 12, background: '#FEF0E6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const panelCard = { background: '#fff', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden', display: 'flex', flexDirection: 'column' };
const tabBtn = (active) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 18px', background: 'none', border: 'none', borderBottom: active ? '2px solid #F37920' : '2px solid transparent', color: active ? '#F37920' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer' });
const listItem = { width: '100%', textAlign: 'left', display: 'block', padding: '12px 16px', border: 'none', borderBottom: '1px solid #F8FAFC', cursor: 'pointer' };
const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E6E8F0', fontSize: 13, boxSizing: 'border-box', outline: 'none' };
const emptyState = { padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 };
const errorBanner = { display: 'flex', alignItems: 'center', gap: 8, background: '#FEE2E2', color: '#991B1B', borderRadius: 10, padding: '10px 16px', fontSize: 13 };
const btnRefresh = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #E6E8F0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const btnSmGhost = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: '1px solid #E6E8F0', background: '#fff', color: '#475569', fontWeight: 500, fontSize: 11, cursor: 'pointer', marginTop: 6 };
const actionBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#F37920', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 6px rgba(243,121,32,0.2)' };

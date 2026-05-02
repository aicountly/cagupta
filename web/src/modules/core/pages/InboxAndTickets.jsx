import { useEffect, useState } from 'react';
import {
  fetchInboundEmails, fetchSupportTickets, fetchSupportTicket, pickTicket, replyTicket, resolveTicket, patchInboundEmail,
} from '../../../services/inboxService';

export default function InboxAndTickets() {
  const [tab, setTab] = useState('tickets');
  const [emails, setEmails] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [selTicket, setSelTicket] = useState(null);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    setLoading(true);
    setErr('');
    const p = tab === 'emails'
      ? fetchInboundEmails({ page: 1, perPage: 50 }).then(r => setEmails(r.rows))
      : fetchSupportTickets({ page: 1, perPage: 50 }).then(r => setTickets(r.rows));
    p.catch(e => setErr(e.message)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tab]);

  const openTicket = (id) => {
    fetchSupportTicket(id).then(setSelTicket).catch(e => setErr(e.message));
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 20, alignItems: 'start' }}>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" onClick={() => setTab('tickets')} style={{ padding: '8px 12px', borderRadius: 8, border: tab === 'tickets' ? '2px solid #f97316' : '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Tickets</button>
          <button type="button" onClick={() => setTab('emails')} style={{ padding: '8px 12px', borderRadius: 8, border: tab === 'emails' ? '2px solid #f97316' : '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Inbound mail</button>
        </div>
        {err && <div style={{ color: '#dc2626', marginBottom: 8 }}>{err}</div>}
        {loading ? <div style={{ color: '#64748b' }}>Loading…</div> : null}
        {!loading && tab === 'emails' && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 480, overflowY: 'auto' }}>
            {emails.map((e) => (
              <li key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                <div style={{ fontWeight: 600 }}>{e.subject || '(no subject)'}</div>
                <div style={{ color: '#64748b' }}>{e.from_email} · {e.received_at}</div>
                <button type="button" style={{ marginTop: 6, fontSize: 12, cursor: 'pointer' }} onClick={() => patchInboundEmail(e.id, { read: true }).then(load)}>Mark read</button>
              </li>
            ))}
          </ul>
        )}
        {!loading && tab === 'tickets' && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 480, overflowY: 'auto' }}>
            {tickets.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => openTicket(t.id)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 8px', border: 'none', borderBottom: '1px solid #f1f5f9',
                    background: selTicket?.id === t.id ? '#fff7ed' : '#fff', cursor: 'pointer', fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{t.public_id}</div>
                  <div style={{ color: '#64748b' }}>{t.status} · {t.subject || '—'}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16, minHeight: 320 }}>
        {!selTicket && <div style={{ color: '#94a3b8' }}>Select a ticket.</div>}
        {selTicket && (
          <div>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{selTicket.public_id}</h2>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>{selTicket.status} {selTicket.picked_by_name ? `· ${selTicket.picked_by_name}` : ''}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              <button type="button" onClick={() => pickTicket(selTicket.id).then(() => openTicket(selTicket.id))} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>Pick</button>
              <button type="button" onClick={() => resolveTicket(selTicket.id, { status: 'resolved', resolution_notes: '' }).then(() => { openTicket(selTicket.id); load(); })} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>Resolve</button>
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 13, background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 12 }}>
              {(selTicket.messages || []).map((m) => (
                <div key={m.id} style={{ marginBottom: 10, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
                  <div style={{ fontWeight: 600 }}>{m.direction} {m.sent_by_name ? `· ${m.sent_by_name}` : ''}</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.body_text || m.body_html || ''}</div>
                </div>
              ))}
            </div>
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to sender…" rows={4} style={{ width: '100%', borderRadius: 8, border: '1px solid #e2e8f0', padding: 10, fontSize: 13 }} />
            <button
              type="button"
              onClick={() => reply && replyTicket(selTicket.id, { text: reply, html: '' }).then(() => { setReply(''); openTicket(selTicket.id); })}
              style={{ marginTop: 8, padding: '10px 16px', borderRadius: 8, background: '#f97316', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
            >
              Send reply
            </button>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 16 }}>Create a service from this request via Operations → New engagement and pass <code>source_support_ticket_id: {selTicket.id}</code> in the API payload (UI wiring optional).</p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, AlertCircle, ArrowLeft, MessageSquare } from 'lucide-react';
import { SUPER_ADMIN_EMAIL } from '../../../constants/config';
import { useAuth } from '../../../auth/AuthContext';
import { ROLES } from '../../../constants/roles';
import { searchChatAudit, fetchAuditConversationThread } from '../services/chatService';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

export default function ChatAuditPage({ backPath = '/desk/chat' }) {
  const { session } = useAuth();
  const user = session?.user;
  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN
    || String(user?.email || '').toLowerCase() === String(SUPER_ADMIN_EMAIL).toLowerCase();

  const [q, setQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [conversationType, setConversationType] = useState('');
  const [senderKind, setSenderKind] = useState('');
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, per_page: 50, total: 0 });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [selectedThread, setSelectedThread] = useState(null);

  const load = useCallback((page = 1) => {
    if (!isSuperAdmin) return;
    setLoading(true);
    setErr('');
    searchChatAudit({
      q, dateFrom, dateTo, conversationType, senderKind, page, perPage: 50,
    })
      .then(({ rows: r, pagination: p }) => {
        setRows(r);
        setPagination(p);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [q, dateFrom, dateTo, conversationType, senderKind, isSuperAdmin]);

  useEffect(() => { load(1); }, [load]);

  async function openThread(conversationId) {
    setLoading(true);
    try {
      const data = await fetchAuditConversationThread(conversationId);
      setSelectedThread(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: 24, color: '#B91C1C' }}>
        Super Admin access required to view chat audit logs.
      </div>
    );
  }

  return (
    <div>
      <div style={headerCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link to={backPath} style={backLink}><ArrowLeft size={16} /></Link>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0B1F3B' }}>Chat Audit Log</h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>
              Search and review all team chat messages (read-only)
            </p>
          </div>
        </div>
      </div>

      {err && <div style={errorBanner}><AlertCircle size={14} /> {err}</div>}

      <div style={filterCard}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search message text..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ ...input, paddingLeft: 34 }}
          />
        </div>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={input} />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={input} />
        <select value={conversationType} onChange={(e) => setConversationType(e.target.value)} style={input}>
          <option value="">All conversation types</option>
          <option value="client_support">Client support</option>
          <option value="dm">Direct messages</option>
          <option value="channel">Channels</option>
        </select>
        <select value={senderKind} onChange={(e) => setSenderKind(e.target.value)} style={input}>
          <option value="">All senders</option>
          <option value="client">Client</option>
          <option value="bot">Bot</option>
          <option value="staff">Staff</option>
        </select>
        <button type="button" onClick={() => load(1)} style={btnPrimary}>Search</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedThread ? '1fr 400px' : '1fr', gap: 20 }}>
        <div style={panelCard}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13 }}>
            {pagination.total ?? rows.length} result{(pagination.total ?? rows.length) !== 1 ? 's' : ''}
          </div>
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {loading && rows.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No messages found</div>
            ) : rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => openThread(row.conversation_id)}
                style={resultRow}
              >
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {formatTime(row.created_at)} · {row.sender_name}
                  {row.sender_kind ? ` · ${row.sender_kind}` : ''}
                  {row.conversation_type === 'channel' ? ` · #${row.conversation_title}` : ''}
                  {row.conversation_type === 'client_support' ? ' · Client support' : ''}
                  {row.conversation_type === 'dm' ? ' · DM' : ''}
                </div>
                <div style={{ fontSize: 13, color: '#0B1F3B', marginTop: 4, textAlign: 'left' }}>{row.body_text}</div>
              </button>
            ))}
          </div>
        </div>

        {selectedThread && (
          <div style={panelCard}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {selectedThread.conversation?.type === 'channel'
                  ? `# ${selectedThread.conversation?.title}`
                  : selectedThread.conversation?.type === 'client_support'
                    ? `Client: ${selectedThread.client_summary?.display_name || selectedThread.conversation?.title || 'Support'}`
                    : 'Direct message'}
              </div>
              <button type="button" onClick={() => setSelectedThread(null)} style={closeBtn}>Close</button>
            </div>
            <div style={{ padding: 16, maxHeight: 560, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(selectedThread.messages || []).map((m) => (
                <div key={m.id} style={{ padding: '8px 10px', background: '#F8FAFC', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{m.sender_name || 'User'}</div>
                  <div style={{ fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' }}>{m.body_text}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{formatTime(m.created_at)}</div>
                </div>
              ))}
              {(selectedThread.messages || []).length === 0 && (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>
                  <MessageSquare size={32} style={{ opacity: 0.3 }} />
                  <div style={{ marginTop: 8 }}>No messages in thread</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const headerCard = {
  background: '#fff', borderRadius: 14, padding: '18px 22px', marginBottom: 16,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};
const filterCard = {
  background: '#fff', borderRadius: 14, padding: 16, marginBottom: 16,
  display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};
const panelCard = {
  background: '#fff', borderRadius: 14, overflow: 'hidden',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};
const input = {
  padding: '9px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13,
};
const btnPrimary = {
  padding: '9px 18px', borderRadius: 8, border: 'none', background: '#F37920',
  color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
const resultRow = {
  width: '100%', padding: '12px 16px', border: 'none', borderBottom: '1px solid #F8FAFC',
  background: '#fff', cursor: 'pointer', textAlign: 'left',
};
const errorBanner = {
  background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8,
  marginBottom: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
};
const backLink = { color: '#64748b', display: 'flex', alignItems: 'center' };
const closeBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 12, fontWeight: 600 };

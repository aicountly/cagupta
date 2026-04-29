import { useState } from 'react';
import {
  Pin, PinOff, CheckCircle2, Bell, Trash2,
  Eye, Users, Lock, ChevronDown, ChevronUp,
} from 'lucide-react';
import { updateServiceLog, deleteServiceLog, sendLogReminder } from '../../services/serviceLogService';

// ── Type config ───────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  note:             { label: 'Note',             bg: '#EFF6FF', color: '#1d4ed8', border: '#bfdbfe' },
  status_change:    { label: 'Status Change',    bg: '#F0FDF4', color: '#16a34a', border: '#bbf7d0' },
  follow_up:        { label: 'Follow-up',        bg: '#FFFBEB', color: '#d97706', border: '#fde68a' },
  document_request: { label: 'Document Request', bg: '#FDF4FF', color: '#7c3aed', border: '#e9d5ff' },
  internal_message: { label: 'Internal',         bg: '#F1F5F9', color: '#475569', border: '#cbd5e1' },
  reminder:         { label: 'Reminder',         bg: '#FFF7ED', color: '#ea580c', border: '#fed7aa' },
  system:           { label: 'System',           bg: '#F8FAFC', color: '#94a3b8', border: '#e2e8f0' },
};

const VISIBILITY_CONFIG = {
  internal:  { label: 'Internal',  Icon: Lock,  color: '#64748b' },
  affiliate: { label: 'Affiliate', Icon: Users, color: '#2563eb' },
  client:    { label: 'Client',    Icon: Eye,   color: '#16a34a' },
};

export default function ServiceLogEntry({
  entry,
  serviceId,
  isSuperAdmin,
  canEdit,
  onUpdated,
  onDeleted,
}) {
  const [expanded, setExpanded]   = useState(false);
  const [busy, setBusy]           = useState(false);
  const [actionErr, setActionErr] = useState('');

  const type       = entry.log_type    || 'note';
  const vis        = entry.visibility  || 'internal';
  const typeConf   = TYPE_CONFIG[type]    || TYPE_CONFIG.note;
  const visConf    = VISIBILITY_CONFIG[vis] || VISIBILITY_CONFIG.internal;
  const VisIcon    = visConf.Icon;

  const isResolved    = Boolean(entry.is_resolved);
  const isPinned      = Boolean(entry.is_pinned);
  const hasFollowUp   = Boolean(entry.follow_up_date);
  const canRemind     = hasFollowUp && !isResolved && (vis === 'client' || vis === 'affiliate');
  const isOverdue     = hasFollowUp && !isResolved && entry.follow_up_date < todayStr();
  const isDueToday    = hasFollowUp && !isResolved && entry.follow_up_date === todayStr();
  const messageShort  = entry.message?.length > 200 && !expanded;

  async function handle(fn) {
    setBusy(true);
    setActionErr('');
    try { await fn(); }
    catch (e) { setActionErr(e.message || 'Action failed.'); }
    finally { setBusy(false); }
  }

  async function togglePin() {
    handle(async () => {
      const updated = await updateServiceLog(serviceId, entry.id, { is_pinned: !isPinned });
      onUpdated(updated);
    });
  }

  async function resolve() {
    handle(async () => {
      const updated = await updateServiceLog(serviceId, entry.id, { resolve: true });
      onUpdated(updated);
    });
  }

  async function sendReminder() {
    handle(async () => {
      const updated = await sendLogReminder(serviceId, entry.id);
      onUpdated(updated);
    });
  }

  async function handleDelete() {
    if (!window.confirm('Permanently delete this log entry?')) return;
    handle(async () => {
      await deleteServiceLog(serviceId, entry.id);
      onDeleted(entry.id);
    });
  }

  return (
    <div
      style={{
        ...entryWrap,
        ...(isPinned ? pinnedStyle : {}),
        ...(isResolved ? resolvedStyle : {}),
      }}
    >
      {/* Top row: type badge + visibility + timestamp */}
      <div style={entryTop}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' }}>
          {/* Type badge */}
          <span style={{
            ...typeBadge,
            background: typeConf.bg,
            color:       typeConf.color,
            border:      `1px solid ${typeConf.border}`,
          }}>
            {typeConf.label}
          </span>

          {/* Visibility badge */}
          <span style={{
            ...visBadge,
            color: visConf.color,
          }}>
            <VisIcon size={11} style={{ marginRight: 3 }} />
            {visConf.label}
          </span>

          {/* Pin indicator */}
          {isPinned && (
            <span style={{ fontSize: 11, color: '#F37920', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Pin size={11} /> Pinned
            </span>
          )}

          {/* Follow-up date chip */}
          {hasFollowUp && (
            <span style={{
              ...followUpChip,
              background: isOverdue  ? '#FFF1F2' : isDueToday ? '#FFFBEB' : '#F0FDF4',
              color:      isOverdue  ? '#dc2626' : isDueToday ? '#d97706' : '#15803d',
              border:     `1px solid ${isOverdue ? '#fecdd3' : isDueToday ? '#fde68a' : '#bbf7d0'}`,
            }}>
              {isOverdue  ? '⚠ Overdue: ' : isDueToday ? '⏰ Due today: ' : '📅 Follow-up: '}
              {entry.follow_up_date}
            </span>
          )}

          {/* Resolved badge */}
          {isResolved && (
            <span style={resolvedBadge}>
              <CheckCircle2 size={11} style={{ marginRight: 3 }} /> Resolved
            </span>
          )}
        </div>

        {/* Timestamp + author */}
        <div style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0, textAlign: 'right' }}>
          <div>{formatDateTime(entry.created_at)}</div>
          {entry.created_by_name && (
            <div style={{ marginTop: 1 }}>{entry.created_by_name}</div>
          )}
        </div>
      </div>

      {/* Message body */}
      <div style={entryBody}>
        <p style={{
          ...messageText,
          WebkitLineClamp: messageShort ? 4 : undefined,
          overflow: messageShort ? 'hidden' : 'visible',
          display: messageShort ? '-webkit-box' : 'block',
          WebkitBoxOrient: messageShort ? 'vertical' : undefined,
        }}>
          {entry.message}
        </p>
        {entry.message?.length > 200 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={expandBtn}
          >
            {expanded ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show more</>}
          </button>
        )}
      </div>

      {/* Reminder sent timestamp */}
      {entry.reminder_sent_at && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
          Reminder sent: {formatDateTime(entry.reminder_sent_at)}
        </div>
      )}

      {/* Resolved info */}
      {isResolved && entry.resolved_at && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
          Resolved {formatDateTime(entry.resolved_at)}
          {entry.resolved_by_name ? ` by ${entry.resolved_by_name}` : ''}
        </div>
      )}

      {/* Action row */}
      {(canEdit || isSuperAdmin) && (
        <div style={actionRow}>
          {actionErr && <span style={{ fontSize: 11, color: '#dc2626', flex: 1 }}>{actionErr}</span>}

          {canEdit && !isResolved && hasFollowUp && (
            <button
              type="button"
              disabled={busy}
              onClick={resolve}
              style={actionBtn}
              title="Mark as resolved"
            >
              <CheckCircle2 size={13} />
              Resolve
            </button>
          )}

          {canEdit && canRemind && (
            <button
              type="button"
              disabled={busy}
              onClick={sendReminder}
              style={actionBtn}
              title="Send reminder email to client/affiliate"
            >
              <Bell size={13} />
              Send Reminder
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={togglePin}
              style={actionBtn}
              title={isPinned ? 'Unpin' : 'Pin to top'}
            >
              {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
              {isPinned ? 'Unpin' : 'Pin'}
            </button>
          )}

          {isSuperAdmin && (
            <button
              type="button"
              disabled={busy}
              onClick={handleDelete}
              style={{ ...actionBtn, color: '#ef4444' }}
              title="Delete log entry"
            >
              <Trash2 size={13} />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const entryWrap = {
  background: '#fff',
  border: '1px solid #E6E8F0',
  borderRadius: 10,
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
const pinnedStyle = {
  borderColor: 'rgba(243,121,32,0.35)',
  background: '#FFFDF9',
  boxShadow: '0 0 0 2px rgba(243,121,32,0.08)',
};
const resolvedStyle = {
  opacity: 0.7,
  background: '#FAFCFF',
};
const entryTop = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8,
};
const typeBadge = {
  display: 'inline-flex', alignItems: 'center',
  fontSize: 11, fontWeight: 700,
  padding: '2px 8px', borderRadius: 6,
  letterSpacing: '0.02em',
};
const visBadge = {
  display: 'inline-flex', alignItems: 'center',
  fontSize: 11, fontWeight: 600,
};
const followUpChip = {
  display: 'inline-flex', alignItems: 'center',
  fontSize: 11, fontWeight: 700,
  padding: '2px 8px', borderRadius: 6,
};
const resolvedBadge = {
  display: 'inline-flex', alignItems: 'center',
  fontSize: 11, fontWeight: 600, color: '#16a34a',
  background: '#F0FDF4', border: '1px solid #bbf7d0',
  padding: '2px 8px', borderRadius: 6,
};
const entryBody = { display: 'flex', flexDirection: 'column', gap: 4 };
const messageText = {
  margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.6,
  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
};
const expandBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#F37920', fontSize: 12, fontWeight: 600,
  padding: 0, display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2,
};
const actionRow = {
  display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
  paddingTop: 6, borderTop: '1px solid #F1F5F9', marginTop: 2,
};
const actionBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '4px 10px', background: '#F6F7FB', border: '1px solid #E6E8F0',
  borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  color: '#475569',
};

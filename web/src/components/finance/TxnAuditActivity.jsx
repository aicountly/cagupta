import { useState, useEffect } from 'react';
import { fetchTxnAuditLog } from '../../modules/finance/services/txnService';

const AUDIT_MODAL_OVERLAY = {
  position:       'fixed',
  inset:          0,
  background:     'rgba(15,23,42,0.35)',
  zIndex:         1001,
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  padding:        16,
};

const AUDIT_MODAL_BOX = {
  background:    '#fff',
  borderRadius:  12,
  boxShadow:     '0 8px 32px rgba(0,0,0,0.18)',
  minWidth:      420,
  maxWidth:      640,
  width:         '100%',
  maxHeight:     '88vh',
  display:       'flex',
  flexDirection: 'column',
  overflow:      'hidden',
};

function formatTxnAuditAction(action) {
  const m = {
    'txn.created':                 'Recorded',
    'txn.updated':                 'Updated',
    'txn.deleted':                 'Deleted',
    'txn.tds_finalized':           'TDS marked final',
    'ledger_modify_otp_requested': 'Ledger change OTP requested',
    'ledger_reversal_otp_requested': 'Ledger reversal OTP requested (user email)',
    'txn.reversed':                'Transaction reversed',
    'txn.reversal_cancelled':      'Ledger reversal cancelled',
  };
  if (m[action]) return m[action];
  return String(action || '').replace(/^txn\./, '').replace(/_/g, ' ');
}

function formatActivityTs(ts) {
  if (ts == null || ts === '') return '—';
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(ts);
  }
}

/** @param {{ txn: object, onOpenAudit: function, tdStyle: object }} props */
export function LastUpdatedByCell({ txn, onOpenAudit, tdStyle: cellTd }) {
  const name = String(txn.updatedByName || txn.createdByName || '').trim() || '—';
  const muted = !txn.updatedByName && !txn.createdByName;

  return (
    <td
      style={muted ? { ...cellTd, color: '#94a3b8' } : cellTd}
      onClick={(e) => e.stopPropagation?.()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation?.();
          onOpenAudit(txn);
        }}
        title="View activity log"
        style={{
          background:     'none',
          border:         'none',
          padding:        0,
          margin:         0,
          cursor:         muted ? 'default' : 'pointer',
          color:          muted ? '#94a3b8' : '#0369a1',
          fontSize:       'inherit',
          textDecoration: muted ? 'none' : 'underline',
          textAlign:      'left',
        }}
      >
        {name}
      </button>
    </td>
  );
}

/** @param {{ txn: { id: number }, onClose: function }} props */
export function TxnAuditLogModal({ txn, onClose }) {
  const [payload, setPayload] = useState(null);
  const [err, setErr]         = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchTxnAuditLog(txn.id, { limit: 100 })
      .then((d) => {
        if (!cancelled) {
          setPayload(d);
          setErr('');
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message || 'Failed to load activity log');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [txn.id]);

  const summary = payload?.summary || {};

  const closeBtn = {
    background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#64748b',
    padding: '2px 6px', borderRadius: 4,
  };

  return (
    <div style={AUDIT_MODAL_OVERLAY} onClick={onClose} role="presentation">
      <div
        style={AUDIT_MODAL_BOX}
        className="txn-audit-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="txn-audit-title"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <span id="txn-audit-title" style={{ fontSize: 16, fontWeight: 700 }}>
            Activity log · #{txn.id}
          </span>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">✕</button>
        </div>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f8fafc', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
          <div>
            <strong style={{ color: '#64748b' }}>Originally recorded</strong>
            {' '}
            {summary.created_by_name || '—'}
            {summary.created_at ? ` · ${formatActivityTs(summary.created_at)}` : ''}
          </div>
          <div style={{ marginTop: 6 }}>
            <strong style={{ color: '#64748b' }}>Last updated</strong>
            {' '}
            {summary.updated_by_name || summary.created_by_name || '—'}
            {summary.updated_at ? ` · ${formatActivityTs(summary.updated_at)}` : ''}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 20px' }}>
          {loading && <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div>}
          {err && <div style={{ color: '#dc2626', fontSize: 13 }}>{err}</div>}
          {!loading && !err && (!payload?.entries || payload.entries.length === 0) && (
            <div style={{ color: '#94a3b8', fontSize: 13 }}>
              No detailed events logged yet. Summary above reflects the transaction record.
            </div>
          )}
          {!loading && !err && payload?.entries?.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {payload.entries.map((row) => (
                <li
                  key={row.id}
                  style={{
                    fontSize:     13,
                    padding:      '10px 0',
                    borderBottom: '1px solid #f1f5f9',
                    color:        '#334155',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{formatTxnAuditAction(row.action)}</div>
                  <div style={{ color: '#64748b', marginTop: 4 }}>
                    {(row.actor_name || 'System')}
                    {row.created_at ? ` · ${formatActivityTs(row.created_at)}` : ''}
                  </div>
                  {row.metadata && typeof row.metadata === 'object' && Object.keys(row.metadata).length > 0 && (
                    <pre style={{ marginTop: 8, fontSize: 11, background: '#f8fafc', padding: 8, borderRadius: 6, overflow: 'auto', maxHeight: 120 }}>
                      {JSON.stringify(row.metadata, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

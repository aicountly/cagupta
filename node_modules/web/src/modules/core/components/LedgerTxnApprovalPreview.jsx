import { useState } from 'react';
import {
  txnTypeLabelForApproval,
  clientLabelForApprovalSnap,
  LEDGER_TXN_INLINE_PREVIEW_LIMIT,
} from '../services/ledgerTxnChangeApprovalService';

const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const thStyle = {
  textAlign: 'left',
  padding: '8px 10px',
  color: '#64748b',
  fontWeight: 600,
  fontSize: 11,
  borderBottom: '1px solid #E6E8F0',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};
const tdStyle = { padding: '8px 10px', color: '#334155' };

function formatInrAmount(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

function formatTxnRef(snap) {
  return snap.public_ref || snap.invoice_number || '—';
}

function truncateText(text, maxLen = 48) {
  const s = String(text || '').trim();
  if (!s) return '—';
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
}

export function LedgerTxnPreviewTable({ rows, compactNarration = false }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  return (
    <div style={{ overflowX: 'auto', marginTop: 10, marginBottom: 4 }}>
      <table style={tableStyle}>
        <thead>
          <tr style={{ background: '#F8FAFC' }}>
            <th style={thStyle}>ID</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Client</th>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>Ref / Invoice</th>
            <th style={thStyle}>Amount</th>
            <th style={thStyle}>Narration</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((snap) => {
            const id = snap.id ?? '—';
            return (
              <tr key={id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ ...tdStyle, fontWeight: 600, color: '#0B1F3B', whiteSpace: 'nowrap' }}>{id}</td>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{txnTypeLabelForApproval(snap.txn_type)}</td>
                <td style={{ ...tdStyle, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {clientLabelForApprovalSnap(snap) || '—'}
                </td>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{snap.txn_date || '—'}</td>
                <td style={tdStyle}>{formatTxnRef(snap)}</td>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontWeight: 600 }}>{formatInrAmount(snap.amount)}</td>
                <td style={{ ...tdStyle, maxWidth: compactNarration ? 140 : 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {compactNarration ? truncateText(snap.narration, 32) : truncateText(snap.narration, 64)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LedgerTxnPreviewModal({ open, title, subtitle, rows, onClose }) {
  if (!open) return null;

  const overlay = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10001,
    padding: 16,
  };
  const panel = {
    background: '#fff',
    borderRadius: 14,
    padding: 24,
    width: '100%',
    maxWidth: 920,
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    maxHeight: '90vh',
    overflowY: 'auto',
  };

  return (
    <div
      style={overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ledger-txn-preview-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div id="ledger-txn-preview-title" style={{ fontSize: 16, fontWeight: 700, color: '#0B1F3B' }}>
              {title}
            </div>
            {subtitle ? (
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#64748b' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <LedgerTxnPreviewTable rows={rows} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: '#f8fafc',
              color: '#475569',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Renders txn preview inline (≤ limit) or summary + modal trigger for larger sets.
 */
export function LedgerTxnApprovalPreviewSection({
  row,
  txnRows,
  modalTitle,
  modalSubtitle,
  showViewDetailsLink = false,
  linkOnly = false,
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const ids = row.payload?.ids;
  const count = txnRows.length;
  const useModal = !linkOnly && count > LEDGER_TXN_INLINE_PREVIEW_LIMIT;
  const hasSnapshotData = count > 0;

  if (!hasSnapshotData) {
    if (Array.isArray(ids) && ids.length > 0) {
      return (
        <div style={{ marginTop: 4 }}>
          <div><strong>Txn ids:</strong> {ids.join(', ')}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Transaction details unavailable.</div>
        </div>
      );
    }
    return null;
  }

  if (linkOnly) {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          style={{
            marginTop: 4,
            padding: 0,
            border: 'none',
            background: 'none',
            color: '#0369a1',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          View details
        </button>
        <LedgerTxnPreviewModal
          open={modalOpen}
          title={modalTitle}
          subtitle={modalSubtitle}
          rows={txnRows}
          onClose={() => setModalOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      {useModal ? (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 13, color: '#475569' }}>
            <strong>{count}</strong> ledger record{count === 1 ? '' : 's'} selected for cancellation
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            style={{
              marginTop: 8,
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              background: '#fff',
              color: '#0369a1',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            View transactions
          </button>
        </div>
      ) : (
        <LedgerTxnPreviewTable rows={txnRows} compactNarration={count > 2} />
      )}
      {showViewDetailsLink && !useModal && count === 1 ? (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          style={{
            marginTop: 6,
            padding: 0,
            border: 'none',
            background: 'none',
            color: '#0369a1',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          View details
        </button>
      ) : null}
      {count > 0 ? (
        <LedgerTxnPreviewModal
          open={modalOpen}
          title={modalTitle}
          subtitle={modalSubtitle}
          rows={txnRows}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </>
  );
}

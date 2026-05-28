import { BookOpen } from 'lucide-react';
import DateInput from '../../../../components/common/DateInput';
import { TxnAuditEyeButton, TxnAuditLogModal } from '../../../../components/finance/TxnAuditActivity';
import { useBankFirmWorkspace } from './BankFirmWorkspaceContext';
import {
  btnPrimary,
  sectionCard,
  sectionHeader,
  sectionTitle,
  tableScrollRegion,
  tableStyle,
  tdStyle,
  thStyle,
  toolbarBarStyle,
  toolbarDateStyle,
  toolbarSelectStyle,
} from './bankFirmStyles';

function ledgerClientLabel(row) {
  const name = String(row.client_name || row.clientName || '').trim();
  return name || '—';
}

function resolveBankLedgerAuditTxnId(row) {
  if (!row || row.row_type === 'opening') return null;
  const linked = Number(row.linked_txn_id ?? row.linkedTxnId);
  if (linked > 0 && /_bank_leg$/.test(String(row.txn_type ?? row.txnType ?? ''))) {
    return linked;
  }
  const id = Number(row.id);
  return id > 0 ? id : null;
}

export default function BankFirmLedgerPage() {
  const {
    firmCode,
    accounts,
    ledgerAccountId,
    setLedgerAccountId,
    ledgerFrom,
    setLedgerFrom,
    ledgerTo,
    setLedgerTo,
    ledgerRows,
    loadLedger,
    auditTxn,
    openAuditFirmTxn,
    closeAuditFirmTxn,
  } = useBankFirmWorkspace();

  return (
    <div style={sectionCard}>
      <div style={sectionHeader}>
        <BookOpen size={15} color="var(--portal-primary)" style={{ marginRight: 8 }} />
        <span style={sectionTitle}>Bank ledger</span>
      </div>
      <div style={{ padding: 20 }}>
        {!firmCode ? (
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Select a billing firm above to choose an account.</div>
        ) : (
          <>
            <div style={toolbarBarStyle}>
              <select
                style={toolbarSelectStyle}
                value={ledgerAccountId}
                onChange={(e) => setLedgerAccountId(e.target.value)}
              >
                <option value="">— Account —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.name}
                  </option>
                ))}
              </select>
              <DateInput
                style={toolbarDateStyle}
                value={ledgerFrom}
                onChange={(e) => setLedgerFrom(e.target.value)}
              />
              <DateInput
                style={toolbarDateStyle}
                value={ledgerTo}
                onChange={(e) => setLedgerTo(e.target.value)}
              />
              <button type="button" style={{ ...btnPrimary, flexShrink: 0 }} onClick={loadLedger}>
                Load
              </button>
            </div>
            <div style={tableScrollRegion}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Client</th>
                    <th style={thStyle}>Ref</th>
                    <th style={thStyle}>Particulars</th>
                    <th style={thStyle}>Movement</th>
                    <th style={thStyle}>Balance</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>
                        No entries
                      </td>
                    </tr>
                  )}
                  {ledgerRows.map((r, i) => (
                    <tr key={r.id ?? `o-${i}`}>
                      <td style={tdStyle}>{r.txn_date || r.txnDate || '—'}</td>
                      <td style={tdStyle}>{ledgerClientLabel(r)}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>
                        {r.linkedPublicRef || r.linked_public_ref || '—'}
                      </td>
                      <td style={tdStyle}>{r.narration || r.row_type || ''}</td>
                      <td
                        style={{
                          ...tdStyle,
                          color: r.movement >= 0 ? '#166534' : '#991B1B',
                          fontWeight: 600,
                        }}
                      >
                        {r.movement != null ? `₹${Number(r.movement).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        {r.balance != null ? `₹${Number(r.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td style={tdStyle}>
                        <TxnAuditEyeButton
                          txnId={resolveBankLedgerAuditTxnId(r)}
                          onOpenAudit={openAuditFirmTxn}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {auditTxn && <TxnAuditLogModal txn={auditTxn} onClose={closeAuditFirmTxn} />}
    </div>
  );
}

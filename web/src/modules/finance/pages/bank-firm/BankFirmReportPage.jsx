import { useEffect, useMemo, useState } from 'react';
import { useBankFirmWorkspace } from './BankFirmWorkspaceContext';
import { REPORT_KINDS, EXPENSE_CATS, INFLOW_CATS } from './bankFirmConstants';
import { firmTxnTypeLabel } from '../../services/txnService';
import PendingLedgerChangeBanner from '../../../../components/finance/PendingLedgerChangeBanner';
import { TxnAuditLogModal } from '../../../../components/finance/TxnAuditActivity';
import DestructiveConfirmModal from '../../../../components/common/DestructiveConfirmModal';
import { getBillingProfiles } from '../../../../constants/billingProfiles';
import { listFirmBankAccounts } from '../../../../services/firmBankAccountService';
import {
  badge,
  btnSecondary,
  inputStyle,
  sectionCard,
  sectionHeader,
  sectionTitle,
  tableScrollRegion,
  tableStyle,
  tdStyle,
  thStyle,
  btnPrimary,
} from './bankFirmStyles';

const subNavBtn = (active) => ({
  padding: '8px 14px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  border: '1px solid',
  borderColor: active ? '#F37920' : '#E2E8F0',
  background: active ? '#FFF7ED' : '#fff',
  color: active ? '#C2410C' : '#64748b',
  cursor: 'pointer',
});

function typeBadgeStyle(txnType, transferScope) {
  if (txnType === 'firm_bank_transfer') {
    return transferScope === 'inter'
      ? { background: '#EDE9FE', color: '#5B21B6' }
      : { background: '#DBEAFE', color: '#1E40AF' };
  }
  if (txnType === 'firm_inflow') return { background: '#DCFCE7', color: '#166534' };
  if (txnType === 'firm_expense') return { background: '#FEE2E2', color: '#991B1B' };
  return { background: '#F1F5F9', color: '#475569' };
}

function FirmTxnEditModal({ txn, accounts, interFromAccounts, interToAccounts, busy, onClose, onSave }) {
  const isTransfer = txn.txnType === 'firm_bank_transfer';
  const isInflow = txn.txnType === 'firm_inflow';
  const scope = txn.transferScope || 'intra';
  const cats = isInflow ? INFLOW_CATS : EXPENSE_CATS;

  const [txnDate, setTxnDate] = useState(txn.txnDate?.slice?.(0, 10) || txn.txnDate || '');
  const [amount, setAmount] = useState(String(txn.amount || txn.debit || txn.credit || ''));
  const [narration, setNarration] = useState(
    (txn.narration || '').replace(/\s*\(out\)\s*$/i, '').replace(/\s*\(in\)\s*$/i, ''),
  );
  const [bankAccountId, setBankAccountId] = useState(String(txn.firmBankAccountId || ''));
  const [category, setCategory] = useState(txn.firmExpenseCategory || 'other');
  const [fromAccountId, setFromAccountId] = useState(String(txn.firmBankAccountId || ''));
  const [toAccountId, setToAccountId] = useState(String(txn.counterpartyFirmBankAccountId || ''));
  const [requestReason, setRequestReason] = useState('');

  const fromList = scope === 'inter' ? interFromAccounts : accounts;
  const toList = scope === 'inter' ? interToAccounts : accounts;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      txnDate,
      amount,
      narration,
      bankAccountId,
      category,
      fromAccountId,
      toAccountId,
      transferScope: scope,
      requestReason: requestReason.trim(),
    });
  };

  const overlay = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15,23,42,0.35)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  };
  const box = {
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    maxWidth: 480,
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
  };

  return (
    <div style={overlay} onClick={onClose} role="presentation">
      <div style={box} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>
          Edit {firmTxnTypeLabel(txn.txnType, scope)}
        </h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input style={inputStyle} type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} required />
          <input
            style={inputStyle}
            type="number"
            step="0.01"
            placeholder="Amount (₹)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          {isTransfer ? (
            <>
              <select style={inputStyle} value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} required>
                <option value="">— From account —</option>
                {fromList.map((a) => (
                  <option key={`f-${a.id}`} value={String(a.id)}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select style={inputStyle} value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required>
                <option value="">— To account —</option>
                {toList.map((a) => (
                  <option key={`t-${a.id}`} value={String(a.id)}>
                    {a.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <select style={inputStyle} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} required>
                <option value="">— Bank / cash —</option>
                {accounts.map((a) => (
                  <option key={`b-${a.id}`} value={String(a.id)}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
                {cats.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </>
          )}
          <input style={inputStyle} placeholder="Narration" value={narration} onChange={(e) => setNarration(e.target.value)} />
          <textarea
            style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
            placeholder="Reason for this change (required for approval review)"
            value={requestReason}
            onChange={(e) => setRequestReason(e.target.value)}
            required
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" style={btnSecondary} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" style={btnPrimary} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BankFirmReportPage() {
  const {
    firmCode,
    accounts,
    reportKind,
    setReportKind,
    reportRows,
    loadReport,
    canEditFirmTxn,
    editTxn,
    editBusy,
    openEditFirmTxn,
    closeEditFirmTxn,
    saveEditFirmTxn,
    deleteTxnRow,
    deleteTxnBusy,
    promptDeleteFirmTxn,
    closeDeleteFirmTxnModal,
    confirmDeleteFirmTxn,
    auditTxn,
    openAuditFirmTxn,
    closeAuditFirmTxn,
  } = useBankFirmWorkspace();

  const [interFromAccounts, setInterFromAccounts] = useState([]);
  const [interToAccounts, setInterToAccounts] = useState([]);

  useEffect(() => {
    loadReport();
  }, [loadReport, reportKind]);

  useEffect(() => {
    if (!editTxn || editTxn.txnType !== 'firm_bank_transfer' || editTxn.transferScope !== 'inter') {
      setInterFromAccounts((prev) => (prev.length === 0 ? prev : []));
      setInterToAccounts((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const profiles = getBillingProfiles();
    let cancelled = false;
    (async () => {
      try {
        const allLists = await Promise.all(profiles.map((p) => listFirmBankAccounts(p.code)));
        const flat = allLists.flat().map((a) => ({
          ...a,
          id: a.id,
          name: a.name,
          billingFirmCode: a.billing_firm_code || a.billingFirmCode,
        }));
        const fromAcct = flat.find((a) => Number(a.id) === Number(editTxn.firmBankAccountId));
        const toAcct = flat.find((a) => Number(a.id) === Number(editTxn.counterpartyFirmBankAccountId));
        const fromFirm = fromAcct?.billingFirmCode || editTxn.billingProfileCode;
        const toFirm = toAcct?.billingFirmCode;
        if (!fromFirm || !toFirm) return;
        const [fromRows, toRows] = await Promise.all([
          listFirmBankAccounts(fromFirm),
          listFirmBankAccounts(toFirm),
        ]);
        if (!cancelled) {
          setInterFromAccounts(Array.isArray(fromRows) ? fromRows : []);
          setInterToAccounts(Array.isArray(toRows) ? toRows : []);
        }
      } catch {
        if (!cancelled) {
          setInterFromAccounts([]);
          setInterToAccounts([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [editTxn]);

  const allAccountsForEdit = useMemo(() => {
    if (!firmCode) return accounts;
    return accounts.filter((a) => a.billingFirmCode === firmCode || !a.billingFirmCode);
  }, [accounts, firmCode]);

  return (
    <div style={sectionCard}>
      <div style={sectionHeader}>
        <span style={sectionTitle}>Reports</span>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {REPORT_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              style={subNavBtn(reportKind === k.value)}
              onClick={() => setReportKind(k.value)}
            >
              {k.label}
            </button>
          ))}
          <button type="button" style={{ ...btnSecondary, marginLeft: 'auto' }} onClick={loadReport}>
            Refresh
          </button>
        </div>

        <div style={tableScrollRegion}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Account</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>Narration</th>
                {canEditFirmTxn && <th style={thStyle}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {reportRows.length === 0 && (
                <tr>
                  <td colSpan={canEditFirmTxn ? 6 : 5} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>
                    No transactions
                  </td>
                </tr>
              )}
              {reportRows.map((r) => {
                const label = firmTxnTypeLabel(r.txnType, r.transferScope);
                const amt = r.amount || r.debit || r.credit;
                const acctLabel =
                  r.txnType === 'firm_bank_transfer'
                    ? `${r.firmBankAccountName || '—'} → ${r.counterpartyBankAccountName || '—'}`
                    : r.firmBankAccountName || '—';
                return (
                  <tr key={r.id}>
                    <td style={tdStyle}>{r.txnDate}</td>
                    <td style={tdStyle}>
                      <span style={{ ...badge, ...typeBadgeStyle(r.txnType, r.transferScope) }}>{label}</span>
                      {r.pendingLedgerChange && (
                        <div style={{ marginTop: 6 }}>
                          <PendingLedgerChangeBanner pending={r.pendingLedgerChange} />
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>{acctLabel}</td>
                    <td style={tdStyle}>₹{Number(amt).toLocaleString('en-IN')}</td>
                    <td style={tdStyle}>{r.narration}</td>
                    {canEditFirmTxn && (
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          <button type="button" style={btnSecondary} onClick={() => openAuditFirmTxn(r)}>
                            Activity
                          </button>
                          <button
                            type="button"
                            style={btnSecondary}
                            disabled={!!r.pendingLedgerChange}
                            onClick={() => openEditFirmTxn(r)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            style={{ ...btnSecondary, color: '#991B1B', borderColor: '#FECACA' }}
                            disabled={!!r.pendingLedgerChange}
                            onClick={() => promptDeleteFirmTxn(r)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editTxn && (
        <FirmTxnEditModal
          txn={editTxn}
          accounts={allAccountsForEdit}
          interFromAccounts={interFromAccounts}
          interToAccounts={interToAccounts}
          busy={editBusy}
          onClose={closeEditFirmTxn}
          onSave={saveEditFirmTxn}
        />
      )}

      {deleteTxnRow != null && (
        <DestructiveConfirmModal
          open
          title="Cancel this transaction?"
          busy={deleteTxnBusy}
          confirmLabel="Cancel transaction"
          onClose={closeDeleteFirmTxnModal}
          onConfirm={confirmDeleteFirmTxn}
        >
          <p style={{ margin: '0 0 8px' }}>
            Cancel <strong>{firmTxnTypeLabel(deleteTxnRow.txnType, deleteTxnRow.transferScope)}</strong>
            {' '}dated <strong>{deleteTxnRow.txnDate}</strong> for{' '}
            <strong>₹{Number(deleteTxnRow.amount || deleteTxnRow.debit || deleteTxnRow.credit).toLocaleString('en-IN')}</strong>?
          </p>
          {deleteTxnRow.txnType === 'firm_bank_transfer' && (
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
              Both legs of this transfer will be cancelled together after Super Admin approval (if required).
            </p>
          )}
        </DestructiveConfirmModal>
      )}

      {auditTxn && <TxnAuditLogModal txn={auditTxn} onClose={closeAuditFirmTxn} />}
    </div>
  );
}

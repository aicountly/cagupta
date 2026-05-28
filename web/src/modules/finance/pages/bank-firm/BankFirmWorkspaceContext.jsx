import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../../auth/AuthContext';
import {
  listFirmBankAccounts,
  createFirmBankAccount,
  updateFirmBankAccount,
  deleteFirmBankAccount,
} from '../../../../services/firmBankAccountService';
import {
  getBankLedger,
  getFirmInternalTxns,
  createFirmBankTransfer,
  createFirmExpenseTxn,
  createFirmInflowTxn,
  updateTxn,
  deleteTxn,
} from '../../services/txnService';

const BankFirmWorkspaceContext = createContext(null);

export function BankFirmWorkspaceProvider({ children }) {
  const { hasPermission } = useAuth();
  const cashBookOnly = hasPermission('cash_book.view') && !hasPermission('invoices.view');
  const canSettings = hasPermission('settings.view');
  const canEditOpeningBalance = hasPermission('invoices.edit') || (cashBookOnly && hasPermission('cash_book.edit'));
  const canEditFirmTxn = hasPermission('invoices.edit') || (cashBookOnly && hasPermission('cash_book.edit'));

  const [firmCode, setFirmCode] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  const [ledgerAccountId, setLedgerAccountId] = useState('');
  const [ledgerFrom, setLedgerFrom] = useState('');
  const [ledgerTo, setLedgerTo] = useState('');
  const [ledgerRows, setLedgerRows] = useState([]);

  const [xferFrom, setXferFrom] = useState('');
  const [xferTo, setXferTo] = useState('');
  const [xferAmt, setXferAmt] = useState('');
  const [xferDate, setXferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [xferNote, setXferNote] = useState('');

  const [interFromFirm, setInterFromFirm] = useState('');
  const [interToFirm, setInterToFirm] = useState('');
  const [interFromAccounts, setInterFromAccounts] = useState([]);
  const [interToAccounts, setInterToAccounts] = useState([]);
  const [interFromAcct, setInterFromAcct] = useState('');
  const [interToAcct, setInterToAcct] = useState('');
  const [interAmt, setInterAmt] = useState('');
  const [interDate, setInterDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [interNote, setInterNote] = useState('');

  const [expAcct, setExpAcct] = useState('');
  const [expCat, setExpCat] = useState('other');
  const [expAmt, setExpAmt] = useState('');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expNote, setExpNote] = useState('');

  const [infAcct, setInfAcct] = useState('');
  const [infCat, setInfCat] = useState('fund_infusion');
  const [infAmt, setInfAmt] = useState('');
  const [infDate, setInfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [infNote, setInfNote] = useState('');

  const [reportKind, setReportKind] = useState('all');
  const [reportRows, setReportRows] = useState([]);
  const [editTxn, setEditTxn] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [deleteTxnRow, setDeleteTxnRow] = useState(null);
  const [deleteTxnBusy, setDeleteTxnBusy] = useState(false);
  const [deleteRequestReason, setDeleteRequestReason] = useState('');
  const [auditTxn, setAuditTxn] = useState(null);

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('bank');
  const [newOpen, setNewOpen] = useState('0');
  const [newOpenType, setNewOpenType] = useState('debit');
  const [newOpenDate, setNewOpenDate] = useState('');
  const [deleteAccountId, setDeleteAccountId] = useState(null);
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);
  const [editAccountId, setEditAccountId] = useState(null);
  const [editOpen, setEditOpen] = useState('');
  const [editOpenType, setEditOpenType] = useState('debit');
  const [editOpenDate, setEditOpenDate] = useState('');
  const [editAccountBusy, setEditAccountBusy] = useState(false);

  const flash = useCallback((text, type = 'info') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 5000);
  }, []);

  const refreshAccounts = useCallback(async () => {
    if (!firmCode) {
      setAccounts([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await listFirmBankAccounts(firmCode);
      setAccounts(Array.isArray(rows) ? rows : []);
    } catch (e) {
      flash(e.message || 'Failed to load accounts', 'error');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [firmCode, flash]);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  const visibleAccounts = useMemo(
    () => (cashBookOnly ? accounts.filter((a) => a.accountType === 'cash') : accounts),
    [accounts, cashBookOnly],
  );

  useEffect(() => {
    if (!interFromFirm) {
      setInterFromAccounts([]);
      setInterFromAcct('');
      return;
    }
    let cancelled = false;
    listFirmBankAccounts(interFromFirm)
      .then((rows) => {
        if (!cancelled) {
          setInterFromAccounts(Array.isArray(rows) ? rows : []);
          setInterFromAcct('');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInterFromAccounts([]);
          setInterFromAcct('');
        }
      });
    return () => { cancelled = true; };
  }, [interFromFirm]);

  useEffect(() => {
    if (!interToFirm) {
      setInterToAccounts([]);
      setInterToAcct('');
      return;
    }
    let cancelled = false;
    listFirmBankAccounts(interToFirm)
      .then((rows) => {
        if (!cancelled) {
          setInterToAccounts(Array.isArray(rows) ? rows : []);
          setInterToAcct('');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInterToAccounts([]);
          setInterToAcct('');
        }
      });
    return () => { cancelled = true; };
  }, [interToFirm]);

  const loadLedger = useCallback(async () => {
    const id = parseInt(ledgerAccountId, 10);
    if (!id) {
      flash('Select a ledger account first', 'error');
      return;
    }
    try {
      const rows = await getBankLedger({ firmBankAccountId: id, dateFrom: ledgerFrom, dateTo: ledgerTo });
      setLedgerRows(rows || []);
    } catch (e) {
      flash(e.message || 'Ledger failed', 'error');
    }
  }, [ledgerAccountId, ledgerFrom, ledgerTo, flash]);

  const loadReport = useCallback(async () => {
    try {
      const { rows } = await getFirmInternalTxns({ kind: reportKind, perPage: 100 });
      setReportRows(rows || []);
    } catch (e) {
      flash(e.message || 'Report failed', 'error');
    }
  }, [reportKind, flash]);

  const submitXfer = useCallback(async (e) => {
    e.preventDefault();
    const fromId = parseInt(xferFrom, 10);
    const toId = parseInt(xferTo, 10);
    const fromAcct = accounts.find((a) => Number(a.id) === fromId);
    const toAcct = accounts.find((a) => Number(a.id) === toId);
    if (fromAcct && toAcct && fromAcct.billingFirmCode !== toAcct.billingFirmCode) {
      flash('Intra transfer requires both accounts in the same billing firm.', 'error');
      return;
    }
    try {
      await createFirmBankTransfer({
        fromFirmBankAccountId: fromId,
        toFirmBankAccountId: toId,
        amount: parseFloat(xferAmt),
        txnDate: xferDate,
        narration: xferNote,
        transferScope: 'intra',
      });
      flash('Transfer recorded successfully', 'success');
      setXferAmt('');
      setXferNote('');
      refreshAccounts();
      loadReport();
    } catch (err) {
      flash(err.message || 'Transfer failed', 'error');
    }
  }, [xferFrom, xferTo, xferAmt, xferDate, xferNote, accounts, flash, refreshAccounts, loadReport]);

  const submitInterXfer = useCallback(async (e) => {
    e.preventDefault();
    if (interFromFirm === interToFirm) {
      flash('Inter transfer requires different billing firms on each side.', 'error');
      return;
    }
    const fromId = parseInt(interFromAcct, 10);
    const toId = parseInt(interToAcct, 10);
    if (fromId === toId) {
      flash('From and to accounts must differ.', 'error');
      return;
    }
    try {
      await createFirmBankTransfer({
        fromFirmBankAccountId: fromId,
        toFirmBankAccountId: toId,
        amount: parseFloat(interAmt),
        txnDate: interDate,
        narration: interNote,
        transferScope: 'inter',
      });
      flash('Inter-firm transfer recorded successfully', 'success');
      setInterAmt('');
      setInterNote('');
      refreshAccounts();
      loadReport();
    } catch (err) {
      flash(err.message || 'Transfer failed', 'error');
    }
  }, [interFromFirm, interToFirm, interFromAcct, interToAcct, interAmt, interDate, interNote, flash, refreshAccounts, loadReport]);

  const submitExp = useCallback(async (e) => {
    e.preventDefault();
    try {
      await createFirmExpenseTxn({
        firmBankAccountId: parseInt(expAcct, 10),
        category: expCat,
        amount: parseFloat(expAmt),
        txnDate: expDate,
        narration: expNote,
      });
      flash('Expense recorded successfully', 'success');
      setExpAmt('');
      setExpNote('');
      refreshAccounts();
      loadReport();
    } catch (err) {
      flash(err.message || 'Expense failed', 'error');
    }
  }, [expAcct, expCat, expAmt, expDate, expNote, flash, refreshAccounts, loadReport]);

  const submitInf = useCallback(async (e) => {
    e.preventDefault();
    try {
      await createFirmInflowTxn({
        firmBankAccountId: parseInt(infAcct, 10),
        category: infCat,
        amount: parseFloat(infAmt),
        txnDate: infDate,
        narration: infNote,
      });
      flash('Inflow recorded successfully', 'success');
      setInfAmt('');
      setInfNote('');
      refreshAccounts();
      loadReport();
    } catch (err) {
      flash(err.message || 'Inflow failed', 'error');
    }
  }, [infAcct, infCat, infAmt, infDate, infNote, flash, refreshAccounts, loadReport]);

  const addAccount = useCallback(async (e) => {
    e.preventDefault();
    if (!canSettings || !firmCode || !newName.trim()) return;
    try {
      await createFirmBankAccount({
        billing_firm_code: firmCode,
        name: newName.trim(),
        account_type: newType,
        opening_balance: Math.abs(parseFloat(newOpen) || 0),
        opening_balance_type: newOpenType,
        opening_balance_date: newOpenDate || null,
      });
      setNewName('');
      setNewOpen('0');
      setNewOpenType('debit');
      flash('Account created', 'success');
      refreshAccounts();
    } catch (err) {
      flash(err.message || 'Create failed', 'error');
    }
  }, [canSettings, firmCode, newName, newType, newOpen, newOpenType, newOpenDate, flash, refreshAccounts]);

  const promptRemoveAccount = useCallback((id) => {
    if (!canSettings) return;
    setDeleteAccountId(id);
  }, [canSettings]);

  const promptEditOpeningBalance = useCallback(
    (account) => {
      if (!canEditOpeningBalance || !account) return;
      setEditAccountId(account.id);
      setEditOpen(String(Math.abs(Number(account.openingBalance) || 0)));
      setEditOpenType(account.openingBalanceType === 'credit' ? 'credit' : 'debit');
      setEditOpenDate(account.openingBalanceDate ? String(account.openingBalanceDate).slice(0, 10) : '');
    },
    [canEditOpeningBalance],
  );

  const closeEditOpeningBalanceModal = useCallback(() => {
    if (!editAccountBusy) {
      setEditAccountId(null);
      setEditOpen('');
      setEditOpenType('debit');
      setEditOpenDate('');
    }
  }, [editAccountBusy]);

  const saveEditOpeningBalance = useCallback(async () => {
    if (!canEditOpeningBalance || editAccountId == null) return;
    setEditAccountBusy(true);
    try {
      await updateFirmBankAccount(editAccountId, {
        opening_balance: Math.abs(parseFloat(editOpen) || 0),
        opening_balance_type: editOpenType,
        opening_balance_date: editOpenDate || null,
      });
      flash('Opening balance updated', 'success');
      setEditAccountId(null);
      setEditOpen('');
      setEditOpenType('debit');
      setEditOpenDate('');
      refreshAccounts();
    } catch (err) {
      flash(err.message || 'Update failed', 'error');
    } finally {
      setEditAccountBusy(false);
    }
  }, [canEditOpeningBalance, editAccountId, editOpen, editOpenType, editOpenDate, flash, refreshAccounts]);

  const confirmRemoveBankAccount = useCallback(async () => {
    if (!canSettings || deleteAccountId == null) return;
    setDeleteAccountBusy(true);
    try {
      await deleteFirmBankAccount(deleteAccountId);
      flash('Account deleted', 'success');
      setDeleteAccountId(null);
      refreshAccounts();
    } catch (err) {
      flash(err.message || 'Delete failed', 'error');
    } finally {
      setDeleteAccountBusy(false);
    }
  }, [canSettings, deleteAccountId, flash, refreshAccounts]);

  const closeDeleteModal = useCallback(() => {
    if (!deleteAccountBusy) setDeleteAccountId(null);
  }, [deleteAccountBusy]);

  const openEditFirmTxn = useCallback((row) => {
    if (!canEditFirmTxn || !row) return;
    setEditTxn({ ...row });
  }, [canEditFirmTxn]);

  const closeEditFirmTxn = useCallback(() => {
    if (!editBusy) setEditTxn(null);
  }, [editBusy]);

  const saveEditFirmTxn = useCallback(
    async (form) => {
      if (!editTxn?.id || !canEditFirmTxn) return;
      const reason = String(form.requestReason || '').trim();
      if (!reason) {
        flash('Please enter a reason for this change.', 'error');
        return;
      }
      setEditBusy(true);
      try {
        const type = editTxn.txnType;
        let payload = {};
        if (type === 'firm_bank_transfer') {
          const scope = form.transferScope || editTxn.transferScope || 'intra';
          payload = {
            txn_date: form.txnDate,
            amount: parseFloat(form.amount),
            narration: form.narration,
            from_firm_bank_account_id: parseInt(form.fromAccountId, 10),
            to_firm_bank_account_id: parseInt(form.toAccountId, 10),
            transfer_scope: scope,
            request_reason: reason,
          };
        } else {
          payload = {
            txn_date: form.txnDate,
            amount: parseFloat(form.amount),
            narration: form.narration,
            firm_bank_account_id: parseInt(form.bankAccountId, 10),
            firm_expense_category: form.category,
            request_reason: reason,
          };
        }
        const result = await updateTxn(editTxn.id, payload);
        if (result?.pendingLedgerChange) {
          flash(result.queuedMessage || 'Change submitted for Super Admin approval.', 'success');
        } else {
          flash('Transaction updated.', 'success');
        }
        setEditTxn(null);
        loadReport();
        refreshAccounts();
      } catch (err) {
        flash(err.message || 'Update failed', 'error');
      } finally {
        setEditBusy(false);
      }
    },
    [editTxn, canEditFirmTxn, flash, loadReport, refreshAccounts],
  );

  const promptDeleteFirmTxn = useCallback(
    (row) => {
      if (!canEditFirmTxn || !row) return;
      setDeleteTxnRow(row);
    },
    [canEditFirmTxn],
  );

  const closeDeleteFirmTxnModal = useCallback(() => {
    if (!deleteTxnBusy) {
      setDeleteTxnRow(null);
      setDeleteRequestReason('');
    }
  }, [deleteTxnBusy]);

  const confirmDeleteFirmTxn = useCallback(async () => {
    if (!deleteTxnRow?.id || !canEditFirmTxn) return;
    const reason = deleteRequestReason.trim();
    if (!reason) {
      flash('Please enter a reason for this cancellation.', 'error');
      return;
    }
    setDeleteTxnBusy(true);
    try {
      const result = await deleteTxn(deleteTxnRow.id, { request_reason: reason });
      if (result?.pendingLedgerChange) {
        flash(result.queuedMessage || 'Cancel submitted for Super Admin approval.', 'success');
      } else {
        flash('Transaction cancelled.', 'success');
      }
      setDeleteTxnRow(null);
      loadReport();
      refreshAccounts();
    } catch (err) {
      flash(err.message || 'Delete failed', 'error');
    } finally {
      setDeleteTxnBusy(false);
    }
  }, [deleteTxnRow, deleteRequestReason, canEditFirmTxn, flash, loadReport, refreshAccounts]);

  const openAuditFirmTxn = useCallback((row) => {
    if (row?.id) setAuditTxn(row);
  }, []);

  const closeAuditFirmTxn = useCallback(() => setAuditTxn(null), []);

  const value = useMemo(
    () => ({
      cashBookOnly,
      canSettings,
      canEditOpeningBalance,
      canEditFirmTxn,
      firmCode,
      setFirmCode,
      accounts: visibleAccounts,
      loading,
      msg,
      flash,
      ledgerAccountId,
      setLedgerAccountId,
      ledgerFrom,
      setLedgerFrom,
      ledgerTo,
      setLedgerTo,
      ledgerRows,
      loadLedger,
      xferFrom,
      setXferFrom,
      xferTo,
      setXferTo,
      xferAmt,
      setXferAmt,
      xferDate,
      setXferDate,
      xferNote,
      setXferNote,
      submitXfer,
      interFromFirm,
      setInterFromFirm,
      interToFirm,
      setInterToFirm,
      interFromAccounts,
      interToAccounts,
      interFromAcct,
      setInterFromAcct,
      interToAcct,
      setInterToAcct,
      interAmt,
      setInterAmt,
      interDate,
      setInterDate,
      interNote,
      setInterNote,
      submitInterXfer,
      expAcct,
      setExpAcct,
      expCat,
      setExpCat,
      expAmt,
      setExpAmt,
      expDate,
      setExpDate,
      expNote,
      setExpNote,
      submitExp,
      infAcct,
      setInfAcct,
      infCat,
      setInfCat,
      infAmt,
      setInfAmt,
      infDate,
      setInfDate,
      infNote,
      setInfNote,
      submitInf,
      reportKind,
      setReportKind,
      reportRows,
      loadReport,
      editTxn,
      editBusy,
      openEditFirmTxn,
      closeEditFirmTxn,
      saveEditFirmTxn,
      deleteTxnRow,
      deleteTxnBusy,
      deleteRequestReason,
      setDeleteRequestReason,
      promptDeleteFirmTxn,
      closeDeleteFirmTxnModal,
      confirmDeleteFirmTxn,
      auditTxn,
      openAuditFirmTxn,
      closeAuditFirmTxn,
      newName,
      setNewName,
      newType,
      setNewType,
      newOpen,
      setNewOpen,
      newOpenType,
      setNewOpenType,
      newOpenDate,
      setNewOpenDate,
      addAccount,
      promptRemoveAccount,
      deleteAccountId,
      deleteAccountBusy,
      confirmRemoveBankAccount,
      closeDeleteModal,
      editAccountId,
      editOpen,
      setEditOpen,
      editOpenType,
      setEditOpenType,
      editOpenDate,
      setEditOpenDate,
      editAccountBusy,
      promptEditOpeningBalance,
      closeEditOpeningBalanceModal,
      saveEditOpeningBalance,
    }),
    [
      cashBookOnly,
      canSettings,
      canEditOpeningBalance,
      canEditFirmTxn,
      firmCode,
      visibleAccounts,
      loading,
      msg,
      flash,
      ledgerAccountId,
      ledgerFrom,
      ledgerTo,
      ledgerRows,
      loadLedger,
      xferFrom,
      xferTo,
      xferAmt,
      xferDate,
      xferNote,
      submitXfer,
      interFromFirm,
      interToFirm,
      interFromAccounts,
      interToAccounts,
      interFromAcct,
      interToAcct,
      interAmt,
      interDate,
      interNote,
      submitInterXfer,
      expAcct,
      expCat,
      expAmt,
      expDate,
      expNote,
      submitExp,
      infAcct,
      infCat,
      infAmt,
      infDate,
      infNote,
      submitInf,
      reportKind,
      reportRows,
      loadReport,
      editTxn,
      editBusy,
      openEditFirmTxn,
      closeEditFirmTxn,
      saveEditFirmTxn,
      deleteTxnRow,
      deleteTxnBusy,
      deleteRequestReason,
      setDeleteRequestReason,
      promptDeleteFirmTxn,
      closeDeleteFirmTxnModal,
      confirmDeleteFirmTxn,
      auditTxn,
      openAuditFirmTxn,
      closeAuditFirmTxn,
      newName,
      newType,
      newOpen,
      newOpenType,
      newOpenDate,
      addAccount,
      promptRemoveAccount,
      deleteAccountId,
      deleteAccountBusy,
      confirmRemoveBankAccount,
      closeDeleteModal,
      editAccountId,
      editOpen,
      editOpenType,
      editOpenDate,
      editAccountBusy,
      promptEditOpeningBalance,
      closeEditOpeningBalanceModal,
      saveEditOpeningBalance,
    ],
  );

  return <BankFirmWorkspaceContext.Provider value={value}>{children}</BankFirmWorkspaceContext.Provider>;
}

export function useBankFirmWorkspace() {
  const ctx = useContext(BankFirmWorkspaceContext);
  if (!ctx) throw new Error('useBankFirmWorkspace must be used within BankFirmWorkspaceProvider');
  return ctx;
}

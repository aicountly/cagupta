import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../../auth/AuthContext';
import {
  listFirmBankAccounts,
  createFirmBankAccount,
  deleteFirmBankAccount,
} from '../../../../services/firmBankAccountService';
import {
  getBankLedger,
  getFirmInternalTxns,
  createFirmBankTransfer,
  createFirmExpenseTxn,
} from '../../services/txnService';

const BankFirmWorkspaceContext = createContext(null);

export function BankFirmWorkspaceProvider({ children }) {
  const { hasPermission } = useAuth();
  const canSettings = hasPermission('settings.view');

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

  const [expAcct, setExpAcct] = useState('');
  const [expCat, setExpCat] = useState('other');
  const [expAmt, setExpAmt] = useState('');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expNote, setExpNote] = useState('');

  const [reportKind, setReportKind] = useState('all');
  const [reportRows, setReportRows] = useState([]);

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('bank');
  const [newOpen, setNewOpen] = useState('0');
  const [newOpenDate, setNewOpenDate] = useState('');
  const [deleteAccountId, setDeleteAccountId] = useState(null);
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);

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
    try {
      await createFirmBankTransfer({
        fromFirmBankAccountId: parseInt(xferFrom, 10),
        toFirmBankAccountId: parseInt(xferTo, 10),
        amount: parseFloat(xferAmt),
        txnDate: xferDate,
        narration: xferNote,
      });
      flash('Transfer recorded successfully', 'success');
      setXferAmt('');
      setXferNote('');
      refreshAccounts();
      loadReport();
    } catch (err) {
      flash(err.message || 'Transfer failed', 'error');
    }
  }, [xferFrom, xferTo, xferAmt, xferDate, xferNote, flash, refreshAccounts, loadReport]);

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

  const addAccount = useCallback(async (e) => {
    e.preventDefault();
    if (!canSettings || !firmCode || !newName.trim()) return;
    try {
      await createFirmBankAccount({
        billing_firm_code: firmCode,
        name: newName.trim(),
        account_type: newType,
        opening_balance: parseFloat(newOpen) || 0,
        opening_balance_date: newOpenDate || null,
      });
      setNewName('');
      setNewOpen('0');
      flash('Account created', 'success');
      refreshAccounts();
    } catch (err) {
      flash(err.message || 'Create failed', 'error');
    }
  }, [canSettings, firmCode, newName, newType, newOpen, newOpenDate, flash, refreshAccounts]);

  const promptRemoveAccount = useCallback((id) => {
    if (!canSettings) return;
    setDeleteAccountId(id);
  }, [canSettings]);

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

  const value = useMemo(
    () => ({
      canSettings,
      firmCode,
      setFirmCode,
      accounts,
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
      reportKind,
      setReportKind,
      reportRows,
      loadReport,
      newName,
      setNewName,
      newType,
      setNewType,
      newOpen,
      setNewOpen,
      newOpenDate,
      setNewOpenDate,
      addAccount,
      promptRemoveAccount,
      deleteAccountId,
      deleteAccountBusy,
      confirmRemoveBankAccount,
      closeDeleteModal,
    }),
    [
      canSettings,
      firmCode,
      accounts,
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
      expAcct,
      expCat,
      expAmt,
      expDate,
      expNote,
      submitExp,
      reportKind,
      reportRows,
      loadReport,
      newName,
      newType,
      newOpen,
      newOpenDate,
      addAccount,
      promptRemoveAccount,
      deleteAccountId,
      deleteAccountBusy,
      confirmRemoveBankAccount,
      closeDeleteModal,
    ],
  );

  return <BankFirmWorkspaceContext.Provider value={value}>{children}</BankFirmWorkspaceContext.Provider>;
}

export function useBankFirmWorkspace() {
  const ctx = useContext(BankFirmWorkspaceContext);
  if (!ctx) throw new Error('useBankFirmWorkspace must be used within BankFirmWorkspaceProvider');
  return ctx;
}

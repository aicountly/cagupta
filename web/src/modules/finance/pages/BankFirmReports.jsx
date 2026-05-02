import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { getBillingProfiles } from '../../../constants/billingProfiles';
import {
  listFirmBankAccounts,
  createFirmBankAccount,
  deleteFirmBankAccount,
} from '../../../services/firmBankAccountService';
import {
  getBankLedger,
  getFirmInternalTxns,
  createFirmBankTransfer,
  createFirmExpenseTxn,
} from '../services/txnService';

const card = { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 20 };
const label = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 };
const input = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 };
const btn = { padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 };

const EXPENSE_CATS = [
  { value: 'salary', label: 'Salary' },
  { value: 'drawings', label: 'Drawings' },
  { value: 'rent', label: 'Rent' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'other', label: 'Other' },
];

export default function BankFirmReports() {
  const { hasPermission } = useAuth();
  const canSettings = hasPermission('settings.view');

  const [firmCode, setFirmCode] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

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
      setMsg(e.message || 'Failed to load accounts');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [firmCode]);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  async function loadLedger() {
    setMsg('');
    const id = parseInt(ledgerAccountId, 10);
    if (!id) {
      setMsg('Select ledger account');
      return;
    }
    try {
      const rows = await getBankLedger({
        firmBankAccountId: id,
        dateFrom: ledgerFrom,
        dateTo: ledgerTo,
      });
      setLedgerRows(rows || []);
    } catch (e) {
      setMsg(e.message || 'Ledger failed');
    }
  }

  async function loadReport() {
    setMsg('');
    try {
      const { rows } = await getFirmInternalTxns({ kind: reportKind, perPage: 100 });
      setReportRows(rows || []);
    } catch (e) {
      setMsg(e.message || 'Report failed');
    }
  }

  async function submitXfer(e) {
    e.preventDefault();
    setMsg('');
    try {
      await createFirmBankTransfer({
        fromFirmBankAccountId: parseInt(xferFrom, 10),
        toFirmBankAccountId: parseInt(xferTo, 10),
        amount: parseFloat(xferAmt),
        txnDate: xferDate,
        narration: xferNote,
      });
      setMsg('Transfer recorded');
      setXferAmt('');
      refreshAccounts();
      loadReport();
    } catch (err) {
      setMsg(err.message || 'Transfer failed');
    }
  }

  async function submitExp(e) {
    e.preventDefault();
    setMsg('');
    try {
      await createFirmExpenseTxn({
        firmBankAccountId: parseInt(expAcct, 10),
        category: expCat,
        amount: parseFloat(expAmt),
        txnDate: expDate,
        narration: expNote,
      });
      setMsg('Expense recorded');
      setExpAmt('');
      refreshAccounts();
      loadReport();
    } catch (err) {
      setMsg(err.message || 'Expense failed');
    }
  }

  async function addAccount(e) {
    e.preventDefault();
    if (!canSettings || !firmCode || !newName.trim()) return;
    setMsg('');
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
      setMsg('Account created');
      refreshAccounts();
    } catch (err) {
      setMsg(err.message || 'Create failed');
    }
  }

  async function removeAccount(id) {
    if (!canSettings || !window.confirm('Delete this bank account?')) return;
    try {
      await deleteFirmBankAccount(id);
      refreshAccounts();
    } catch (err) {
      setMsg(err.message || 'Delete failed');
    }
  }

  const profiles = getBillingProfiles();

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>Bank &amp; firm transactions</h1>
      <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14 }}>
        Manage bank/cash accounts per billing firm, view bank ledgers, record internal transfers and firm-only expenses. Contra and expenses do not affect client ledgers.
      </p>
      {msg && <div style={{ marginBottom: 16, padding: 12, background: '#fef3c7', borderRadius: 8, fontSize: 13 }}>{msg}</div>}

      <div style={card}>
        <label style={label}>Billing firm</label>
        <select style={{ ...input, maxWidth: 360 }} value={firmCode} onChange={(e) => setFirmCode(e.target.value)}>
          <option value="">— Select —</option>
          {profiles.map((p) => (
            <option key={p.code} value={p.code}>{p.code} – {p.name}</option>
          ))}
        </select>
        {loading && <div style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>Loading…</div>}
        {firmCode && accounts.length > 0 && (
          <ul style={{ marginTop: 12, paddingLeft: 18, fontSize: 14 }}>
            {accounts.map((a) => (
              <li key={a.id} style={{ marginBottom: 6 }}>
                <strong>{a.name}</strong> ({a.accountType}) · OB ₹{Number(a.openingBalance || 0).toLocaleString('en-IN')}
                {canSettings && (
                  <button type="button" style={{ ...btn, marginLeft: 8, background: '#fee2e2', color: '#991b1b' }} onClick={() => removeAccount(a.id)}>Delete</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canSettings && firmCode && (
          <form onSubmit={addAccount} style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={label}>New account name</label>
              <input style={input} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. HDFC Current" />
            </div>
            <div>
              <label style={label}>Type</label>
              <select style={input} value={newType} onChange={(e) => setNewType(e.target.value)}>
                <option value="bank">Bank</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            <div>
              <label style={label}>Opening balance</label>
              <input style={input} type="number" value={newOpen} onChange={(e) => setNewOpen(e.target.value)} />
            </div>
            <div>
              <label style={label}>OB date</label>
              <input style={input} type="date" value={newOpenDate} onChange={(e) => setNewOpenDate(e.target.value)} />
            </div>
            <button type="submit" style={{ ...btn, background: '#2563eb', color: '#fff' }}>Add account</button>
          </form>
        )}
      </div>

      <div style={{ ...card, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Bank ledger</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <select style={input} value={ledgerAccountId} onChange={(e) => setLedgerAccountId(e.target.value)}>
              <option value="">Account</option>
              {accounts.map((a) => (
                <option key={a.id} value={String(a.id)}>{a.name}</option>
              ))}
            </select>
            <input style={input} type="date" value={ledgerFrom} onChange={(e) => setLedgerFrom(e.target.value)} />
            <input style={input} type="date" value={ledgerTo} onChange={(e) => setLedgerTo(e.target.value)} />
            <button type="button" style={{ ...btn, background: '#0f172a', color: '#fff' }} onClick={loadLedger}>Load</button>
          </div>
          <div style={{ maxHeight: 320, overflow: 'auto', fontSize: 13 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                  <th>Date</th><th>Particulars</th><th>Mov</th><th>Bal</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((r, i) => (
                  <tr key={r.id ?? `o-${i}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td>{r.txn_date || r.txnDate || '—'}</td>
                    <td>{r.narration || r.row_type || ''}</td>
                    <td>{r.movement != null ? Number(r.movement).toFixed(2) : '—'}</td>
                    <td>{r.balance != null ? Number(r.balance).toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Internal transfer (contra)</h2>
          <form onSubmit={submitXfer} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select style={input} value={xferFrom} onChange={(e) => setXferFrom(e.target.value)} required>
              <option value="">From account</option>
              {accounts.map((a) => (
                <option key={`f-${a.id}`} value={String(a.id)}>{a.name}</option>
              ))}
            </select>
            <select style={input} value={xferTo} onChange={(e) => setXferTo(e.target.value)} required>
              <option value="">To account</option>
              {accounts.map((a) => (
                <option key={`t-${a.id}`} value={String(a.id)}>{a.name}</option>
              ))}
            </select>
            <input style={input} type="number" step="0.01" placeholder="Amount" value={xferAmt} onChange={(e) => setXferAmt(e.target.value)} required />
            <input style={input} type="date" value={xferDate} onChange={(e) => setXferDate(e.target.value)} required />
            <input style={input} placeholder="Narration" value={xferNote} onChange={(e) => setXferNote(e.target.value)} />
            <button type="submit" style={{ ...btn, background: '#16a34a', color: '#fff' }}>Save transfer</button>
          </form>
          <h2 style={{ margin: '20px 0 12px', fontSize: 16 }}>Firm expense (no client ledger)</h2>
          <form onSubmit={submitExp} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select style={input} value={expAcct} onChange={(e) => setExpAcct(e.target.value)} required>
              <option value="">Bank / cash</option>
              {accounts.map((a) => (
                <option key={`e-${a.id}`} value={String(a.id)}>{a.name}</option>
              ))}
            </select>
            <select style={input} value={expCat} onChange={(e) => setExpCat(e.target.value)}>
              {EXPENSE_CATS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <input style={input} type="number" step="0.01" placeholder="Amount" value={expAmt} onChange={(e) => setExpAmt(e.target.value)} required />
            <input style={input} type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} required />
            <input style={input} placeholder="Narration" value={expNote} onChange={(e) => setExpNote(e.target.value)} />
            <button type="submit" style={{ ...btn, background: '#c026d3', color: '#fff' }}>Save expense</button>
          </form>
        </div>
      </div>

      <div style={card}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Contra &amp; expenses report</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <select style={input} value={reportKind} onChange={(e) => setReportKind(e.target.value)}>
            <option value="all">All</option>
            <option value="contra">Contra only</option>
            <option value="expense">Expenses only</option>
          </select>
          <button type="button" style={{ ...btn, background: '#0f172a', color: '#fff' }} onClick={loadReport}>Refresh</button>
        </div>
        <div style={{ overflow: 'auto', maxHeight: 400, fontSize: 13 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                <th>Date</th><th>Type</th><th>Dr</th><th>Cr</th><th>Narration</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td>{r.txnDate}</td>
                  <td>{r.txnType}</td>
                  <td>{r.debit}</td>
                  <td>{r.credit}</td>
                  <td>{r.narration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

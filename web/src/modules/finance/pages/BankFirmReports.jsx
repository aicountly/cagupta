import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { getBillingProfiles } from '../../../constants/billingProfiles';
import { Landmark, Plus, Trash2, ArrowRightLeft, Receipt, BookOpen } from 'lucide-react';
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
import DestructiveConfirmModal from '../../../components/common/DestructiveConfirmModal';

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

  function flash(text, type = 'info') {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 5000);
  }

  const refreshAccounts = useCallback(async () => {
    if (!firmCode) { setAccounts([]); return; }
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
  }, [firmCode]);

  useEffect(() => { refreshAccounts(); }, [refreshAccounts]);

  async function loadLedger() {
    const id = parseInt(ledgerAccountId, 10);
    if (!id) { flash('Select a ledger account first', 'error'); return; }
    try {
      const rows = await getBankLedger({ firmBankAccountId: id, dateFrom: ledgerFrom, dateTo: ledgerTo });
      setLedgerRows(rows || []);
    } catch (e) { flash(e.message || 'Ledger failed', 'error'); }
  }

  async function loadReport() {
    try {
      const { rows } = await getFirmInternalTxns({ kind: reportKind, perPage: 100 });
      setReportRows(rows || []);
    } catch (e) { flash(e.message || 'Report failed', 'error'); }
  }

  async function submitXfer(e) {
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
      setXferAmt(''); setXferNote('');
      refreshAccounts(); loadReport();
    } catch (err) { flash(err.message || 'Transfer failed', 'error'); }
  }

  async function submitExp(e) {
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
      setExpAmt(''); setExpNote('');
      refreshAccounts(); loadReport();
    } catch (err) { flash(err.message || 'Expense failed', 'error'); }
  }

  async function addAccount(e) {
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
      setNewName(''); setNewOpen('0');
      flash('Account created', 'success');
      refreshAccounts();
    } catch (err) { flash(err.message || 'Create failed', 'error'); }
  }

  function promptRemoveAccount(id) {
    if (!canSettings) return;
    setDeleteAccountId(id);
  }

  async function confirmRemoveBankAccount() {
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
  }

  const profiles = getBillingProfiles();

  return (
    <div style={pageWrap}>
      {deleteAccountId != null && (
        <DestructiveConfirmModal
          open
          title="Delete bank / cash account?"
          busy={deleteAccountBusy}
          confirmLabel="Delete account"
          onClose={() => !deleteAccountBusy && setDeleteAccountId(null)}
          onConfirm={confirmRemoveBankAccount}
        >
          <p style={{ margin: '0 0 8px' }}>
            Remove <strong>{accounts.find((a) => a.id === deleteAccountId)?.name ?? 'this account'}</strong> under firm <strong>{firmCode}</strong>?
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
            The server may block deletion while transactions reference this ledger. Any error will appear after you confirm.
          </p>
        </DestructiveConfirmModal>
      )}
      {/* Page Header */}
      <div style={headerCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={iconWrap}><Landmark size={20} color="#F37920" /></div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0B1F3B' }}>Bank & Firm Transactions</h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>
              Manage bank/cash accounts, view ledgers, record transfers and firm expenses
            </p>
          </div>
        </div>
      </div>

      {/* Flash message */}
      {msg.text && (
        <div style={{
          padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 500,
          background: msg.type === 'error' ? '#FEE2E2' : msg.type === 'success' ? '#DCFCE7' : '#FEF3C7',
          color: msg.type === 'error' ? '#991B1B' : msg.type === 'success' ? '#166534' : '#92400E',
          border: `1px solid ${msg.type === 'error' ? '#FECACA' : msg.type === 'success' ? '#BBF7D0' : '#FDE68A'}`,
        }}>
          {msg.text}
        </div>
      )}

      {/* Firm selector + Accounts */}
      <div style={sectionCard}>
        <div style={sectionHeader}>
          <span style={sectionTitle}>Billing Firm & Accounts</span>
        </div>
        <div style={{ padding: 20 }}>
          <label style={labelStyle}>SELECT BILLING FIRM</label>
          <select style={{ ...inputStyle, maxWidth: 400 }} value={firmCode} onChange={(e) => setFirmCode(e.target.value)}>
            <option value="">— Select billing firm —</option>
            {profiles.map((p) => (
              <option key={p.code} value={p.code}>{p.code} – {p.name}</option>
            ))}
          </select>
          {loading && <div style={{ marginTop: 10, fontSize: 13, color: '#94a3b8' }}>Loading accounts...</div>}
          {firmCode && accounts.length > 0 && (
            <div style={{ marginTop: 16, overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Account Name</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Opening Balance</th>
                    {canSettings && <th style={thStyle}>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id}>
                      <td style={tdStyle}><strong>{a.name}</strong></td>
                      <td style={tdStyle}><span style={{ ...badge, background: a.accountType === 'bank' ? '#DBEAFE' : '#F3E8FF', color: a.accountType === 'bank' ? '#1E40AF' : '#7C3AED' }}>{a.accountType}</span></td>
                      <td style={tdStyle}>₹{Number(a.openingBalance || 0).toLocaleString('en-IN')}</td>
                      {canSettings && (
                        <td style={tdStyle}>
                          <button type="button" onClick={() => promptRemoveAccount(a.id)} style={btnDanger} title="Delete">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {firmCode && accounts.length === 0 && !loading && (
            <div style={{ marginTop: 12, fontSize: 13, color: '#94a3b8' }}>No accounts found for this firm.</div>
          )}
          {canSettings && firmCode && (
            <form onSubmit={addAccount} style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, alignItems: 'end', paddingTop: 16, borderTop: '1px solid #F1F5F9' }}>
              <div><label style={labelStyle}>ACCOUNT NAME</label><input style={inputStyle} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. HDFC Current" /></div>
              <div><label style={labelStyle}>TYPE</label><select style={inputStyle} value={newType} onChange={(e) => setNewType(e.target.value)}><option value="bank">Bank</option><option value="cash">Cash</option></select></div>
              <div><label style={labelStyle}>OPENING BALANCE</label><input style={inputStyle} type="number" value={newOpen} onChange={(e) => setNewOpen(e.target.value)} /></div>
              <div><label style={labelStyle}>OB DATE</label><input style={inputStyle} type="date" value={newOpenDate} onChange={(e) => setNewOpenDate(e.target.value)} /></div>
              <button type="submit" style={btnPrimary}><Plus size={14} /> Add Account</button>
            </form>
          )}
        </div>
      </div>

      {/* Ledger + Transfer/Expense in 2-col */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Bank Ledger */}
        <div style={sectionCard}>
          <div style={sectionHeader}><BookOpen size={15} color="#F37920" style={{ marginRight: 8 }} /><span style={sectionTitle}>Bank Ledger</span></div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              <select style={{ ...inputStyle, flex: 1, minWidth: 140 }} value={ledgerAccountId} onChange={(e) => setLedgerAccountId(e.target.value)}>
                <option value="">— Account —</option>
                {accounts.map((a) => (<option key={a.id} value={String(a.id)}>{a.name}</option>))}
              </select>
              <input style={{ ...inputStyle, minWidth: 130 }} type="date" value={ledgerFrom} onChange={(e) => setLedgerFrom(e.target.value)} />
              <input style={{ ...inputStyle, minWidth: 130 }} type="date" value={ledgerTo} onChange={(e) => setLedgerTo(e.target.value)} />
              <button type="button" style={btnPrimary} onClick={loadLedger}>Load</button>
            </div>
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              <table style={tableStyle}>
                <thead><tr><th style={thStyle}>Date</th><th style={thStyle}>Particulars</th><th style={thStyle}>Movement</th><th style={thStyle}>Balance</th></tr></thead>
                <tbody>
                  {ledgerRows.length === 0 && <tr><td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>No entries</td></tr>}
                  {ledgerRows.map((r, i) => (
                    <tr key={r.id ?? `o-${i}`}>
                      <td style={tdStyle}>{r.txn_date || r.txnDate || '—'}</td>
                      <td style={tdStyle}>{r.narration || r.row_type || ''}</td>
                      <td style={{ ...tdStyle, color: r.movement >= 0 ? '#166534' : '#991B1B', fontWeight: 600 }}>{r.movement != null ? `₹${Number(r.movement).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{r.balance != null ? `₹${Number(r.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Transfer + Expense forms */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={sectionCard}>
            <div style={sectionHeader}><ArrowRightLeft size={15} color="#F37920" style={{ marginRight: 8 }} /><span style={sectionTitle}>Internal Transfer (Contra)</span></div>
            <form onSubmit={submitXfer} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select style={inputStyle} value={xferFrom} onChange={(e) => setXferFrom(e.target.value)} required>
                <option value="">— From account —</option>
                {accounts.map((a) => (<option key={`f-${a.id}`} value={String(a.id)}>{a.name}</option>))}
              </select>
              <select style={inputStyle} value={xferTo} onChange={(e) => setXferTo(e.target.value)} required>
                <option value="">— To account —</option>
                {accounts.map((a) => (<option key={`t-${a.id}`} value={String(a.id)}>{a.name}</option>))}
              </select>
              <input style={inputStyle} type="number" step="0.01" placeholder="Amount (₹)" value={xferAmt} onChange={(e) => setXferAmt(e.target.value)} required />
              <input style={inputStyle} type="date" value={xferDate} onChange={(e) => setXferDate(e.target.value)} required />
              <input style={inputStyle} placeholder="Narration" value={xferNote} onChange={(e) => setXferNote(e.target.value)} />
              <button type="submit" style={btnPrimary}>Save Transfer</button>
            </form>
          </div>

          <div style={sectionCard}>
            <div style={sectionHeader}><Receipt size={15} color="#F37920" style={{ marginRight: 8 }} /><span style={sectionTitle}>Firm Expense</span></div>
            <form onSubmit={submitExp} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select style={inputStyle} value={expAcct} onChange={(e) => setExpAcct(e.target.value)} required>
                <option value="">— Bank / Cash —</option>
                {accounts.map((a) => (<option key={`e-${a.id}`} value={String(a.id)}>{a.name}</option>))}
              </select>
              <select style={inputStyle} value={expCat} onChange={(e) => setExpCat(e.target.value)}>
                {EXPENSE_CATS.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
              </select>
              <input style={inputStyle} type="number" step="0.01" placeholder="Amount (₹)" value={expAmt} onChange={(e) => setExpAmt(e.target.value)} required />
              <input style={inputStyle} type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} required />
              <input style={inputStyle} placeholder="Narration" value={expNote} onChange={(e) => setExpNote(e.target.value)} />
              <button type="submit" style={{ ...btnPrimary, background: '#7C3AED' }}>Save Expense</button>
            </form>
          </div>
        </div>
      </div>

      {/* Report */}
      <div style={sectionCard}>
        <div style={sectionHeader}><span style={sectionTitle}>Contra & Expenses Report</span></div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
            <select style={{ ...inputStyle, maxWidth: 200 }} value={reportKind} onChange={(e) => setReportKind(e.target.value)}>
              <option value="all">All Transactions</option>
              <option value="contra">Contra Only</option>
              <option value="expense">Expenses Only</option>
            </select>
            <button type="button" style={btnSecondary} onClick={loadReport}>Refresh</button>
          </div>
          <div style={{ overflow: 'auto', maxHeight: 360 }}>
            <table style={tableStyle}>
              <thead><tr><th style={thStyle}>Date</th><th style={thStyle}>Type</th><th style={thStyle}>Debit</th><th style={thStyle}>Credit</th><th style={thStyle}>Narration</th></tr></thead>
              <tbody>
                {reportRows.length === 0 && <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>No transactions</td></tr>}
                {reportRows.map((r) => (
                  <tr key={r.id}>
                    <td style={tdStyle}>{r.txnDate}</td>
                    <td style={tdStyle}><span style={{ ...badge, background: r.txnType === 'contra' ? '#DBEAFE' : '#FEE2E2', color: r.txnType === 'contra' ? '#1E40AF' : '#991B1B' }}>{r.txnType}</span></td>
                    <td style={tdStyle}>{r.debit ? `₹${Number(r.debit).toLocaleString('en-IN')}` : '—'}</td>
                    <td style={tdStyle}>{r.credit ? `₹${Number(r.credit).toLocaleString('en-IN')}` : '—'}</td>
                    <td style={tdStyle}>{r.narration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const pageWrap = { padding: 24, display: 'flex', flexDirection: 'column', gap: 20, background: '#F6F7FB', minHeight: '100%' };
const headerCard = { background: '#fff', padding: '20px 24px', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' };
const iconWrap = { width: 44, height: 44, borderRadius: 12, background: '#FEF0E6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const sectionCard = { background: '#fff', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' };
const sectionHeader = { display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #F1F5F9', background: '#FAFBFD' };
const sectionTitle = { fontSize: 14, fontWeight: 700, color: '#0B1F3B' };
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' };
const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E6E8F0', fontSize: 13, color: '#334155', boxSizing: 'border-box', outline: 'none' };
const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, border: 'none', background: '#F37920', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 8px rgba(243,121,32,0.2)' };
const btnSecondary = { padding: '9px 18px', borderRadius: 8, border: '1px solid #E6E8F0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const btnDanger = { padding: '6px 10px', borderRadius: 6, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = { textAlign: 'left', padding: '10px 12px', color: '#64748b', fontWeight: 600, fontSize: 11, borderBottom: '1px solid #E6E8F0', textTransform: 'uppercase', letterSpacing: '0.04em', background: '#FAFBFD' };
const tdStyle = { padding: '10px 12px', color: '#334155', borderBottom: '1px solid #F8FAFC' };
const badge = { display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, textTransform: 'capitalize' };

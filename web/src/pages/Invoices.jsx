import { useState, useEffect } from 'react';
import { getInvoices, createInvoice, recordPayment, getLedger } from '../services/invoiceService';
import { getOpeningBalances, saveOpeningBalance } from '../services/openingBalanceService';
import StatusBadge from '../components/common/StatusBadge';
import ClientSearchDropdown from '../components/common/ClientSearchDropdown';
import { BILLING_PROFILES, getBillingProfileByCode } from '../constants/billingProfiles';

function BillingProfileBadge({ code }) {
  const profile = getBillingProfileByCode(code);
  if (!code) return <span style={{ color:'#94a3b8' }}>—</span>;
  return (
    <span
      title={profile ? profile.name : code}
      style={{ background:'#f0f4ff', color:'#3730a3', padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700, whiteSpace:'nowrap', letterSpacing:'0.02em', display:'inline-block', border:'1px solid #c7d2fe' }}
    >
      {code}
    </span>
  );
}

function RaiseInvoiceModal({ onClose, onSave }) {
  const [form, setForm] = useState({ clientId: '', clientName: '', invoiceDate: new Date().toISOString().slice(0,10), dueDate: '', totalAmount: '', notes: '', billingProfileCode: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.clientId || !form.invoiceDate || !form.totalAmount) return;
    onSave(form);
    onClose();
  };
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={modalHeaderStyle}>
          <span style={{ fontSize:15, fontWeight:700 }}>🧾 Raise Invoice</span>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
          <label style={labelStyle}>
            Client
            <ClientSearchDropdown
              value={form.clientId}
              displayValue={form.clientName}
              onChange={c => setForm(f => ({ ...f, clientId: c.id, clientName: c.displayName }))}
              placeholder="Search client by name…"
              style={inputStyle}
            />
          </label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <label style={labelStyle}>
              Invoice Date
              <input type="date" style={inputStyle} value={form.invoiceDate} onChange={e=>set('invoiceDate',e.target.value)} />
            </label>
            <label style={labelStyle}>
              Due Date
              <input type="date" style={inputStyle} value={form.dueDate} onChange={e=>set('dueDate',e.target.value)} />
            </label>
          </div>
          <label style={labelStyle}>
            Amount (₹)
            <input type="number" style={inputStyle} placeholder="e.g. 5900" value={form.totalAmount} onChange={e=>set('totalAmount',e.target.value)} />
          </label>
          <label style={labelStyle}>
            Billing Profile
            <select style={inputStyle} value={form.billingProfileCode} onChange={e=>set('billingProfileCode',e.target.value)}>
              <option value="">— Select Billing Profile —</option>
              {BILLING_PROFILES.map(p=>(
                <option key={p.id} value={p.code}>{p.code} – {p.name}</option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Notes
            <input type="text" style={inputStyle} placeholder="Optional notes" value={form.notes} onChange={e=>set('notes',e.target.value)} />
          </label>
        </div>
        <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10 }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button onClick={handleSave} style={btnPrimary}>Save Invoice</button>
        </div>
      </div>
    </div>
  );
}

function RecordPaymentModal({ onClose, onSave, invoice }) {
  const [form, setForm] = useState({ amount: '', paymentDate: new Date().toISOString().slice(0,10), method: 'NEFT', reference: '', billingProfileCode: invoice?.billingProfileCode || '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.amount || !form.paymentDate) return;
    onSave(form);
    onClose();
  };
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={modalHeaderStyle}>
          <span style={{ fontSize:15, fontWeight:700 }}>💳 Record Payment</span>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        {invoice && (
          <div style={{ margin:'16px 24px 0', padding:'10px 14px', background:'#f8fafc', borderRadius:8, fontSize:12, color:'#475569' }}>
            Invoice: <strong>{invoice.invoiceNumber}</strong> · Client: <strong>{invoice.clientName}</strong> · Balance: <strong>₹{(invoice.totalAmount-invoice.amountPaid).toLocaleString('en-IN')}</strong>
          </div>
        )}
        <div style={{ padding:'16px 24px', display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <label style={labelStyle}>
              Amount (₹)
              <input type="number" style={inputStyle} placeholder="e.g. 5900" value={form.amount} onChange={e=>set('amount',e.target.value)} />
            </label>
            <label style={labelStyle}>
              Payment Date
              <input type="date" style={inputStyle} value={form.paymentDate} onChange={e=>set('paymentDate',e.target.value)} />
            </label>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <label style={labelStyle}>
              Payment Method
              <select style={inputStyle} value={form.method} onChange={e=>set('method',e.target.value)}>
                {['NEFT','RTGS','UPI','Cheque','Cash','IMPS'].map(m=><option key={m}>{m}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Reference No.
              <input type="text" style={inputStyle} placeholder="UTR / Cheque No." value={form.reference} onChange={e=>set('reference',e.target.value)} />
            </label>
          </div>
          <label style={labelStyle}>
            Billing Profile
            <select style={inputStyle} value={form.billingProfileCode} onChange={e=>set('billingProfileCode',e.target.value)}>
              <option value="">— Select Billing Profile —</option>
              {BILLING_PROFILES.map(p=>(
                <option key={p.id} value={p.code}>{p.code} – {p.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10 }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button onClick={handleSave} style={btnPrimary}>Save Payment</button>
        </div>
      </div>
    </div>
  );
}

function OpeningBalanceModal({ onClose, onSave, clientId, clientName, existingBalances }) {
  const [balances, setBalances] = useState(
    BILLING_PROFILES.map(p => {
      const existing = existingBalances.find(b => b.billingProfileCode === p.code);
      return {
        profileCode: p.code,
        profileName: p.name,
        amount:      existing ? String(existing.amount) : '',
        type:        existing ? existing.type : 'debit',
      };
    })
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function setField(idx, key, val) {
    setBalances(prev => prev.map((b, i) => i === idx ? { ...b, [key]: val } : b));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      for (const b of balances) {
        const amt = parseFloat(b.amount || '0');
        await saveOpeningBalance({
          clientId,
          billingProfileCode: b.profileCode,
          amount: amt,
          type:   b.type,
        });
      }
      onSave();
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to save opening balances.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, minWidth:520, maxWidth:620 }}>
        <div style={modalHeaderStyle}>
          <span style={{ fontSize:15, fontWeight:700 }}>📖 Opening Balances — {clientName}</span>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ padding:'16px 24px' }}>
          <p style={{ fontSize:12, color:'#64748b', margin:'0 0 16px 0' }}>
            Set the opening balance for each billing profile. Debit (Dr) = client owes you; Credit (Cr) = you owe client.
          </p>
          {balances.map((b, idx) => (
            <div key={b.profileCode} style={{ display:'grid', gridTemplateColumns:'1fr 140px 90px', gap:10, alignItems:'center', marginBottom:12 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'#475569' }}>{b.profileCode}</div>
                <div style={{ fontSize:11, color:'#94a3b8' }}>{b.profileName}</div>
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={b.amount}
                onChange={e => setField(idx, 'amount', e.target.value)}
                style={{ ...inputStyle, textAlign:'right' }}
              />
              <select
                value={b.type}
                onChange={e => setField(idx, 'type', e.target.value)}
                style={inputStyle}
              >
                <option value="debit">Dr (Debit)</option>
                <option value="credit">Cr (Credit)</option>
              </select>
            </div>
          ))}
          {error && <div style={{ color:'#dc2626', fontSize:12, marginTop:8 }}>{error}</div>}
        </div>
        <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10 }}>
          <button onClick={onClose} style={btnSecondary} disabled={saving}>Cancel</button>
          <button onClick={handleSave} style={btnPrimary} disabled={saving}>
            {saving ? 'Saving…' : '💾 Save Opening Balances'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Invoices() {
  const [tab, setTab] = useState('invoices');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showRaiseInvoice, setShowRaiseInvoice] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ledgerClientId, setLedgerClientId]     = useState('');
  const [ledgerClientName, setLedgerClientName] = useState('');
  const [ledger, setLedger]                     = useState([]);
  const [ledgerLoading, setLedgerLoading]       = useState(false);
  const [openingBalances, setOpeningBalances]   = useState([]);
  const [showOpeningModal, setShowOpeningModal] = useState(false);

  useEffect(() => {
    setLoading(true);
    getInvoices().catch(() => [])
      .then(invs => setInvoices(invs))
      .finally(() => setLoading(false));
  }, []);

  // Fetch ledger + opening balances whenever the selected client changes
  useEffect(() => {
    if (tab !== 'ledger' || !ledgerClientId) return;
    setLedgerLoading(true);
    Promise.all([
      getLedger(ledgerClientId).catch(() => []),
      getOpeningBalances(ledgerClientId).catch(() => []),
    ]).then(([entries, obs]) => {
      setLedger(entries);
      setOpeningBalances(obs);
    }).finally(() => setLedgerLoading(false));
  }, [tab, ledgerClientId]);

  const filtered = invoices.filter(i => statusFilter==='all' || i.status===statusFilter);
  const totalOutstanding = invoices.filter(i=>i.status!=='paid'&&i.status!=='cancelled').reduce((a,i)=>a+(i.totalAmount-i.amountPaid),0);
  const totalOverdue = invoices.filter(i=>i.status==='overdue').reduce((a,i)=>a+(i.totalAmount-i.amountPaid),0);

  function handleRaiseInvoice(data) {
    createInvoice(data)
      .then(newInvoice => setInvoices(prev => [newInvoice, ...prev]))
      .catch(() => {});
  }

  function handleRecordPayment(data) {
    if (!selectedInvoice) return;
    recordPayment(selectedInvoice.id, data)
      .then(updated => {
        setInvoices(prev => prev.map(inv => inv.id === updated.id ? updated : inv));
        setSelectedInvoice(null);
        setShowRecordPayment(false);
      })
      .catch(() => {
        setSelectedInvoice(null);
        setShowRecordPayment(false);
      });
  }

  function handleOpeningBalanceSaved() {
    if (ledgerClientId) {
      Promise.all([
        getLedger(ledgerClientId).catch(() => []),
        getOpeningBalances(ledgerClientId).catch(() => []),
      ]).then(([entries, obs]) => {
        setLedger(entries);
        setOpeningBalances(obs);
      });
    }
  }

  return (
    <div style={{ padding:24 }}>
      {showRaiseInvoice && (
        <RaiseInvoiceModal
          onClose={() => setShowRaiseInvoice(false)}
          onSave={(data) => { handleRaiseInvoice(data); setShowRaiseInvoice(false); }}
        />
      )}
      {showRecordPayment && (
        <RecordPaymentModal
          invoice={selectedInvoice}
          onClose={() => { setShowRecordPayment(false); setSelectedInvoice(null); }}
          onSave={handleRecordPayment}
        />
      )}
      {showOpeningModal && ledgerClientId && (
        <OpeningBalanceModal
          clientId={ledgerClientId}
          clientName={ledgerClientName}
          existingBalances={openingBalances}
          onClose={() => setShowOpeningModal(false)}
          onSave={handleOpeningBalanceSaved}
        />
      )}

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        {[
          { label:'Total Billed', value:`₹${invoices.reduce((a,i)=>a+i.totalAmount,0).toLocaleString('en-IN')}`, color:'#2563eb' },
          { label:'Total Collected', value:`₹${invoices.reduce((a,i)=>a+i.amountPaid,0).toLocaleString('en-IN')}`, color:'#16a34a' },
          { label:'Outstanding', value:`₹${totalOutstanding.toLocaleString('en-IN')}`, color:'#d97706' },
          { label:'Overdue', value:`₹${totalOverdue.toLocaleString('en-IN')}`, color:'#dc2626' },
        ].map(s=>(
          <div key={s.label} style={{ background:'#fff', borderRadius:10, padding:'16px 20px', boxShadow:'0 1px 3px rgba(0,0,0,.08)', borderLeft:`4px solid ${s.color}` }}>
            <div style={{ fontSize:22, fontWeight:700, color:'#1e293b' }}>{s.value}</div>
            <div style={{ fontSize:12, color:'#64748b', marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:'2px solid #e2e8f0' }}>
        {['invoices','ledger'].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{ padding:'8px 20px', background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:600, color: tab===t?'#2563eb':'#64748b', borderBottom: tab===t?'2px solid #2563eb':'2px solid transparent', marginBottom:-2 }}>
            {t==='invoices'?'🧾 Invoices':'📒 Ledger'}
          </button>
        ))}
        <button onClick={() => setShowRaiseInvoice(true)} style={{ ...btnPrimary, marginLeft:'auto' }}>🧾 Raise Invoice</button>
      </div>

      {tab==='invoices' && (
        <div style={cardStyle}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #f1f5f9', display:'flex', gap:8 }}>
            {['all','draft','sent','partially_paid','paid','overdue'].map(s=>(
              <button key={s} onClick={()=>setStatusFilter(s)} style={{ padding:'4px 12px', background: statusFilter===s?'#2563eb':'#f8fafc', color: statusFilter===s?'#fff':'#64748b', border:'1px solid #e2e8f0', borderRadius:16, fontSize:12, cursor:'pointer', fontWeight:600 }}>
                {s==='all'?'All':s.replace(/_/g,' ')}
              </button>
            ))}
          </div>
          <table style={tableStyle}>
            <thead>
              <tr>{['Invoice #','Client','Date','Due Date','Amount','Paid','Balance','Status','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map(i=>(
                <tr key={i.id} style={trStyle}>
                  <td style={{ ...tdStyle, fontWeight:600, fontFamily:'monospace', fontSize:12 }}>{i.invoiceNumber}</td>
                  <td style={tdStyle}>{i.clientName}</td>
                  <td style={tdStyle}>{i.invoiceDate}</td>
                  <td style={tdStyle}>{i.dueDate}</td>
                  <td style={{ ...tdStyle, fontWeight:600 }}>₹{i.totalAmount.toLocaleString('en-IN')}</td>
                  <td style={{ ...tdStyle, color:'#16a34a' }}>₹{i.amountPaid.toLocaleString('en-IN')}</td>
                  <td style={{ ...tdStyle, color: i.status==='paid'?'#16a34a':'#dc2626', fontWeight:600 }}>₹{(i.totalAmount-i.amountPaid).toLocaleString('en-IN')}</td>
                  <td style={tdStyle}><StatusBadge status={i.status} /></td>
                  <td style={tdStyle}>
                    <button style={iconBtn}>👁️</button>
                    <button style={iconBtn}>📧</button>
                    <button style={iconBtn} onClick={() => { setSelectedInvoice(i); setShowRecordPayment(true); }}>💳 Record Payment</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==='ledger' && (
        <div style={cardStyle}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #f1f5f9', display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontSize:13, color:'#64748b', whiteSpace:'nowrap' }}>Client:</span>
            <div style={{ flex:'0 0 280px' }}>
              <ClientSearchDropdown
                value={ledgerClientId}
                displayValue={ledgerClientName}
                onChange={c => {
                  setLedgerClientId(String(c.id));
                  setLedgerClientName(c.displayName);
                }}
                placeholder="Search client…"
              />
            </div>
            {ledgerClientId && (
              <button
                style={{ ...btnSecondary, fontSize:12, padding:'6px 12px', whiteSpace:'nowrap' }}
                onClick={() => setShowOpeningModal(true)}
              >
                📖 Opening Balances
              </button>
            )}
          </div>
          {!ledgerClientId ? (
            <div style={{ padding:32, textAlign:'center', color:'#94a3b8', fontSize:13 }}>
              Search for a client above to view their ledger.
            </div>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  {['Date','Narration','Billing Profile','Debit (Dr)','Credit (Cr)','Balance'].map(h=>(
                    <th key={h} style={thStyle} title={h} aria-label={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledgerLoading ? (
                  <tr><td colSpan={6} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Loading ledger…</td></tr>
                ) : ledger.length === 0 ? (
                  <tr><td colSpan={6} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No ledger entries for this client.</td></tr>
                ) : ledger.map((e,i)=>(
                  <tr key={i} style={{ ...trStyle, ...(e.entryType==='opening_balance' ? { background:'#fffbeb' } : {}) }}>
                    <td style={tdStyle}>{e.date || '—'}</td>
                    <td style={{ ...tdStyle, fontStyle: e.entryType==='opening_balance' ? 'italic' : 'normal' }}>{e.narration}</td>
                    <td style={tdStyle}><BillingProfileBadge code={e.billingProfileCode} /></td>
                    <td style={{ ...tdStyle, color:'#dc2626', fontWeight: e.debit?600:400 }}>{e.debit ? `₹${parseFloat(e.debit).toLocaleString('en-IN')}` : '—'}</td>
                    <td style={{ ...tdStyle, color:'#16a34a', fontWeight: e.credit?600:400 }}>{e.credit ? `₹${parseFloat(e.credit).toLocaleString('en-IN')}` : '—'}</td>
                    <td style={{ ...tdStyle, fontWeight:700 }}>₹{parseFloat(e.balance).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

const cardStyle = { background:'#fff', borderRadius:10, boxShadow:'0 1px 3px rgba(0,0,0,.08)', overflow:'auto' };
const tableStyle = { width:'100%', borderCollapse:'collapse', fontSize:13 };
const thStyle = { textAlign:'left', padding:'10px 12px', color:'#64748b', fontWeight:600, fontSize:12, borderBottom:'2px solid #f1f5f9', background:'#f8fafc', whiteSpace:'nowrap' };
const tdStyle = { padding:'10px 12px', color:'#334155', verticalAlign:'middle', whiteSpace:'nowrap' };
const trStyle = { borderBottom:'1px solid #f8fafc' };
const btnPrimary = { padding:'8px 16px', background:'#2563eb', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600 };
const btnSecondary = { padding:'8px 16px', background:'#f8fafc', color:'#475569', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600 };
const iconBtn = { background:'none', border:'none', cursor:'pointer', fontSize:13, padding:'2px 6px', marginRight:2, color:'#2563eb' };
const overlayStyle = { position:'fixed', inset:0, background:'rgba(15,23,42,0.35)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' };
const modalStyle = { background:'#fff', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.18)', minWidth:480, maxWidth:560, width:'100%' };
const modalHeaderStyle = { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 24px', borderBottom:'1px solid #f1f5f9' };
const closeBtnStyle = { background:'none', border:'none', cursor:'pointer', fontSize:16, color:'#64748b', padding:'2px 6px', borderRadius:4 };
const labelStyle = { display:'flex', flexDirection:'column', gap:4, fontSize:12, fontWeight:600, color:'#475569' };
const inputStyle = { padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, color:'#334155', outline:'none' };

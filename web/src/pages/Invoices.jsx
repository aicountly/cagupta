import { useState, useEffect } from 'react';
import {
  getTxns, createTxn, createReceipt, createTds, finalizeTds,
  getTdsEntries, createRebate, createCreditNote, getLedger,
  getOpeningBalance, setOpeningBalance,
} from '../services/txnService';
import StatusBadge from '../components/common/StatusBadge';
import ClientSearchDropdown from '../components/common/ClientSearchDropdown';
import { BILLING_PROFILES, getBillingProfileByCode } from '../constants/billingProfiles';

// ── Shared badge components ───────────────────────────────────────────────────

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

const TXN_TYPE_COLORS = {
  invoice:         { bg:'#fff7ed', color:'#c2410c', border:'#fed7aa' },
  receipt:         { bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0' },
  tds_provisional: { bg:'#faf5ff', color:'#7e22ce', border:'#e9d5ff' },
  tds_final:       { bg:'#ede9fe', color:'#5b21b6', border:'#c4b5fd' },
  rebate:          { bg:'#fff1f2', color:'#be123c', border:'#fecdd3' },
  credit_note:     { bg:'#fef9c3', color:'#854d0e', border:'#fde68a' },
  opening_balance: { bg:'#fffbeb', color:'#92400e', border:'#fde68a' },
  payment_expense: { bg:'#f0f9ff', color:'#075985', border:'#bae6fd' },
};

function TxnTypeBadge({ type }) {
  const c = TXN_TYPE_COLORS[type] || { bg:'#f1f5f9', color:'#475569', border:'#e2e8f0' };
  const labels = {
    invoice: 'Invoice', receipt: 'Receipt', tds_provisional: 'TDS (Prov.)',
    tds_final: 'TDS (Final)', rebate: 'Rebate', credit_note: 'Credit Note',
    opening_balance: 'Opening Bal.', payment_expense: 'Payment Exp.',
  };
  return (
    <span style={{ background:c.bg, color:c.color, border:`1px solid ${c.border}`, padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700, whiteSpace:'nowrap', display:'inline-block' }}>
      {labels[type] || type}
    </span>
  );
}

const TDS_SECTIONS = ['194J','194C','194H','194I','194A','194Q','Other'];

// ── RaiseInvoiceModal ─────────────────────────────────────────────────────────

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

// ── RecordPaymentModal ────────────────────────────────────────────────────────

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
            Invoice: <strong>{invoice.invoiceNumber}</strong> · Client: <strong>{invoice.clientName}</strong>
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

// ── ReceiptModal ──────────────────────────────────────────────────────────────

function ReceiptModal({ onClose, onSave, openInvoices }) {
  const [form, setForm] = useState({ clientId: '', clientName: '', amount: '', txnDate: new Date().toISOString().slice(0,10), method: 'NEFT', referenceNumber: '', billingProfileCode: '', linkedTxnId: '', notes: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.clientId || !form.amount || !form.txnDate) return;
    onSave(form);
    onClose();
  };
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={modalHeaderStyle}>
          <span style={{ fontSize:15, fontWeight:700 }}>💵 Record Receipt</span>
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
            />
          </label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <label style={labelStyle}>
              Amount (₹)
              <input type="number" style={inputStyle} placeholder="e.g. 5900" value={form.amount} onChange={e=>set('amount',e.target.value)} />
            </label>
            <label style={labelStyle}>
              Receipt Date
              <input type="date" style={inputStyle} value={form.txnDate} onChange={e=>set('txnDate',e.target.value)} />
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
              Reference No. (UTR / Cheque No)
              <input type="text" style={inputStyle} placeholder="UTR / Cheque No." value={form.referenceNumber} onChange={e=>set('referenceNumber',e.target.value)} />
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
          <label style={labelStyle}>
            Linked Invoice (optional)
            <select style={inputStyle} value={form.linkedTxnId} onChange={e=>set('linkedTxnId',e.target.value)}>
              <option value="">— None —</option>
              {(openInvoices || []).map(inv=>(
                <option key={inv.id} value={inv.id}>{inv.invoiceNumber} – {inv.clientName}</option>
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
          <button onClick={handleSave} style={btnPrimary}>Save Receipt</button>
        </div>
      </div>
    </div>
  );
}

// ── TdsModal ──────────────────────────────────────────────────────────────────

function TdsModal({ onClose, onSave }) {
  const [form, setForm] = useState({ clientId: '', clientName: '', amount: '', txnDate: new Date().toISOString().slice(0,10), tdsSection: '194J', tdsRate: '', billingProfileCode: '', notes: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.clientId || !form.amount || !form.txnDate) return;
    onSave(form);
    onClose();
  };
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={modalHeaderStyle}>
          <span style={{ fontSize:15, fontWeight:700 }}>📋 Book TDS</span>
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
            />
          </label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <label style={labelStyle}>
              Amount (₹)
              <input type="number" style={inputStyle} placeholder="e.g. 5000" value={form.amount} onChange={e=>set('amount',e.target.value)} />
            </label>
            <label style={labelStyle}>
              TDS Date
              <input type="date" style={inputStyle} value={form.txnDate} onChange={e=>set('txnDate',e.target.value)} />
            </label>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <label style={labelStyle}>
              TDS Section
              <select style={inputStyle} value={form.tdsSection} onChange={e=>set('tdsSection',e.target.value)}>
                {TDS_SECTIONS.map(s=><option key={s}>{s}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              TDS Rate (%)
              <input type="number" style={inputStyle} placeholder="e.g. 10" value={form.tdsRate} onChange={e=>set('tdsRate',e.target.value)} />
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
          <label style={labelStyle}>
            Notes
            <input type="text" style={inputStyle} placeholder="Optional notes" value={form.notes} onChange={e=>set('notes',e.target.value)} />
          </label>
        </div>
        <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10 }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button onClick={handleSave} style={btnPrimary}>Book TDS</button>
        </div>
      </div>
    </div>
  );
}

// ── RebateModal ───────────────────────────────────────────────────────────────

function RebateModal({ onClose, onSave }) {
  const [form, setForm] = useState({ clientId: '', clientName: '', amount: '', txnDate: new Date().toISOString().slice(0,10), narration: '', billingProfileCode: '', notes: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.clientId || !form.amount || !form.txnDate) return;
    onSave(form);
    onClose();
  };
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={modalHeaderStyle}>
          <span style={{ fontSize:15, fontWeight:700 }}>💸 Add Rebate / Discount</span>
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
            />
          </label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <label style={labelStyle}>
              Amount (₹)
              <input type="number" style={inputStyle} placeholder="e.g. 1000" value={form.amount} onChange={e=>set('amount',e.target.value)} />
            </label>
            <label style={labelStyle}>
              Date
              <input type="date" style={inputStyle} value={form.txnDate} onChange={e=>set('txnDate',e.target.value)} />
            </label>
          </div>
          <label style={labelStyle}>
            Narration
            <input type="text" style={inputStyle} placeholder="e.g. Discount on outstanding for FY 2024-25" value={form.narration} onChange={e=>set('narration',e.target.value)} />
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
          <button onClick={handleSave} style={btnPrimary}>Save Rebate</button>
        </div>
      </div>
    </div>
  );
}

// ── CreditNoteModal ───────────────────────────────────────────────────────────

function CreditNoteModal({ onClose, onSave, openInvoices }) {
  const [form, setForm] = useState({ clientId: '', clientName: '', linkedTxnId: '', amount: '', txnDate: new Date().toISOString().slice(0,10), narration: '', billingProfileCode: '', notes: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.clientId || !form.amount || !form.linkedTxnId) return;
    onSave(form);
    onClose();
  };
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={modalHeaderStyle}>
          <span style={{ fontSize:15, fontWeight:700 }}>📝 Credit Note</span>
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
            />
          </label>
          <label style={labelStyle}>
            Original Invoice (required)
            <select style={inputStyle} value={form.linkedTxnId} onChange={e=>set('linkedTxnId',e.target.value)}>
              <option value="">— Select Invoice —</option>
              {(openInvoices || []).map(inv=>(
                <option key={inv.id} value={inv.id}>{inv.invoiceNumber} – {inv.clientName} (₹{inv.amount?.toLocaleString('en-IN')})</option>
              ))}
            </select>
          </label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <label style={labelStyle}>
              Amount (₹)
              <input type="number" style={inputStyle} placeholder="Partial or full amount" value={form.amount} onChange={e=>set('amount',e.target.value)} />
            </label>
            <label style={labelStyle}>
              Date
              <input type="date" style={inputStyle} value={form.txnDate} onChange={e=>set('txnDate',e.target.value)} />
            </label>
          </div>
          <label style={labelStyle}>
            Narration
            <input type="text" style={inputStyle} placeholder="Reason for credit note" value={form.narration} onChange={e=>set('narration',e.target.value)} />
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
          <button onClick={handleSave} style={btnPrimary}>Save Credit Note</button>
        </div>
      </div>
    </div>
  );
}

// ── OpeningBalanceModal ───────────────────────────────────────────────────────

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
        await setOpeningBalance({
          client_id:            clientId,
          billing_profile_code: b.profileCode,
          amount:               amt,
          type:                 b.type,
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

// ── Main Invoices page ────────────────────────────────────────────────────────

export default function Invoices() {
  const [tab, setTab] = useState('invoices');

  // ── Invoice tab state ───────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter]         = useState('all');
  const [showRaiseInvoice, setShowRaiseInvoice] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [selectedInvoice, setSelectedInvoice]   = useState(null);
  const [invoices, setInvoices]                 = useState([]);
  const [invLoading, setInvLoading]             = useState(true);

  // ── Receipts tab state ──────────────────────────────────────────────────────
  const [receipts, setReceipts]         = useState([]);
  const [recLoading, setRecLoading]     = useState(false);
  const [recLoaded, setRecLoaded]       = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // ── TDS tab state ───────────────────────────────────────────────────────────
  const [tdsFilter, setTdsFilter]       = useState('all');
  const [tdsEntries, setTdsEntries]     = useState([]);
  const [tdsLoading, setTdsLoading]     = useState(false);
  const [selectedTds, setSelectedTds]   = useState([]);
  const [showTdsModal, setShowTdsModal] = useState(false);

  // ── Rebate tab state ────────────────────────────────────────────────────────
  const [rebates, setRebates]               = useState([]);
  const [rebLoading, setRebLoading]         = useState(false);
  const [rebLoaded, setRebLoaded]           = useState(false);
  const [showRebateModal, setShowRebateModal] = useState(false);

  // ── Credit Note tab state ───────────────────────────────────────────────────
  const [creditNotes, setCreditNotes]     = useState([]);
  const [cnLoading, setCnLoading]         = useState(false);
  const [cnLoaded, setCnLoaded]           = useState(false);
  const [showCnModal, setShowCnModal]     = useState(false);

  // ── Ledger tab state ────────────────────────────────────────────────────────
  const [ledgerClientId, setLedgerClientId]     = useState('');
  const [ledgerClientName, setLedgerClientName] = useState('');
  const [ledger, setLedger]                     = useState([]);
  const [ledgerLoading, setLedgerLoading]       = useState(false);
  const [openingBalances, setOpeningBalances]   = useState([]);
  const [showOpeningModal, setShowOpeningModal] = useState(false);

  // ── Load invoices on mount ──────────────────────────────────────────────────
  useEffect(() => {
    setInvLoading(true);
    getTxns({ txnType: 'invoice' })
      .then(({ txns }) => setInvoices(txns))
      .catch(() => {})
      .finally(() => setInvLoading(false));
  }, []);

  // ── Load receipts when receipts tab first opened ────────────────────────────
  useEffect(() => {
    if (tab !== 'receipts' || recLoaded) return;
    setRecLoading(true);
    getTxns({ txnType: 'receipt' })
      .then(({ txns }) => { setReceipts(txns); setRecLoaded(true); })
      .catch(() => {})
      .finally(() => setRecLoading(false));
  }, [tab, recLoaded]);

  // ── Load TDS when tds tab opened or filter changes ──────────────────────────
  useEffect(() => {
    if (tab !== 'tds') return;
    setTdsLoading(true);
    const params = tdsFilter === 'all' ? {} : { tdsStatus: tdsFilter };
    getTdsEntries(params)
      .then(entries => setTdsEntries(entries))
      .catch(() => {})
      .finally(() => setTdsLoading(false));
  }, [tab, tdsFilter]);

  // ── Load rebates when rebate tab first opened ───────────────────────────────
  useEffect(() => {
    if (tab !== 'rebate' || rebLoaded) return;
    setRebLoading(true);
    getTxns({ txnType: 'rebate' })
      .then(({ txns }) => { setRebates(txns); setRebLoaded(true); })
      .catch(() => {})
      .finally(() => setRebLoading(false));
  }, [tab, rebLoaded]);

  // ── Load credit notes when credit_note tab first opened ────────────────────
  useEffect(() => {
    if (tab !== 'credit_note' || cnLoaded) return;
    setCnLoading(true);
    getTxns({ txnType: 'credit_note' })
      .then(({ txns }) => { setCreditNotes(txns); setCnLoaded(true); })
      .catch(() => {})
      .finally(() => setCnLoading(false));
  }, [tab, cnLoaded]);

  // ── Ledger reload ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'ledger' || !ledgerClientId) return;
    setLedgerLoading(true);
    Promise.all([
      getLedger(ledgerClientId).catch(() => []),
      getOpeningBalance(ledgerClientId).catch(() => []),
    ]).then(([entries, obs]) => {
      setLedger(entries);
      setOpeningBalances(obs);
    }).finally(() => setLedgerLoading(false));
  }, [tab, ledgerClientId]);

  // ── Summary cards ───────────────────────────────────────────────────────────
  const totalBilled    = invoices.reduce((a, i) => a + (i.amount || i.debit || 0), 0);
  const totalCollected = receipts.reduce((a, r) => a + (r.amount || r.credit || 0), 0);
  const outstanding    = totalBilled - totalCollected;
  const tdsPending     = tdsEntries.filter(t => t.tdsStatus === 'provisional').reduce((a, t) => a + t.amount, 0);

  const filteredInvoices = invoices.filter(i =>
    statusFilter === 'all' || i.invoiceStatus === statusFilter || i.status === statusFilter
  );

  // ── Invoice handlers ────────────────────────────────────────────────────────
  function handleRaiseInvoice(data) {
    createTxn({
      txn_type:             'invoice',
      client_id:            data.clientId,
      txn_date:             data.invoiceDate,
      due_date:             data.dueDate,
      amount:               parseFloat(data.totalAmount),
      billing_profile_code: data.billingProfileCode,
      notes:                data.notes,
    })
      .then(newInv => setInvoices(prev => [newInv, ...prev]))
      .catch(() => {});
  }

  function handleRecordPayment(data) {
    if (!selectedInvoice) return;
    createReceipt({
      client_id:            selectedInvoice.clientId,
      amount:               parseFloat(data.amount),
      txn_date:             data.paymentDate,
      payment_method:       data.method,
      reference_number:     data.reference,
      billing_profile_code: data.billingProfileCode,
      linked_txn_id:        selectedInvoice.id,
    })
      .then(rec => {
        setReceipts(prev => [rec, ...prev]);
        setSelectedInvoice(null);
        setShowRecordPayment(false);
      })
      .catch(() => {
        setSelectedInvoice(null);
        setShowRecordPayment(false);
      });
  }

  function handleSaveReceipt(data) {
    createReceipt({
      client_id:            data.clientId,
      amount:               parseFloat(data.amount),
      txn_date:             data.txnDate,
      payment_method:       data.method,
      reference_number:     data.referenceNumber,
      billing_profile_code: data.billingProfileCode,
      linked_txn_id:        data.linkedTxnId || null,
      notes:                data.notes,
    })
      .then(rec => setReceipts(prev => [rec, ...prev]))
      .catch(() => {});
  }

  function handleSaveTds(data) {
    createTds({
      client_id:            data.clientId,
      amount:               parseFloat(data.amount),
      txn_date:             data.txnDate,
      tds_section:          data.tdsSection,
      tds_rate:             parseFloat(data.tdsRate) || 0,
      billing_profile_code: data.billingProfileCode,
      notes:                data.notes,
    })
      .then(entry => setTdsEntries(prev => [entry, ...prev]))
      .catch(() => {});
  }

  async function handleFinalizeTds() {
    for (const id of selectedTds) {
      await finalizeTds(id).catch(() => {});
    }
    setSelectedTds([]);
    setTdsLoading(true);
    const params = tdsFilter === 'all' ? {} : { tdsStatus: tdsFilter };
    getTdsEntries(params)
      .then(entries => setTdsEntries(entries))
      .catch(() => {})
      .finally(() => setTdsLoading(false));
  }

  function handleSaveRebate(data) {
    createRebate({
      client_id:            data.clientId,
      amount:               parseFloat(data.amount),
      txn_date:             data.txnDate,
      narration:            data.narration,
      billing_profile_code: data.billingProfileCode,
      notes:                data.notes,
    })
      .then(reb => setRebates(prev => [reb, ...prev]))
      .catch(() => {});
  }

  function handleSaveCreditNote(data) {
    createCreditNote({
      client_id:            data.clientId,
      amount:               parseFloat(data.amount),
      txn_date:             data.txnDate,
      linked_txn_id:        data.linkedTxnId,
      narration:            data.narration,
      billing_profile_code: data.billingProfileCode,
      notes:                data.notes,
    })
      .then(cn => setCreditNotes(prev => [cn, ...prev]))
      .catch(() => {});
  }

  function handleOpeningBalanceSaved() {
    if (ledgerClientId) {
      Promise.all([
        getLedger(ledgerClientId).catch(() => []),
        getOpeningBalance(ledgerClientId).catch(() => []),
      ]).then(([entries, obs]) => {
        setLedger(entries);
        setOpeningBalances(obs);
      });
    }
  }

  function toggleTdsSelect(id) {
    setSelectedTds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  const TABS = [
    { key:'invoices',    label:'🧾 Invoices' },
    { key:'receipts',    label:'💵 Receipts' },
    { key:'tds',         label:'📋 TDS' },
    { key:'rebate',      label:'💸 Rebate/Discount' },
    { key:'credit_note', label:'📝 Credit Notes' },
    { key:'ledger',      label:'📒 Ledger' },
  ];

  return (
    <div style={{ padding:24 }}>
      {/* ── Modals ─────────────────────────────────────────────────────────── */}
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
      {showReceiptModal && (
        <ReceiptModal
          openInvoices={invoices}
          onClose={() => setShowReceiptModal(false)}
          onSave={(data) => { handleSaveReceipt(data); setShowReceiptModal(false); }}
        />
      )}
      {showTdsModal && (
        <TdsModal
          onClose={() => setShowTdsModal(false)}
          onSave={(data) => { handleSaveTds(data); setShowTdsModal(false); }}
        />
      )}
      {showRebateModal && (
        <RebateModal
          onClose={() => setShowRebateModal(false)}
          onSave={(data) => { handleSaveRebate(data); setShowRebateModal(false); }}
        />
      )}
      {showCnModal && (
        <CreditNoteModal
          openInvoices={invoices}
          onClose={() => setShowCnModal(false)}
          onSave={(data) => { handleSaveCreditNote(data); setShowCnModal(false); }}
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

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        {[
          { label:'Total Billed',    value:`₹${totalBilled.toLocaleString('en-IN')}`,    color:'#2563eb' },
          { label:'Total Collected', value:`₹${totalCollected.toLocaleString('en-IN')}`, color:'#16a34a' },
          { label:'Outstanding',     value:`₹${outstanding.toLocaleString('en-IN')}`,    color:'#d97706' },
          { label:'TDS Pending',     value:`₹${tdsPending.toLocaleString('en-IN')}`,     color:'#7c3aed' },
        ].map(s=>(
          <div key={s.label} style={{ background:'#fff', borderRadius:10, padding:'16px 20px', boxShadow:'0 1px 3px rgba(0,0,0,.08)', borderLeft:`4px solid ${s.color}` }}>
            <div style={{ fontSize:22, fontWeight:700, color:'#1e293b' }}>{s.value}</div>
            <div style={{ fontSize:12, color:'#64748b', marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:'2px solid #e2e8f0', flexWrap:'wrap' }}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{ padding:'8px 16px', background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:600, color: tab===t.key?'#2563eb':'#64748b', borderBottom: tab===t.key?'2px solid #2563eb':'2px solid transparent', marginBottom:-2, whiteSpace:'nowrap' }}>
            {t.label}
          </button>
        ))}
        {tab==='invoices' && (
          <button onClick={() => setShowRaiseInvoice(true)} style={{ ...btnPrimary, marginLeft:'auto' }}>🧾 Raise Invoice</button>
        )}
        {tab==='receipts' && (
          <button onClick={() => setShowReceiptModal(true)} style={{ ...btnPrimary, marginLeft:'auto' }}>+ Receipt</button>
        )}
        {tab==='tds' && (
          <button onClick={() => setShowTdsModal(true)} style={{ ...btnPrimary, marginLeft:'auto' }}>+ Book TDS</button>
        )}
        {tab==='rebate' && (
          <button onClick={() => setShowRebateModal(true)} style={{ ...btnPrimary, marginLeft:'auto' }}>+ Rebate/Discount</button>
        )}
        {tab==='credit_note' && (
          <button onClick={() => setShowCnModal(true)} style={{ ...btnPrimary, marginLeft:'auto' }}>+ Credit Note</button>
        )}
      </div>

      {/* ── Tab: Invoices ─────────────────────────────────────────────────── */}
      {tab==='invoices' && (
        <div style={cardStyle}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #f1f5f9', display:'flex', gap:8, flexWrap:'wrap' }}>
            {['all','draft','sent','partially_paid','paid','overdue'].map(s=>(
              <button key={s} onClick={()=>setStatusFilter(s)} style={{ padding:'4px 12px', background: statusFilter===s?'#2563eb':'#f8fafc', color: statusFilter===s?'#fff':'#64748b', border:'1px solid #e2e8f0', borderRadius:16, fontSize:12, cursor:'pointer', fontWeight:600 }}>
                {s==='all'?'All':s.replace(/_/g,' ')}
              </button>
            ))}
          </div>
          <table style={tableStyle}>
            <thead>
              <tr>{['Invoice #','Client','Date','Due Date','Amount','Billing Profile','Status','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {invLoading ? (
                <tr><td colSpan={8} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Loading invoices…</td></tr>
              ) : filteredInvoices.length === 0 ? (
                <tr><td colSpan={8} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No invoices found.</td></tr>
              ) : filteredInvoices.map(i=>(
                <tr key={i.id} style={trStyle}>
                  <td style={{ ...tdStyle, fontWeight:600, fontFamily:'monospace', fontSize:12 }}>{i.invoiceNumber || `INV-${i.id}`}</td>
                  <td style={tdStyle}>{i.clientName}</td>
                  <td style={tdStyle}>{i.txnDate || i.invoiceDate}</td>
                  <td style={tdStyle}>{i.dueDate || '—'}</td>
                  <td style={{ ...tdStyle, fontWeight:600 }}>₹{(i.amount || i.debit || 0).toLocaleString('en-IN')}</td>
                  <td style={tdStyle}><BillingProfileBadge code={i.billingProfileCode} /></td>
                  <td style={tdStyle}><StatusBadge status={i.invoiceStatus || i.status} /></td>
                  <td style={tdStyle}>
                    <button style={iconBtn} onClick={() => { setSelectedInvoice(i); setShowRecordPayment(true); }}>💳 Record Payment</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: Receipts ─────────────────────────────────────────────────── */}
      {tab==='receipts' && (
        <div style={cardStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>{['Date','Client','Amount','Method','Reference No.','Billing Profile','Linked Invoice','Notes'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {recLoading ? (
                <tr><td colSpan={8} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Loading receipts…</td></tr>
              ) : receipts.length === 0 ? (
                <tr><td colSpan={8} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No receipts found. Click "+ Receipt" to record one.</td></tr>
              ) : receipts.map(r=>(
                <tr key={r.id} style={trStyle}>
                  <td style={tdStyle}>{r.txnDate}</td>
                  <td style={tdStyle}>{r.clientName}</td>
                  <td style={{ ...tdStyle, fontWeight:600, color:'#16a34a' }}>₹{r.amount.toLocaleString('en-IN')}</td>
                  <td style={tdStyle}>{r.paymentMethod || '—'}</td>
                  <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:12 }}>{r.referenceNumber || '—'}</td>
                  <td style={tdStyle}><BillingProfileBadge code={r.billingProfileCode} /></td>
                  <td style={tdStyle}>{r.linkedTxnId ? `#${r.linkedTxnId}` : '—'}</td>
                  <td style={tdStyle}>{r.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: TDS ──────────────────────────────────────────────────────── */}
      {tab==='tds' && (
        <div style={cardStyle}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #f1f5f9', display:'flex', gap:8, alignItems:'center' }}>
            {['all','provisional','final'].map(s=>(
              <button key={s} onClick={()=>{ setTdsFilter(s); setSelectedTds([]); }} style={{ padding:'4px 12px', background: tdsFilter===s?'#7c3aed':'#f8fafc', color: tdsFilter===s?'#fff':'#64748b', border:'1px solid #e2e8f0', borderRadius:16, fontSize:12, cursor:'pointer', fontWeight:600 }}>
                {s==='all'?'All':s.charAt(0).toUpperCase()+s.slice(1)}
              </button>
            ))}
            {selectedTds.length > 0 && (
              <button onClick={handleFinalizeTds} style={{ ...btnPrimary, background:'#7c3aed', marginLeft:8, fontSize:12, padding:'6px 14px' }}>
                ✅ Mark as Final ({selectedTds.length} selected)
              </button>
            )}
          </div>
          <table style={tableStyle}>
            <thead>
              <tr>{['','Date','Client','Amount','Section','Rate','Status','Billing Profile'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {tdsLoading ? (
                <tr><td colSpan={8} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Loading TDS entries…</td></tr>
              ) : tdsEntries.length === 0 ? (
                <tr><td colSpan={8} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No TDS entries found. Click "+ Book TDS" to add one.</td></tr>
              ) : tdsEntries.map(t=>(
                <tr key={t.id} style={trStyle}>
                  <td style={{ ...tdStyle, width:32 }}>
                    {t.tdsStatus === 'provisional' && (
                      <input type="checkbox" checked={selectedTds.includes(t.id)} onChange={()=>toggleTdsSelect(t.id)} />
                    )}
                  </td>
                  <td style={tdStyle}>{t.txnDate}</td>
                  <td style={tdStyle}>{t.clientName}</td>
                  <td style={{ ...tdStyle, fontWeight:600 }}>₹{t.amount.toLocaleString('en-IN')}</td>
                  <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:12 }}>{t.tdsSection || '—'}</td>
                  <td style={tdStyle}>{t.tdsRate ? `${t.tdsRate}%` : '—'}</td>
                  <td style={tdStyle}><TxnTypeBadge type={t.txnType} /></td>
                  <td style={tdStyle}><BillingProfileBadge code={t.billingProfileCode} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: Rebate/Discount ──────────────────────────────────────────── */}
      {tab==='rebate' && (
        <div style={cardStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>{['Date','Client','Amount','Narration','Billing Profile','Notes'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rebLoading ? (
                <tr><td colSpan={6} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Loading rebate entries…</td></tr>
              ) : rebates.length === 0 ? (
                <tr><td colSpan={6} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No rebate/discount entries found. Click "+ Rebate/Discount" to add one.</td></tr>
              ) : rebates.map(r=>(
                <tr key={r.id} style={trStyle}>
                  <td style={tdStyle}>{r.txnDate}</td>
                  <td style={tdStyle}>{r.clientName}</td>
                  <td style={{ ...tdStyle, fontWeight:600, color:'#be123c' }}>₹{r.amount.toLocaleString('en-IN')}</td>
                  <td style={tdStyle}>{r.narration || '—'}</td>
                  <td style={tdStyle}><BillingProfileBadge code={r.billingProfileCode} /></td>
                  <td style={tdStyle}>{r.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: Credit Notes ─────────────────────────────────────────────── */}
      {tab==='credit_note' && (
        <div style={cardStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>{['Date','Client','Amount','Linked Invoice','Narration','Billing Profile'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {cnLoading ? (
                <tr><td colSpan={6} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Loading credit notes…</td></tr>
              ) : creditNotes.length === 0 ? (
                <tr><td colSpan={6} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No credit notes found. Click "+ Credit Note" to add one.</td></tr>
              ) : creditNotes.map(c=>(
                <tr key={c.id} style={trStyle}>
                  <td style={tdStyle}>{c.txnDate}</td>
                  <td style={tdStyle}>{c.clientName}</td>
                  <td style={{ ...tdStyle, fontWeight:600, color:'#854d0e' }}>₹{c.amount.toLocaleString('en-IN')}</td>
                  <td style={tdStyle}>{c.linkedTxnId ? `#${c.linkedTxnId}` : '—'}</td>
                  <td style={tdStyle}>{c.narration || '—'}</td>
                  <td style={tdStyle}><BillingProfileBadge code={c.billingProfileCode} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: Ledger ───────────────────────────────────────────────────── */}
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
                  {['Date','Entry Type','Narration','Billing Profile','Debit (Dr)','Credit (Cr)','Balance'].map(h=>(
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledgerLoading ? (
                  <tr><td colSpan={7} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Loading ledger…</td></tr>
                ) : ledger.length === 0 ? (
                  <tr><td colSpan={7} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No ledger entries for this client.</td></tr>
                ) : ledger.map((e,i)=>(
                  <tr key={i} style={{ ...trStyle, ...(e.txnType==='opening_balance' ? { background:'#fffbeb' } : {}) }}>
                    <td style={tdStyle}>{e.txnDate || e.date || '—'}</td>
                    <td style={tdStyle}><TxnTypeBadge type={e.txnType} /></td>
                    <td style={{ ...tdStyle, fontStyle: e.txnType==='opening_balance' ? 'italic' : 'normal' }}>{e.narration || '—'}</td>
                    <td style={tdStyle}><BillingProfileBadge code={e.billingProfileCode} /></td>
                    <td style={{ ...tdStyle, color:'#dc2626', fontWeight: e.debit?600:400 }}>{e.debit ? `₹${parseFloat(e.debit).toLocaleString('en-IN')}` : '—'}</td>
                    <td style={{ ...tdStyle, color:'#16a34a', fontWeight: e.credit?600:400 }}>{e.credit ? `₹${parseFloat(e.credit).toLocaleString('en-IN')}` : '—'}</td>
                    <td style={{ ...tdStyle, fontWeight:700 }}>₹{parseFloat(e.balance || 0).toLocaleString('en-IN')}</td>
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
const modalStyle = { background:'#fff', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.18)', minWidth:480, maxWidth:560, width:'100%', maxHeight:'90vh', overflowY:'auto' };
const modalHeaderStyle = { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 24px', borderBottom:'1px solid #f1f5f9' };
const closeBtnStyle = { background:'none', border:'none', cursor:'pointer', fontSize:16, color:'#64748b', padding:'2px 6px', borderRadius:4 };
const labelStyle = { display:'flex', flexDirection:'column', gap:4, fontSize:12, fontWeight:600, color:'#475569' };
const inputStyle = { padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, color:'#334155', outline:'none' };

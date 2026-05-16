import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getTxns, getTxn, createTxn, createReceipt, createPaymentExpense, createTds, finalizeTds,
  getTdsEntries, createRebate, createCreditNote, getLedger, getBillSettlementReport,
  getOpeningBalance, setOpeningBalance,
  updateTxn, requestInvoiceModifyOtp,
  requestLedgerDeleteOtp, bulkDeleteTxns,
  requestLedgerReversalUserOtp, reverseLedgerTxn,
  postInvoiceCostAnalysisPreview,
  getReceiptsWithUnallocated,
  getLedgerReconciliation,
  normalizeLedgerClassForApi,
} from '../services/txnService';
import { LastUpdatedByCell, TxnAuditLogModal } from '../../../components/finance/TxnAuditActivity';
import { useAuth } from '../../../auth/AuthContext';
import { getContact } from '../../../services/contactService';
import { getOrganization } from '../../../services/organizationService';
import { getCategories } from '../../../services/serviceCategoryService';
import {
  getEngagements,
  getBillingReport,
  getServiceBillingInvoices,
  patchBillingClosure,
} from '../../../services/engagementService';
import { EXPENSE_PURPOSE_OPTIONS, expensePurposeLabel } from '../../../constants/expensePurposes';
import { buildLedgerDetailLine } from '../../../utils/ledgerTxnDetails';
import StatusBadge from '../../../components/common/StatusBadge';
import ClientSearchDropdown from '../../../components/common/ClientSearchDropdown';
import EntitySearchDropdown from '../../../components/common/EntitySearchDropdown';
import LineItemPresetCombobox from '../../../components/common/LineItemPresetCombobox';
import DateInput from '../../../components/common/DateInput';
import BillingProfileSelect from '../../../components/common/BillingProfileSelect';
import { getBillingProfiles, getBillingProfileByCode } from '../../../constants/billingProfiles';
import { listFirmBankAccounts } from '../../../services/firmBankAccountService';
import { stateCodeFromGstin } from '../../../utils/gstUtils';
import {
  collectIndianFYStartYearsWithFallback,
  buildLedgerRowsForIndianFY,
  indianFYLabel,
  indianFYBounds,
} from '../../../utils/indianFinancialYear';
import { ROLES } from '../../../constants/roles';
import ledgerLogoUrl from '../../../assets/cropped_logo.png';
import {
  loadRazorpayScript,
  createRazorpayOrderForTxn,
  openRazorpayCheckout,
} from '../services/razorpayService';
import { LEDGER_USER_REVERSAL_ENABLED, SUPER_ADMIN_EMAIL } from '../../../constants/config';

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
  brought_forward: { bg:'#f8fafc', color:'#334155', border:'#e2e8f0' },
  payment_expense: { bg:'#f0f9ff', color:'#075985', border:'#bae6fd' },
  receipt_reversal: { bg:'#ecfdf5', color:'#047857', border:'#6ee7b7' },
  payment_expense_reversal: { bg:'#fff7ed', color:'#c2410c', border:'#fdba74' },
  tds_reversal: { bg:'#f5f3ff', color:'#6d28d9', border:'#c4b5fd' },
};

function TxnTypeBadge({ type }) {
  const c = TXN_TYPE_COLORS[type] || { bg:'#f1f5f9', color:'#475569', border:'#e2e8f0' };
  const labels = {
    invoice: 'Invoice', receipt: 'Receipt', tds_provisional: 'TDS (Prov.)',
    tds_final: 'TDS (Final)', rebate: 'Rebate', credit_note: 'Credit Note',
    opening_balance: 'Opening Bal.',
    brought_forward: 'B/F',
    payment_expense: 'On-behalf payment',
    receipt_reversal: 'Receipt reversal',
    payment_expense_reversal: 'Payment reversal',
    tds_reversal: 'TDS reversal',
  };
  return (
    <span style={{ background:c.bg, color:c.color, border:`1px solid ${c.border}`, padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700, whiteSpace:'nowrap', display:'inline-block' }}>
      {labels[type] || type}
    </span>
  );
}

/** Ledger reversals store a positive `amount`; UI shows the economic sign. */
const COMPENSATING_REVERSAL_TXN_TYPES = new Set([
  'receipt_reversal',
  'payment_expense_reversal',
  'tds_reversal',
]);

function formatSignedInrAmount(txnType, rawAmount) {
  const n = typeof rawAmount === 'number' ? rawAmount : parseFloat(rawAmount, 10);
  const abs = Number.isFinite(n) ? Math.abs(n) : 0;
  const formatted = abs.toLocaleString('en-IN');
  return COMPENSATING_REVERSAL_TXN_TYPES.has(txnType) ? `-₹${formatted}` : `₹${formatted}`;
}

function signedLedgerTxnAmount(txnType, rawAmount) {
  const n = typeof rawAmount === 'number' ? rawAmount : parseFloat(rawAmount, 10);
  const abs = Number.isFinite(n) ? Math.abs(n) : 0;
  return COMPENSATING_REVERSAL_TXN_TYPES.has(txnType) ? -abs : abs;
}

/** Case-insensitive substring match against arbitrary row fields (client-side table search). */
function txnFieldsIncludeQuery(query, fields) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const hay = fields
    .map((f) => (f === null || f === undefined ? '' : String(f)))
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

/** Tabs under Invoices & Ledger that share the client-side list search bar. */
const TXN_LIST_SEARCH_TABS = new Set(['invoices', 'receipts', 'payments', 'tds', 'rebate', 'credit_note']);

const TDS_SECTIONS = ['194J','194C','194H','194I','194A','194Q','Other'];

const PAYMENT_METHOD_OPTIONS = ['NEFT', 'RTGS', 'UPI', 'Cheque', 'Cash', 'IMPS', 'Payment Gateway'];

function buildEngagementLineOptions(categories) {
  const out = [];
  for (const c of categories || []) {
    for (const sub of c.subcategories || []) {
      for (const et of sub.engagementTypes || []) {
        out.push({
          key: `et-${et.id}`,
          engagementTypeId: et.id,
          description: `${et.name} (${c.name})`,
        });
      }
    }
  }
  return out;
}

// ── RaiseInvoiceModal ─────────────────────────────────────────────────────────

/** Map a UI line row to API `line_items` element (snake_case). */
function buildLineItemApiRow(l) {
  const description = String(l.description || '').trim();
  const amount = typeof l.amount === 'number' ? l.amount : parseFloat(l.amount, 10);
  if (!description || !Number.isFinite(amount) || amount <= 0) return null;
  const row = { description, amount };
  const kind = l.lineKind === 'cost_recovery' ? 'cost_recovery' : 'professional_fee';
  row.line_kind = kind;
  if (l.engagementTypeId) row.engagement_type_id = l.engagementTypeId;
  return row;
}

const emptyInvoiceLine = () => ({
  presetKey: '',
  engagementTypeId: null,
  description: '',
  amount: '',
  lineKind: 'professional_fee',
});

const LEDGER_CLASS_OPTIONS = [
  { value: 'regular', label: 'Regular' },
  { value: 'memorandum', label: 'Memorandum' },
  { value: 'optional', label: 'Optional' },
];

function ledgerClassLabel(value) {
  const v = normalizeLedgerClassForApi(value);
  return LEDGER_CLASS_OPTIONS.find((o) => o.value === v)?.label || v;
}

const LEDGER_MOVEMENT_OPTIONS = [
  { value: 'fees', label: 'Fees (professional)' },
  { value: 'reimbursement', label: 'Reimbursement (tax challans & reimbursements)' },
];

const LEDGER_VIEW_OPTIONS = [
  { value: 'consolidated', label: 'Consolidated' },
  { value: 'fees', label: 'Fees only' },
  { value: 'reimbursement', label: 'Reimbursement only' },
];

function paymentExpenseBookedOnLabel(p) {
  const oid = p.organizationId != null && p.organizationId !== ''
    ? parseInt(String(p.organizationId), 10)
    : 0;
  const cid = p.clientId != null && p.clientId !== ''
    ? parseInt(String(p.clientId), 10)
    : 0;
  if (oid > 0) return `Organization #${oid}`;
  if (cid > 0) return `Contact #${cid}`;
  return '';
}

function paymentExpenseMatchesLedgerSelection(p, ledgerClientId, ledgerEntityType) {
  if (!ledgerClientId) return true;
  const id = String(ledgerClientId);
  if (ledgerEntityType === 'organization') {
    return String(p.organizationId ?? '') === id;
  }
  return String(p.clientId ?? '') === id;
}

function RaiseInvoiceModal({ onClose, onSave, open, prefill = null }) {
  const { session } = useAuth();
  const [costPreview, setCostPreview] = useState(null);
  const [invoiceCostAnalysisConfirm, setInvoiceCostAnalysisConfirm] = useState(false);
  const [form, setForm] = useState({
    entityId: '',
    entityName: '',
    entityType: 'contact',
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    notes: '',
    billingProfileCode: '',
    serviceEngagementId: '',
    ledgerClass: 'regular',
    lines: [emptyInvoiceLine(), emptyInvoiceLine()],
  });
  const [serviceCategories, setServiceCategories] = useState([]);
  const [recipientGstin, setRecipientGstin] = useState('');
  const [engagementOptions, setEngagementOptions] = useState([]);

  useEffect(() => {
    if (!open) return undefined;
    const blank = () => ({
      entityId: '',
      entityName: '',
      entityType: 'contact',
      invoiceDate: new Date().toISOString().slice(0, 10),
      dueDate: '',
      notes: '',
      billingProfileCode: '',
      serviceEngagementId: '',
      ledgerClass: 'regular',
      lines: [emptyInvoiceLine(), emptyInvoiceLine()],
    });
    const next = blank();
    if (prefill && prefill.entityId != null && String(prefill.entityId).trim() !== '') {
      next.entityId = String(prefill.entityId);
      next.entityName = prefill.entityName || '';
      next.entityType = prefill.entityType || 'contact';
      if (prefill.serviceEngagementId != null && String(prefill.serviceEngagementId).trim() !== '') {
        next.serviceEngagementId = String(prefill.serviceEngagementId);
      }
    }
    setForm(next);
    return undefined;
  }, [open, prefill]);

  useEffect(() => {
    if (!open) return undefined;
    getCategories().then(setServiceCategories).catch(() => setServiceCategories([]));
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open || !form.entityId) {
      setRecipientGstin('');
      return undefined;
    }
    let cancelled = false;
    const idNum = parseInt(form.entityId, 10);
    (async () => {
      try {
        if (form.entityType === 'organization') {
          const o = await getOrganization(idNum);
          if (!cancelled) setRecipientGstin((o?.gstin || '').replace(/\s/g, '').toUpperCase());
        } else {
          const c = await getContact(idNum);
          if (!cancelled) setRecipientGstin((c?.gstin || '').replace(/\s/g, '').toUpperCase());
        }
      } catch {
        if (!cancelled) setRecipientGstin('');
      }
    })();
    return () => { cancelled = true; };
  }, [open, form.entityId, form.entityType]);

  useEffect(() => {
    if (!costPreview?.violations?.length) {
      setInvoiceCostAnalysisConfirm(false);
    }
  }, [costPreview]);

  useEffect(() => {
    if (!open) {
      setCostPreview(null);
      return undefined;
    }
    const sid = parseInt(form.serviceEngagementId, 10);
    const lineItems = form.lines.map(buildLineItemApiRow).filter(Boolean);
    if (!Number.isFinite(sid) || sid <= 0 || lineItems.length === 0) {
      setCostPreview(null);
      return undefined;
    }
    const handle = setTimeout(() => {
      postInvoiceCostAnalysisPreview({
        service_id: sid,
        line_items: lineItems,
      })
        .then(setCostPreview)
        .catch(() => setCostPreview(null));
    }, 450);
    return () => clearTimeout(handle);
  }, [open, form.serviceEngagementId, form.lines]);

  useEffect(() => {
    if (!open || !form.entityId) {
      setEngagementOptions([]);
      return undefined;
    }
    let cancelled = false;
    const idNum = parseInt(form.entityId, 10);
    const q = form.entityType === 'organization'
      ? { organizationId: idNum, perPage: 200, status: 'all' }
      : { clientId: idNum, perPage: 200, status: 'all' };
    getEngagements(q)
      .then((rows) => { if (!cancelled) setEngagementOptions(rows); })
      .catch(() => { if (!cancelled) setEngagementOptions([]); });
    return () => { cancelled = true; };
  }, [open, form.entityId, form.entityType]);

  const lineOptions = useMemo(() => buildEngagementLineOptions(serviceCategories), [serviceCategories]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setLine = (idx, field, value) => {
    setForm(f => ({
      ...f,
      lines: f.lines.map((row, i) => (i === idx ? { ...row, [field]: value } : row)),
    }));
  };

  const applyPreset = (idx, key) => {
    if (!key) {
      setLine(idx, 'presetKey', '');
      setLine(idx, 'engagementTypeId', null);
      return;
    }
    const opt = lineOptions.find((o) => o.key === key);
    if (!opt) return;
    setForm((f) => ({
      ...f,
      lines: f.lines.map((row, i) => (i === idx ? {
        ...row,
        presetKey: key,
        engagementTypeId: opt.engagementTypeId,
        description: opt.description,
      } : row)),
    }));
  };

  const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, emptyInvoiceLine()] }));
  const removeLine = (idx) => {
    setForm(f => ({
      ...f,
      lines: f.lines.length <= 1 ? f.lines : f.lines.filter((_, i) => i !== idx),
    }));
  };
  const lineTotal = useMemo(() => {
    return form.lines.reduce((sum, row) => {
      const n = parseFloat(row.amount, 10);
      return sum + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
  }, [form.lines]);

  const selectedProfile = getBillingProfileByCode(form.billingProfileCode);
  const roleName = String(session?.user?.role || '');
  const userEmail = String(session?.user?.email || '').toLowerCase();
  const canAckLowFees = roleName === ROLES.ACCOUNTS || roleName === ROLES.SUPER_ADMIN || userEmail === 'rahul@cagupta.in';

  const gstPreview = useMemo(() => {
    if (!selectedProfile?.gstRegistered) return null;
    const subtotal = lineTotal;
    const rate = selectedProfile.defaultGstRate ?? 18;
    const tax = Math.round(subtotal * rate / 100 * 100) / 100;
    const supplier = selectedProfile.stateCode || stateCodeFromGstin(selectedProfile.gstin);
    const recipient = stateCodeFromGstin(recipientGstin);
    let split = '—';
    if (supplier && recipient) {
      split = supplier === recipient
        ? 'Intra-state: CGST + SGST (or CGST + UTGST for UT)'
        : 'Inter-state: IGST';
    }
    return { subtotal, rate, tax, total: Math.round((subtotal + tax) * 100) / 100, supplier, recipient, split };
  }, [selectedProfile, lineTotal, recipientGstin]);

  const handleSave = () => {
    if (!form.entityId || !form.invoiceDate) return;
    const viol = costPreview?.violations || [];
    if (viol.length > 0 && !canAckLowFees) {
      window.alert('Taxable fees are below Standard Fees or calculated hours-based value (team planned ₹/hr × time). An Accounts user or Super Admin must raise this invoice or confirm.');
      return;
    }
    if (viol.length > 0 && canAckLowFees && !invoiceCostAnalysisConfirm) {
      window.alert('Tick the Accounts confirmation box to proceed with amounts below the benchmarks.');
      return;
    }
    const profile = getBillingProfileByCode(form.billingProfileCode);
    if (profile?.gstRegistered) {
      const sup = profile.stateCode || stateCodeFromGstin(profile.gstin);
      if (!sup || sup.length !== 2) {
        window.alert('This billing profile is GST registered but has no valid state code. Complete Billing Firms in Settings.');
        return;
      }
      const rCode = stateCodeFromGstin(recipientGstin);
      if (!rCode) {
        window.alert('Cannot raise a GST invoice: the contact or organization must have a GSTIN so the place of supply (state) can be determined.');
        return;
      }
    }
    const parsed = form.lines.map(buildLineItemApiRow).filter(Boolean);
    if (parsed.length === 0) return;
    onSave({
      ...form,
      lineItems: parsed,
      totalAmount: parsed.reduce((a, l) => a + l.amount, 0),
      invoiceCostAnalysisConfirm,
    });
    onClose();
  };
  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 700 }}>
        <div style={modalHeaderStyle}>
          <span style={{ fontSize:15, fontWeight:700 }}>🧾 Raise Invoice</span>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
          <label style={labelStyle}>
            Bill to (contact or organization)
            <EntitySearchDropdown
              value={form.entityId}
              displayValue={form.entityName}
              entityType={form.entityType}
              onChange={c => setForm(f => ({
                ...f,
                entityId: String(c.id),
                entityName: c.displayName,
                entityType: c.entityType,
                serviceEngagementId: '',
              }))}
              placeholder="Search contact or organization…"
              style={inputStyle}
            />
          </label>
          {recipientGstin ? (
            <div style={{ fontSize:12, color:'#475569' }}>Recipient GSTIN (place of supply): <span style={{ fontFamily:'monospace', fontWeight:600 }}>{recipientGstin}</span></div>
          ) : form.entityId ? (
            <div style={{ fontSize:12, color:'#b45309' }}>No GSTIN on this entity — required when using a GST-registered billing profile.</div>
          ) : null}
          {form.entityId ? (
            <label style={labelStyle}>
              Link to service engagement (optional — for affiliate commissions)
              <select
                style={inputStyle}
                value={form.serviceEngagementId}
                onChange={(e) => set('serviceEngagementId', e.target.value)}
              >
                <option value="">— None —</option>
                {engagementOptions.map((eng) => (
                  <option key={eng.id} value={String(eng.id)}>
                    #{eng.id} · {eng.type || 'Service'}{eng.referringAffiliateUserId ? ' · affiliate' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label style={labelStyle}>
            Ledger type
            <select style={inputStyle} value={form.ledgerClass} onChange={(e) => set('ledgerClass', e.target.value)}>
              {LEDGER_CLASS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <label style={labelStyle}>
              Invoice Date
              <DateInput style={inputStyle} value={form.invoiceDate} onChange={e=>set('invoiceDate',e.target.value)} />
            </label>
            <label style={labelStyle}>
              Due Date
              <DateInput style={inputStyle} value={form.dueDate} onChange={e=>set('dueDate',e.target.value)} />
            </label>
          </div>
          <div style={labelStyle}>
            <span>Line items (taxable fees — amounts are before GST)</span>
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:4 }}>
              {form.lines.map((row, idx) => (
                <div key={idx} style={{ display:'flex', flexDirection:'column', gap:6, paddingBottom:8, borderBottom:'1px solid #f1f5f9' }}>
                  <LineItemPresetCombobox
                    value={row.presetKey}
                    options={lineOptions}
                    onChange={(key) => applyPreset(idx, key)}
                    placeholder="Custom — type to search services…"
                    style={{ ...inputStyle, fontSize: 12 }}
                  />
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 36px', gap:8, alignItems:'center' }}>
                    <input
                      type="text"
                      style={inputStyle}
                      placeholder="e.g. Professional consultancy"
                      value={row.description}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        lines: f.lines.map((line, i) => (i === idx ? {
                          ...line,
                          description: e.target.value,
                          presetKey: '',
                          engagementTypeId: null,
                        } : line)),
                      }))}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      style={{ ...inputStyle, textAlign:'right' }}
                      placeholder="₹"
                      value={row.amount}
                      onChange={e => setLine(idx, 'amount', e.target.value)}
                    />
                    <button type="button" onClick={() => removeLine(idx)} style={{ ...btnSecondary, padding:'6px', fontSize:12 }} title="Remove line">✕</button>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:10, alignItems:'center', fontSize:12 }}>
                    <label style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ color:'#64748b' }}>Line type</span>
                      <select
                        style={{ ...inputStyle, fontSize:12, width:160 }}
                        value={row.lineKind}
                        onChange={(e) => setLine(idx, 'lineKind', e.target.value)}
                      >
                        <option value="professional_fee">Professional Fee</option>
                        <option value="cost_recovery">Tax Challans n Reimbursements</option>
                      </select>
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={addLine} style={{ ...btnSecondary, marginTop:6, alignSelf:'flex-start', fontSize:12, padding:'6px 12px' }}>
              + Add line
            </button>
            <div style={{ marginTop:8, fontSize:13, fontWeight:700, color:'#0f172a' }}>
              Taxable subtotal (₹): {lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {costPreview?.analysis && form.serviceEngagementId && (
              <div style={{ marginTop:12, padding:12, background:'#f8fafc', borderRadius:8, border:'1px solid #e2e8f0', fontSize:12, color:'#334155', lineHeight:1.55 }}>
                <div style={{ fontWeight:700, marginBottom:6, color:'#0f172a' }}>Cost benchmarks (linked service)</div>
                <div>
                  Standard fees (master):{' '}
                  {costPreview.analysis.standard_fees != null
                    ? `₹${Number(costPreview.analysis.standard_fees).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '— not set'}
                </div>
                <div>Billed hours fees (planned ₹/hr × billable time): ₹{Number(costPreview.analysis.billed_hours_fees || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div>Unbilled hours fees (planned ₹/hr × unbillable time): ₹{Number(costPreview.analysis.unbilled_hours_fees || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div style={{ marginTop:6, fontWeight:600 }}>Suggested taxable prefill (max of above): ₹{(costPreview.analysis.threshold != null ? Number(costPreview.analysis.threshold) : lineTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div style={{ marginTop:4, fontSize:11, color:'#64748b' }}>Matching professional lines subtotal: ₹{Number(costPreview.analysis.matching_professional_subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (same engagement type as service)</div>
              </div>
            )}
            {(costPreview?.violations || []).length > 0 && (
              <div style={{ marginTop:10, padding:10, background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, fontSize:12, color:'#92400e' }}>
                <strong>Below benchmark:</strong>
                <ul style={{ margin:'6px 0 0 18px', padding:0 }}>
                  {(costPreview.violations || []).map((v) => (
                    <li key={v.code}>{v.message}</li>
                  ))}
                </ul>
                {!canAckLowFees ? (
                  <p style={{ margin:'8px 0 0 0' }}>Only Accounts or Super Admin can confirm and submit.</p>
                ) : (
                  <label style={{ display:'flex', alignItems:'flex-start', gap:8, marginTop:10, cursor:'pointer', fontWeight:600 }}>
                    <input
                      type="checkbox"
                      checked={invoiceCostAnalysisConfirm}
                      onChange={(e) => setInvoiceCostAnalysisConfirm(e.target.checked)}
                    />
                    <span>Accounts confirms billing below Standard Fees and/or calculated hours-based fees.</span>
                  </label>
                )}
              </div>
            )}
            {gstPreview && (
              <div style={{ marginTop:8, padding:10, background:'#f8fafc', borderRadius:8, fontSize:12, color:'#334155', lineHeight:1.5 }}>
                <div style={{ fontWeight:700, marginBottom:4 }}>GST @ {gstPreview.rate}% (preview)</div>
                <div>GST amount: ₹{gstPreview.tax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div>Invoice total: ₹{gstPreview.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div style={{ marginTop:4, color:'#64748b' }}>{gstPreview.split}</div>
              </div>
            )}
          </div>
          <label style={labelStyle}>
            Billing Profile
            <BillingProfileSelect
              style={inputStyle}
              value={form.billingProfileCode}
              onChange={(code) => set('billingProfileCode', code)}
              showGstSuffix
            />
          </label>
          <label style={labelStyle}>
            Notes
            <input type="text" style={inputStyle} placeholder="Optional notes" value={form.notes} onChange={e=>set('notes',e.target.value)} />
          </label>
        </div>
        <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
          <button type="button" onClick={handleSave} style={btnPrimary}>Save Invoice</button>
        </div>
      </div>
    </div>
  );
}

// ── InvoiceViewModal ───────────────────────────────────────────────────────────

function formatBillToAddressFromContact(c) {
  if (!c) return [];
  const lines = [];
  const a1 = [c.addressLine1, c.addressLine2].filter(Boolean).join(', ');
  if (a1) lines.push(a1);
  const cityLine = [c.city, c.state].filter(Boolean).join(', ');
  if (cityLine) lines.push(cityLine);
  if (c.pincode) {
    lines.push(c.country && c.country !== 'India' ? `${c.pincode} · ${c.country}` : String(c.pincode));
  } else if (c.country && c.country !== 'India') {
    lines.push(c.country);
  }
  return lines;
}

function formatBillToAddressFromOrg(o) {
  if (!o) return [];
  const lines = [];
  if (o.address) lines.push(o.address);
  const cityLine = [o.city, o.state].filter(Boolean).join(', ');
  if (cityLine) lines.push(cityLine);
  const tail = [o.pincode, o.country && o.country !== 'India' ? o.country : ''].filter(Boolean);
  if (tail.length) lines.push(tail.join(' · '));
  else if (o.pincode) lines.push(o.pincode);
  return lines;
}

function InvoiceViewModal({ txn, onClose, onEdit, onDelete, canEditInvoice, canDeleteInvoice }) {
  const [detail, setDetail] = useState(null);
  const [entity, setEntity] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!txn?.id) return undefined;
    let cancelled = false;
    setLoading(true);
    setLoadErr('');
    setDetail(null);
    setEntity(null);
    (async () => {
      try {
        const row = await getTxn(txn.id);
        if (cancelled) return;
        setDetail(row);
        if (row.clientId) {
          const contact = await getContact(row.clientId).catch(() => null);
          if (!cancelled) setEntity(contact ? { type: 'contact', data: contact } : null);
        } else if (row.organizationId) {
          const org = await getOrganization(row.organizationId).catch(() => null);
          if (!cancelled) setEntity(org ? { type: 'organization', data: org } : null);
        }
      } catch (e) {
        if (!cancelled) setLoadErr(e.message || 'Failed to load invoice.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [txn?.id]);

  if (!txn) return null;

  const inv = detail || txn;
  const profile = getBillingProfileByCode(inv.billingProfileCode);
  const displayName = entity?.type === 'contact'
    ? entity.data.displayName
    : entity?.type === 'organization'
      ? entity.data.displayName
      : inv.clientName;
  const addrLines = entity?.type === 'contact'
    ? formatBillToAddressFromContact(entity.data)
    : entity?.type === 'organization'
      ? formatBillToAddressFromOrg(entity.data)
      : [];
  const gstin = entity?.type === 'contact' ? entity.data.gstin : entity?.type === 'organization' ? entity.data.gstin : '';
  const lines = inv.lineItems && inv.lineItems.length > 0 ? inv.lineItems : [];
  const gst = inv.gstBreakdown;

  return (
    <div style={overlayStyle} className="invoice-view-overlay">
      <div style={{ ...modalStyle, maxWidth: 560 }} className="invoice-view-modal-print-root">
        <div style={modalHeaderStyle} className="no-print">
          <span style={{ fontSize:15, fontWeight:700 }}>🧾 Invoice</span>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
          {loading && <div style={{ color:'#64748b', fontSize:13 }}>Loading…</div>}
          {loadErr && <div style={{ color:'#dc2626', fontSize:13 }}>{loadErr}</div>}
          {!loading && !loadErr && (
            <>
              {inv.billingProfileCode && (
                <div style={{ fontSize:12, color:'#475569' }}>
                  <div style={{ fontWeight:700, color:'#0f172a' }}>{profile?.name || inv.billingProfileCode}</div>
                  <div style={{ fontFamily:'monospace' }}>{inv.billingProfileCode}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.04em' }}>Bill to</div>
                <div style={{ fontWeight:700, fontSize:15, color:'#0f172a', marginTop:4 }}>{displayName || '—'}</div>
                {addrLines.length > 0 && (
                  <div style={{ marginTop:6, fontSize:13, color:'#334155', lineHeight:1.45 }}>
                    {addrLines.map((line, i) => <div key={i}>{line}</div>)}
                  </div>
                )}
                {gstin ? <div style={{ marginTop:6, fontSize:12, color:'#475569' }}>GSTIN: {gstin}</div> : null}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, fontSize:13 }}>
                <div><span style={{ color:'#64748b' }}>Invoice #</span><br /><strong style={{ fontFamily:'monospace' }}>{inv.invoiceNumber || `INV-${inv.id}`}</strong></div>
                <div><span style={{ color:'#64748b' }}>Status</span><br /><StatusBadge status={inv.invoiceStatus || inv.status} /></div>
                <div><span style={{ color:'#64748b' }}>Invoice date</span><br /><strong>{inv.txnDate || '—'}</strong></div>
                <div><span style={{ color:'#64748b' }}>Due date</span><br /><strong>{inv.dueDate || '—'}</strong></div>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:8 }}>Amount</div>
                {lines.length > 0 ? (
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ borderBottom:'1px solid #e2e8f0' }}>
                        <th style={{ textAlign:'left', padding:'8px 0', color:'#64748b' }}>Description</th>
                        <th style={{ textAlign:'right', padding:'8px 0', color:'#64748b' }}>Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((row, i) => (
                        <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                          <td style={{ padding:'8px 0', verticalAlign:'top' }}>
                            <div>{row.description}</div>
                            {row.lineKind === 'cost_recovery' ? (
                              <div style={{ fontSize:10, fontWeight:700, color:'#b45309', marginTop:4 }}>Tax Challans n Reimbursements</div>
                            ) : null}
                          </td>
                          <td style={{ padding:'8px 0', textAlign:'right', fontWeight:600 }}>{Number(row.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      {gst ? (
                        <>
                          <tr>
                            <td style={{ paddingTop:12, color:'#64748b' }}>Taxable value</td>
                            <td style={{ paddingTop:12, textAlign:'right' }}>₹{(gst.taxable_value ?? inv.subtotal ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                          {(gst.cgst_amount > 0) && (
                            <tr><td style={{ color:'#64748b' }}>CGST</td><td style={{ textAlign:'right' }}>₹{Number(gst.cgst_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
                          )}
                          {(gst.sgst_amount > 0) && (
                            <tr><td style={{ color:'#64748b' }}>SGST</td><td style={{ textAlign:'right' }}>₹{Number(gst.sgst_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
                          )}
                          {(gst.utgst_amount > 0) && (
                            <tr><td style={{ color:'#64748b' }}>UTGST</td><td style={{ textAlign:'right' }}>₹{Number(gst.utgst_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
                          )}
                          {(gst.igst_amount > 0) && (
                            <tr><td style={{ color:'#64748b' }}>IGST</td><td style={{ textAlign:'right' }}>₹{Number(gst.igst_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
                          )}
                          <tr>
                            <td style={{ paddingTop:8, fontWeight:700 }}>Invoice total</td>
                            <td style={{ paddingTop:8, textAlign:'right', fontWeight:700 }}>₹{(inv.amount || inv.debit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                        </>
                      ) : (
                        <tr>
                          <td style={{ paddingTop:12, fontWeight:700 }}>Total</td>
                          <td style={{ paddingTop:12, textAlign:'right', fontWeight:700 }}>₹{(inv.amount || inv.debit || 0).toLocaleString('en-IN')}</td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                ) : (
                  <div style={{ fontSize:14, fontWeight:600 }}>₹{(inv.amount || inv.debit || 0).toLocaleString('en-IN')}</div>
                )}
                {gst && (
                  <div style={{ marginTop:10, fontSize:11, color:'#64748b', lineHeight:1.5 }}>
                    Place of supply: {gst.place_of_supply_code || gst.recipient_state_code || '—'} · Supplier state: {gst.supplier_state_code || '—'}
                    {gst.scheme ? ` · ${gst.scheme}` : ''}
                  </div>
                )}
                {lines.length === 0 && (
                  <div style={{ fontSize:12, color:'#94a3b8', marginTop:6 }}>No line breakdown on file (older invoice).</div>
                )}
              </div>
              {inv.notes ? (
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#64748b' }}>Notes</div>
                  <div style={{ fontSize:13, color:'#334155', marginTop:4 }}>{inv.notes}</div>
                </div>
              ) : null}
            </>
          )}
        </div>
        <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10, flexWrap:'wrap' }} className="no-print">
          {canEditInvoice && onEdit && (
            <button type="button" onClick={() => onEdit(txn)} style={btnSecondary}>Edit</button>
          )}
          {canDeleteInvoice && onDelete && (
            <button type="button" onClick={() => onDelete(txn)} style={{ ...btnSecondary, color:'#b91c1c', borderColor:'#fecaca' }}>Delete</button>
          )}
          <button type="button" onClick={() => window.print()} style={btnSecondary}>Print</button>
          <button type="button" onClick={onClose} style={btnPrimary}>Close</button>
        </div>
      </div>
    </div>
  );
}

const INVOICE_EDIT_STATUS_OPTIONS = ['draft', 'sent', 'partially_paid', 'paid', 'overdue'];

function EditInvoiceModal({ invoiceId, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    txnDate: '',
    dueDate: '',
    invoiceStatus: 'draft',
    notes: '',
    billingProfileCode: '',
    narration: '',
    lines: [emptyInvoiceLine(), emptyInvoiceLine()],
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setLine = (idx, field, value) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((row, i) => (i === idx ? { ...row, [field]: value } : row)),
    }));
  };
  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, emptyInvoiceLine()] }));
  const removeLine = (idx) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.length <= 1 ? f.lines : f.lines.filter((_, i) => i !== idx),
    }));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    setOtpSent(false);
    setOtp('');
    getTxn(invoiceId)
      .then((row) => {
        if (cancelled) return;
        const lines = row.lineItems && row.lineItems.length > 0
          ? row.lineItems.map((l) => ({
            description: l.description,
            amount: String(l.amount),
            lineKind: (l.lineKind === 'cost_recovery' || l.line_kind === 'cost_recovery') ? 'cost_recovery' : 'professional_fee',
          }))
          : [emptyInvoiceLine()];
        setForm({
          txnDate: row.txnDate || '',
          dueDate: row.dueDate || '',
          invoiceStatus: row.invoiceStatus || row.status || 'draft',
          notes: row.notes || '',
          billingProfileCode: row.billingProfileCode || '',
          narration: row.narration || '',
          lines,
        });
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message || 'Failed to load invoice.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [invoiceId]);

  async function handleRequestOtp() {
    setErr('');
    setRequesting(true);
    try {
      await requestInvoiceModifyOtp(invoiceId, { intent: 'update' });
      setOtpSent(true);
    } catch (e) {
      setErr(e.message || 'Could not send OTP.');
    } finally {
      setRequesting(false);
    }
  }

  async function handleSave() {
    const parsed = form.lines.map(buildLineItemApiRow).filter(Boolean);
    if (!form.txnDate || parsed.length === 0) {
      setErr('Invoice date and at least one line item are required.');
      return;
    }
    if (!otp.trim()) {
      setErr('Request a superadmin code, then enter the OTP here.');
      return;
    }
    const subtotal = parsed.reduce((a, l) => a + l.amount, 0);
    setSaving(true);
    setErr('');
    try {
      const payload = {
        txn_date: form.txnDate,
        due_date: form.dueDate || null,
        invoice_status: form.invoiceStatus,
        notes: form.notes || null,
        billing_profile_code: form.billingProfileCode || null,
        narration: form.narration || null,
        line_items: parsed,
        subtotal,
        amount: subtotal,
        debit: subtotal,
      };
      const updated = await updateTxn(invoiceId, payload, { superadminOtp: otp.trim() });
      onSaved(updated);
      onClose();
    } catch (e) {
      setErr(e.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 640 }}>
        <div style={modalHeaderStyle}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>✏️ Edit invoice</span>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {loading && <div style={{ color: '#64748b', fontSize: 13 }}>Loading…</div>}
          {err && <div style={{ color: '#dc2626', fontSize: 13 }}>{err}</div>}
          {!loading && (
            <>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                Superadmin receives a one-time code by email. Request the code, then enter it below before saving.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <label style={labelStyle}>
                  Invoice date *
                  <DateInput style={inputStyle} value={form.txnDate} onChange={(e) => set('txnDate', e.target.value)} />
                </label>
                <label style={labelStyle}>
                  Due date
                  <DateInput style={inputStyle} value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
                </label>
              </div>
              <label style={labelStyle}>
                Status
                <select style={inputStyle} value={form.invoiceStatus} onChange={(e) => set('invoiceStatus', e.target.value)}>
                  {INVOICE_EDIT_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Billing profile
                <BillingProfileSelect
                  style={inputStyle}
                  value={form.billingProfileCode}
                  onChange={(code) => set('billingProfileCode', code)}
                  placeholder="— Select —"
                />
              </label>
              <label style={labelStyle}>
                Narration
                <input type="text" style={inputStyle} value={form.narration} onChange={(e) => set('narration', e.target.value)} />
              </label>
              <label style={labelStyle}>
                Notes
                <input type="text" style={inputStyle} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </label>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Line items *</div>
              {form.lines.map((line, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 36px', gap: 8, alignItems: 'end' }}>
                    <label style={labelStyle}>
                      Description
                      <input type="text" style={inputStyle} value={line.description} onChange={(e) => setLine(idx, 'description', e.target.value)} />
                    </label>
                    <label style={labelStyle}>
                      Amount (₹)
                      <input type="number" style={inputStyle} min="0" step="0.01" value={line.amount} onChange={(e) => setLine(idx, 'amount', e.target.value)} />
                    </label>
                    <button type="button" style={{ ...btnSecondary, height: 36 }} onClick={() => removeLine(idx)}>✕</button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', fontSize: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      Line type
                      <select style={{ ...inputStyle, fontSize: 12, width: 160 }} value={line.lineKind} onChange={(e) => setLine(idx, 'lineKind', e.target.value)}>
                        <option value="professional_fee">Professional Fee</option>
                        <option value="cost_recovery">Tax Challans n Reimbursements</option>
                      </select>
                    </label>
                  </div>
                </div>
              ))}
              <button type="button" style={{ ...btnSecondary, alignSelf: 'flex-start' }} onClick={addLine}>+ Line</button>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <button type="button" style={btnSecondary} disabled={requesting} onClick={handleRequestOtp}>
                  {requesting ? 'Sending…' : 'Request superadmin OTP'}
                </button>
                {otpSent && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>Code sent to superadmin email</span>}
              </div>
              <label style={labelStyle}>
                Superadmin OTP *
                <input type="text" style={inputStyle} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\s/g, ''))} />
              </label>
            </>
          )}
        </div>
        <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
          <button type="button" style={btnPrimary} disabled={loading || saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}

function EditLedgerTxnModal({ txnId, onClose, onSaved }) {
  const { session } = useAuth();
  const userEmail = session?.user?.email;
  const isPrimarySuperAdmin = Boolean(
    userEmail && String(userEmail).toLowerCase() === String(SUPER_ADMIN_EMAIL).toLowerCase(),
  );
  const ledgerUserRevFromServer = session?.user?.ledger_user_reversal_enabled ?? LEDGER_USER_REVERSAL_ENABLED;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [row, setRow] = useState(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [revReason, setRevReason] = useState('');
  const [revUserOtp, setRevUserOtp] = useState('');
  const [revSuperOtp, setRevSuperOtp] = useState('');
  const [revUserOtpSent, setRevUserOtpSent] = useState(false);
  const [revRequesting, setRevRequesting] = useState(false);
  const [revReversing, setRevReversing] = useState(false);

  const [recTxnDate, setRecTxnDate] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recMethod, setRecMethod] = useState('NEFT');
  const [recRef, setRecRef] = useState('');
  const [recNotes, setRecNotes] = useState('');
  const [recNarr, setRecNarr] = useState('');
  const [recBankId, setRecBankId] = useState('');
  const [allocLines, setAllocLines] = useState([]);

  const [payTxnDate, setPayTxnDate] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('NEFT');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payNarr, setPayNarr] = useState('');
  const [payPurpose, setPayPurpose] = useState('misc');
  const [payBankId, setPayBankId] = useState('');
  const [settleLines, setSettleLines] = useState([]);

  const [tdsTxnDate, setTdsTxnDate] = useState('');
  const [tdsAmount, setTdsAmount] = useState('');
  const [tdsNotes, setTdsNotes] = useState('');
  const [tdsNarr, setTdsNarr] = useState('');
  const [tdsSection, setTdsSection] = useState('');
  const [tdsRate, setTdsRate] = useState('');

  const [banks, setBanks] = useState([]);
  const [banksLoading, setBanksLoading] = useState(false);

  function patchAllocLine(idx, patch) {
    setAllocLines((lines) => lines.map((line, i) => (i === idx ? { ...line, ...patch } : line)));
  }
  function addAllocLineRow() {
    setAllocLines((lines) => [...lines, { targetType: 'invoice', targetTxnId: '', amount: '' }]);
  }
  function removeAllocLineRow(idx) {
    setAllocLines((lines) => (lines.length <= 1 ? lines : lines.filter((_, i) => i !== idx)));
  }

  function patchSettleLine(idx, patch) {
    setSettleLines((lines) => lines.map((line, i) => (i === idx ? { ...line, ...patch } : line)));
  }
  function addSettleLineRow() {
    setSettleLines((lines) => [...lines, { targetType: 'receipt', targetTxnId: '', amount: '' }]);
  }
  function removeSettleLineRow(idx) {
    setSettleLines((lines) => (lines.length <= 1 ? lines : lines.filter((_, i) => i !== idx)));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    setOtpSent(false);
    setOtp('');
    setRevReason('');
    setRevUserOtp('');
    setRevSuperOtp('');
    setRevUserOtpSent(false);
    setRow(null);
    getTxn(txnId)
      .then((r) => {
        if (cancelled) return;
        setRow(r);
        const tt = r.txnType;
        if (tt === 'receipt' || tt === 'receipt_reversal') {
          setRecTxnDate(r.txnDate || '');
          setRecAmount(String(r.amount ?? ''));
          setRecMethod(r.paymentMethod || 'NEFT');
          setRecRef(r.referenceNumber || '');
          setRecNotes(r.notes || '');
          setRecNarr(r.narration || '');
          setRecBankId(r.firmBankAccountId != null ? String(r.firmBankAccountId) : '');
          const al = (r.allocations && r.allocations.length > 0)
            ? r.allocations.map((x) => ({
              targetType: x.targetType || 'invoice',
              targetTxnId: x.targetTxnId || '',
              amount: String(x.amount ?? ''),
            }))
            : [{ targetType: 'unallocated_advance', targetTxnId: '', amount: String(r.amount ?? '') }];
          setAllocLines(al);
        } else if (tt === 'payment_expense' || tt === 'payment_expense_reversal') {
          setPayTxnDate(r.txnDate || '');
          setPayAmount(String(r.amount ?? ''));
          setPayMethod(r.paymentMethod || 'NEFT');
          setPayRef(r.referenceNumber || '');
          setPayNotes(r.notes || '');
          setPayNarr(r.narration || '');
          setPayPurpose(r.expensePurpose || 'misc');
          setPayBankId(r.firmBankAccountId != null ? String(r.firmBankAccountId) : '');
          const sl = (r.settlementLines && r.settlementLines.length > 0)
            ? r.settlementLines.map((x) => ({
              targetType: x.targetType || 'receipt',
              targetTxnId: x.targetTxnId || '',
              amount: String(x.amount ?? ''),
            }))
            : [{ targetType: 'unallocated_advance', targetTxnId: '', amount: String(r.amount ?? '') }];
          setSettleLines(sl);
        } else if (tt === 'tds_provisional' || tt === 'tds_final' || tt === 'tds_reversal') {
          setTdsTxnDate(r.txnDate || '');
          setTdsAmount(String(r.amount ?? ''));
          setTdsNotes(r.notes || '');
          setTdsNarr(r.narration || '');
          setTdsSection(r.tdsSection || '');
          setTdsRate(String(r.tdsRate ?? ''));
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message || 'Failed to load transaction.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [txnId]);

  useEffect(() => {
    if (!row
      || (row.txnType !== 'receipt'
        && row.txnType !== 'receipt_reversal'
        && row.txnType !== 'payment_expense'
        && row.txnType !== 'payment_expense_reversal')) return undefined;
    const code = row.billingProfileCode;
    if (!code) {
      setBanks([]);
      return undefined;
    }
    let cancelled = false;
    setBanksLoading(true);
    listFirmBankAccounts(code)
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows.filter((b) => b.isActive !== false) : [];
        setBanks(list);
      })
      .finally(() => {
        if (!cancelled) setBanksLoading(false);
      });
    return () => { cancelled = true; };
  }, [row]);

  const withinUserRevWindow = row && row.createdAt
    && Number.isFinite(new Date(row.createdAt).getTime())
    && new Date(row.createdAt).getTime() >= Date.now() - 30 * 86400000;
  const userRevEligible = ledgerUserRevFromServer && withinUserRevWindow && row?.status === 'active';
  const reversalBlockedForStaff =
    ledgerUserRevFromServer && row?.status === 'active' && !withinUserRevWindow && !isPrimarySuperAdmin;
  const needsReversalSuperOtpOnly =
    !ledgerUserRevFromServer && !isPrimarySuperAdmin && row?.status === 'active';
  const isCompensatingReversalRow = row
    && ['receipt_reversal', 'payment_expense_reversal', 'tds_reversal'].includes(row.txnType);

  async function handleRequestReversalUserOtp() {
    setErr('');
    setRevRequesting(true);
    try {
      await requestLedgerReversalUserOtp(txnId);
      setRevUserOtpSent(true);
    } catch (e) {
      setErr(e.message || 'Could not send reversal OTP.');
    } finally {
      setRevRequesting(false);
    }
  }

  async function handleReverseLedger() {
    setErr('');
    const reason = revReason.trim();
    if (reason.length < 10) {
      setErr('Reversal reason must be at least 10 characters.');
      return;
    }
    if (reversalBlockedForStaff) {
      setErr('The 30-day window has elapsed. You cannot reverse this transaction. Please contact super admin.');
      return;
    }
    if (isPrimarySuperAdmin) {
      setRevReversing(true);
      try {
        await reverseLedgerTxn(txnId, { reason });
        onSaved?.({});
        onClose();
      } catch (e) {
        setErr(e.message || 'Reversal failed.');
      } finally {
        setRevReversing(false);
      }
      return;
    }
    if (userRevEligible) {
      const uo = revUserOtp.trim();
      if (!uo) {
        setErr('Enter the verification code sent to your email.');
        return;
      }
      setRevReversing(true);
      try {
        await reverseLedgerTxn(txnId, { reason, otp: uo });
        onSaved?.({});
        onClose();
      } catch (e) {
        setErr(e.message || 'Reversal failed.');
      } finally {
        setRevReversing(false);
      }
      return;
    }
    if (needsReversalSuperOtpOnly) {
      const so = revSuperOtp.trim();
      if (!so) {
        setErr('Enter the superadmin OTP to authorize reversal. Request a code using the button above if needed.');
        return;
      }
      setRevReversing(true);
      try {
        await reverseLedgerTxn(txnId, { reason, superadminOtp: so });
        onSaved?.({});
        onClose();
      } catch (e) {
        setErr(e.message || 'Reversal failed.');
      } finally {
        setRevReversing(false);
      }
      return;
    }
    setErr('Reversal is not available for this posting.');
  }

  async function handleRequestOtp() {
    setErr('');
    setRequesting(true);
    try {
      await requestInvoiceModifyOtp(txnId, { intent: 'update' });
      setOtpSent(true);
    } catch (e) {
      setErr(e.message || 'Could not send OTP.');
    } finally {
      setRequesting(false);
    }
  }

  async function handleSave() {
    setErr('');
    if (!otp.trim()) {
      setErr('Request OTP and enter the code.');
      return;
    }
    if (!row) return;
    setSaving(true);
    try {
      let payload;
      const tt = row.txnType;
      if (tt === 'receipt' || tt === 'receipt_reversal') {
        const amount = parseFloat(recAmount);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid receipt amount.');
        const bankId = parseInt(recBankId, 10);
        if (!bankId) throw new Error('Select bank / cash account.');
        const allocations = allocLines.map((line) => {
          const amt = parseFloat(line.amount);
          if (!Number.isFinite(amt) || amt <= 0) throw new Error('Each allocation line needs amount > 0.');
          const o = { target_type: line.targetType, amount: amt };
          if (line.targetType !== 'unallocated_advance') {
            const tid = parseInt(line.targetTxnId, 10);
            if (!tid) throw new Error('Enter target txn id for invoice / on-behalf payment lines.');
            o.target_txn_id = tid;
          }
          return o;
        });
        payload = {
          txn_date: recTxnDate,
          amount,
          payment_method: recMethod,
          reference_number: recRef || null,
          notes: recNotes || null,
          narration: recNarr || null,
          firm_bank_account_id: bankId,
          allocations,
        };
      } else if (tt === 'payment_expense' || tt === 'payment_expense_reversal') {
        const amount = parseFloat(payAmount);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid payment amount.');
        const bankId = parseInt(payBankId, 10);
        if (!bankId) throw new Error('Select bank / cash account.');
        const settlement_lines = settleLines.map((line) => {
          const amt = parseFloat(line.amount);
          if (!Number.isFinite(amt) || amt <= 0) throw new Error('Each settlement line needs amount > 0.');
          const o = { target_type: line.targetType, amount: amt };
          if (line.targetType === 'receipt') {
            const tid = parseInt(line.targetTxnId, 10);
            if (!tid) throw new Error('Enter receipt txn id for receipt settlement lines.');
            o.target_txn_id = tid;
          }
          return o;
        });
        payload = {
          txn_date: payTxnDate,
          amount,
          payment_method: payMethod,
          reference_number: payRef || null,
          notes: payNotes || null,
          narration: payNarr || null,
          expense_purpose: payPurpose,
          firm_bank_account_id: bankId,
          settlement_lines,
        };
      } else if (tt === 'tds_provisional' || tt === 'tds_final' || tt === 'tds_reversal') {
        const amount = parseFloat(tdsAmount);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid TDS amount.');
        const rate = parseFloat(tdsRate);
        payload = {
          txn_date: tdsTxnDate,
          amount,
          notes: tdsNotes || null,
          narration: tdsNarr || null,
          tds_section: tdsSection || null,
          tds_rate: Number.isFinite(rate) ? rate : 0,
        };
      } else {
        throw new Error('This transaction type cannot be edited here.');
      }
      const updated = await updateTxn(txnId, payload, { superadminOtp: otp.trim() });
      onSaved(updated);
      onClose();
    } catch (e) {
      setErr(e.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const title = !row
    ? 'Edit ledger'
    : row.txnType === 'receipt'
      ? '✏️ Edit receipt'
      : row.txnType === 'receipt_reversal'
        ? '✏️ Edit receipt (reversal)'
        : row.txnType === 'payment_expense'
          ? '✏️ Edit payment (on behalf)'
          : row.txnType === 'payment_expense_reversal'
            ? '✏️ Edit payment (reversal)'
            : row.txnType === 'tds_reversal'
              ? '✏️ Edit TDS (reversal)'
              : '✏️ Edit TDS';

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 640, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={modalHeaderStyle}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {loading && <div style={{ color: '#64748b', fontSize: 13 }}>Loading…</div>}
          {err && <div style={{ color: '#dc2626', fontSize: 13 }}>{err}</div>}
          {!loading && row && (
            <>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {row.clientName || 'Unknown'} · Ref {row.publicRef || '—'} · Billing {row.billingProfileCode || '—'}
              </div>
              {(row.txnType === 'receipt' || row.txnType === 'receipt_reversal') && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <label style={labelStyle}>
                      Receipt date *
                      <DateInput style={inputStyle} value={recTxnDate} onChange={(e) => setRecTxnDate(e.target.value)} />
                    </label>
                    <label style={labelStyle}>
                      Amount (₹) *
                      <input type="number" style={inputStyle} min="0" step="0.01" value={recAmount} onChange={(e) => setRecAmount(e.target.value)} />
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <label style={labelStyle}>
                      Payment method
                      <select style={inputStyle} value={recMethod} onChange={(e) => setRecMethod(e.target.value)}>
                        {PAYMENT_METHOD_OPTIONS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </label>
                    <label style={labelStyle}>
                      Reference no.
                      <input type="text" style={inputStyle} value={recRef} onChange={(e) => setRecRef(e.target.value)} />
                    </label>
                  </div>
                  <label style={labelStyle}>
                    Bank / cash account *
                    <select
                      style={inputStyle}
                      value={recBankId}
                      onChange={(e) => setRecBankId(e.target.value)}
                      disabled={!row.billingProfileCode || banksLoading}
                    >
                      <option value="">{banksLoading ? 'Loading…' : '— Select —'}</option>
                      {banks.map((b) => (
                        <option key={b.id} value={String(b.id)}>{b.name} ({b.accountType})</option>
                      ))}
                    </select>
                  </label>
                  <label style={labelStyle}>
                    Narration
                    <input type="text" style={inputStyle} value={recNarr} onChange={(e) => setRecNarr(e.target.value)} />
                  </label>
                  <label style={labelStyle}>
                    Notes
                    <input type="text" style={inputStyle} value={recNotes} onChange={(e) => setRecNotes(e.target.value)} />
                  </label>
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>Allocations (must sum to amount)</span>
                      <button type="button" onClick={addAllocLineRow} style={{ ...btnSecondary, fontSize: 12, padding: '4px 10px' }}>+ Line</button>
                    </div>
                    {allocLines.map((line, idx) => (
                      <div key={`ea-${idx}`} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 90px 28px', gap: 8, marginBottom: 8, alignItems: 'start' }}>
                        <select
                          style={inputStyle}
                          value={line.targetType}
                          onChange={(e) => patchAllocLine(idx, { targetType: e.target.value, targetTxnId: '' })}
                        >
                          {RECEIPT_ALLOC_TARGET_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          style={inputStyle}
                          placeholder={line.targetType === 'unallocated_advance' ? '—' : 'Target txn id'}
                          value={line.targetTxnId}
                          disabled={line.targetType === 'unallocated_advance'}
                          onChange={(e) => patchAllocLine(idx, { targetTxnId: e.target.value })}
                        />
                        <input type="number" style={inputStyle} min="0" step="0.01" placeholder="₹" value={line.amount} onChange={(e) => patchAllocLine(idx, { amount: e.target.value })} />
                        <button type="button" style={{ ...iconBtn, alignSelf: 'start' }} onClick={() => removeAllocLineRow(idx)} title="Remove">−</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {(row.txnType === 'payment_expense' || row.txnType === 'payment_expense_reversal') && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <label style={labelStyle}>
                      Date *
                      <DateInput style={inputStyle} value={payTxnDate} onChange={(e) => setPayTxnDate(e.target.value)} />
                    </label>
                    <label style={labelStyle}>
                      Amount (₹) *
                      <input type="number" style={inputStyle} min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                    </label>
                  </div>
                  <label style={labelStyle}>
                    Purpose
                    <select style={inputStyle} value={payPurpose} onChange={(e) => setPayPurpose(e.target.value)}>
                      {EXPENSE_PURPOSE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <label style={labelStyle}>
                      Paid via
                      <select style={inputStyle} value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                        {PAYMENT_METHOD_OPTIONS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </label>
                    <label style={labelStyle}>
                      Reference no.
                      <input type="text" style={inputStyle} value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                    </label>
                  </div>
                  <label style={labelStyle}>
                    Bank / cash account *
                    <select
                      style={inputStyle}
                      value={payBankId}
                      onChange={(e) => setPayBankId(e.target.value)}
                      disabled={!row.billingProfileCode || banksLoading}
                    >
                      <option value="">{banksLoading ? 'Loading…' : '— Select —'}</option>
                      {banks.map((b) => (
                        <option key={b.id} value={String(b.id)}>{b.name} ({b.accountType})</option>
                      ))}
                    </select>
                  </label>
                  <label style={labelStyle}>
                    Narration
                    <input type="text" style={inputStyle} value={payNarr} onChange={(e) => setPayNarr(e.target.value)} />
                  </label>
                  <label style={labelStyle}>
                    Notes
                    <input type="text" style={inputStyle} value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
                  </label>
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>Settlement (must sum to amount)</span>
                      <button type="button" onClick={addSettleLineRow} style={{ ...btnSecondary, fontSize: 12, padding: '4px 10px' }}>+ Line</button>
                    </div>
                    {settleLines.map((line, idx) => (
                      <div key={`ps-${idx}`} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 90px 28px', gap: 8, marginBottom: 8, alignItems: 'start' }}>
                        <select
                          style={inputStyle}
                          value={line.targetType}
                          onChange={(e) => patchSettleLine(idx, { targetType: e.target.value, targetTxnId: '' })}
                        >
                          {PAYMENT_SETTLEMENT_TARGET_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          style={inputStyle}
                          placeholder={line.targetType === 'unallocated_advance' ? '—' : 'Receipt txn id'}
                          value={line.targetTxnId}
                          disabled={line.targetType === 'unallocated_advance'}
                          onChange={(e) => patchSettleLine(idx, { targetTxnId: e.target.value })}
                        />
                        <input type="number" style={inputStyle} min="0" step="0.01" placeholder="₹" value={line.amount} onChange={(e) => patchSettleLine(idx, { amount: e.target.value })} />
                        <button type="button" style={{ ...iconBtn, alignSelf: 'start' }} onClick={() => removeSettleLineRow(idx)} title="Remove">−</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {(row.txnType === 'tds_provisional' || row.txnType === 'tds_final' || row.txnType === 'tds_reversal') && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <label style={labelStyle}>
                      Date *
                      <DateInput style={inputStyle} value={tdsTxnDate} onChange={(e) => setTdsTxnDate(e.target.value)} />
                    </label>
                    <label style={labelStyle}>
                      Amount (₹) *
                      <input type="number" style={inputStyle} min="0" step="0.01" value={tdsAmount} onChange={(e) => setTdsAmount(e.target.value)} />
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <label style={labelStyle}>
                      Section
                      <input type="text" style={inputStyle} value={tdsSection} onChange={(e) => setTdsSection(e.target.value)} />
                    </label>
                    <label style={labelStyle}>
                      Rate %
                      <input type="number" style={inputStyle} min="0" step="0.01" value={tdsRate} onChange={(e) => setTdsRate(e.target.value)} />
                    </label>
                  </div>
                  <label style={labelStyle}>
                    Narration
                    <input type="text" style={inputStyle} value={tdsNarr} onChange={(e) => setTdsNarr(e.target.value)} />
                  </label>
                  <label style={labelStyle}>
                    Notes
                    <input type="text" style={inputStyle} value={tdsNotes} onChange={(e) => setTdsNotes(e.target.value)} />
                  </label>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Status: {row.tdsStatus || '—'} (finalize unchanged)</div>
                </>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <button type="button" style={btnSecondary} disabled={requesting} onClick={handleRequestOtp}>
                  {requesting ? 'Sending…' : 'Request superadmin OTP'}
                </button>
                {otpSent && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>Code sent</span>}
              </div>
              <label style={labelStyle}>
                Superadmin OTP *
                <input type="text" style={inputStyle} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\s/g, ''))} />
              </label>
              {!isCompensatingReversalRow && (
              <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 16, paddingTop: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Reverse this posting</div>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px', lineHeight: 1.45 }}>
                  Inserts a compensating ledger row and marks the original as reversed (audit trail). Does not replace edit/delete above.
                </p>
                {reversalBlockedForStaff && (
                  <p style={{ fontSize: 12, color: '#b45309', margin: '0 0 10px', lineHeight: 1.45 }}>
                    The 30-day window has elapsed. You cannot reverse the transaction. Please contact super admin.
                  </p>
                )}
                <label style={labelStyle}>
                  Reversal reason (min 10 characters) *
                  <textarea
                    style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                    value={revReason}
                    onChange={(e) => setRevReason(e.target.value)}
                    placeholder="Document why this posting is reversed…"
                    disabled={reversalBlockedForStaff}
                  />
                </label>
                {userRevEligible && (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                      <button type="button" style={btnSecondary} disabled={revRequesting} onClick={handleRequestReversalUserOtp}>
                        {revRequesting ? 'Sending…' : 'Send verification code to my email'}
                      </button>
                      {revUserOtpSent && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>Check your inbox</span>}
                    </div>
                    <label style={labelStyle}>
                      Verification code (from your email) *
                      <input type="text" style={inputStyle} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code from your email" value={revUserOtp} onChange={(e) => setRevUserOtp(e.target.value.replace(/\s/g, ''))} />
                    </label>
                  </>
                )}
                {needsReversalSuperOtpOnly && (
                  <label style={labelStyle}>
                    Superadmin OTP (reversal) *
                    <input type="text" style={inputStyle} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={revSuperOtp} onChange={(e) => setRevSuperOtp(e.target.value.replace(/\s/g, ''))} />
                    <span style={{ display: 'block', fontSize: 11, color: '#64748b', fontWeight: 400, marginTop: 4 }}>
                      Request a code with the button above if you do not have one yet.
                    </span>
                  </label>
                )}
                <button
                  type="button"
                  style={{
                    ...btnSecondary,
                    marginTop: 8,
                    background: '#7f1d1d',
                    color: '#fff',
                    border: '1px solid #450a0a',
                  }}
                  disabled={revReversing || loading || !row || row.status !== 'active' || reversalBlockedForStaff}
                  onClick={handleReverseLedger}
                >
                  {revReversing ? 'Reversing…' : 'Reverse transaction'}
                </button>
              </div>
              )}
            </>
          )}
        </div>
        <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
          <button type="button" style={btnPrimary} disabled={loading || saving || !row} onClick={handleSave}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}


/** Single or bulk ledger delete: one superadmin OTP authorizes the batch. */
function LedgerDeleteModal({ title, items, onClose, onDeleted }) {
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [err, setErr] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const isPlural = items.length !== 1;
  const heading = title || (isPlural ? `Delete ${items.length} records` : 'Delete ledger record');
  const otpBusy = sendingOtp || deleting;

  async function sendOtp() {
    setErr('');
    setSendingOtp(true);
    try {
      await requestLedgerDeleteOtp(ids);
      setOtpSent(true);
    } catch (e) {
      setErr(e.message || 'Failed to send OTP.');
    } finally {
      setSendingOtp(false);
    }
  }

  async function confirmDelete() {
    if (!otp.trim()) {
      setErr('Enter the superadmin OTP.');
      return;
    }
    setDeleting(true);
    setErr('');
    try {
      const raw = await bulkDeleteTxns(ids, { superadminOtp: otp.trim() });
      const removed = Array.isArray(raw?.txn_ids) ? raw.txn_ids : ids;
      onDeleted(removed);
      onClose();
    } catch (e) {
      setErr(e.message || 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ ...overlayStyle, zIndex: 10100 }}>
      <div
        style={{
          ...modalStyle,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',
          zIndex: 1,
        }}
      >
        <div style={modalHeaderStyle}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#b91c1c' }}>{heading}</span>
          <button type="button" onClick={() => !deleting && onClose()} style={closeBtnStyle}>✕</button>
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <p style={{ fontSize: 13, color: '#334155', margin: 0 }}>
            {isPlural ? (
              <>Permanently delete <strong>{items.length}</strong> selected ledger transaction(s). This cannot be undone.</>
            ) : (
              <>Permanently delete <strong>{items[0]?.label || `#${items[0]?.id}`}</strong>? This cannot be undone.</>
            )}
          </p>
          {isPlural && (
            <ul style={{ fontSize: 12, color: '#475569', margin: 0, paddingLeft: 18, maxHeight: 220, overflow: 'auto' }}>
              {items.map((it) => (
                <li key={it.id} style={{ marginBottom: 4 }}>{it.label || `Transaction #${it.id}`}</li>
              ))}
            </ul>
          )}
          <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
            Request a superadmin OTP (one code for this entire batch), then enter it to confirm.
          </p>
          {err && <div style={{ color: '#dc2626', fontSize: 13 }}>{err}</div>}
          <button type="button" style={btnSecondary} disabled={otpBusy} onClick={sendOtp}>
            {sendingOtp ? 'Sending…' : 'Request superadmin OTP'}
          </button>
          {otpSent && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>Code sent</span>}
          <label style={labelStyle}>
            Superadmin OTP *
            <input
              type="text"
              style={inputStyle}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\s/g, ''))}
            />
          </label>
        </div>
        <div
          style={{
            flexShrink: 0,
            padding: '12px 24px 20px',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            background: '#fff',
          }}
        >
          <button type="button" disabled={deleting} onClick={onClose} style={btnSecondary}>Cancel</button>
          <button
            type="button"
            disabled={deleting}
            onClick={confirmDelete}
            style={{ ...btnPrimary, background: deleting ? '#cbd5e1' : '#b91c1c', cursor: deleting ? 'default' : 'pointer' }}
          >
            {deleting ? 'Deleting…' : (isPlural ? `Delete ${items.length} records` : 'Delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RecordPaymentModal ────────────────────────────────────────────────────────

function RecordPaymentModal({ onClose, onSave, invoice }) {
  const [form, setForm] = useState({
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    method: 'NEFT',
    reference: '',
    billingProfileCode: invoice?.billingProfileCode || '',
    firmBankAccountId: '',
    ledgerClass: invoice?.ledgerClass || 'regular',
    ledgerMovementKind: 'fees',
  });
  const [banks, setBanks] = useState([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const code = form.billingProfileCode;
    if (!code) {
      setBanks([]);
      return;
    }
    let cancel = false;
    setBanksLoading(true);
    listFirmBankAccounts(code)
      .then((rows) => {
        if (cancel) return;
        const list = Array.isArray(rows) ? rows.filter((b) => b.isActive !== false) : [];
        setBanks(list);
        setForm((f) => {
          if (f.firmBankAccountId && list.some((b) => String(b.id) === String(f.firmBankAccountId))) return f;
          return { ...f, firmBankAccountId: list[0] ? String(list[0].id) : '' };
        });
      })
      .catch(() => { if (!cancel) setBanks([]); })
      .finally(() => { if (!cancel) setBanksLoading(false); });
    return () => { cancel = true; };
  }, [form.billingProfileCode]);

  useEffect(() => {
    if (!invoice) return;
    setForm((f) => ({
      ...f,
      billingProfileCode: invoice.billingProfileCode || f.billingProfileCode,
      ledgerClass: invoice.ledgerClass || 'regular',
    }));
  }, [invoice?.id]);

  const handleSave = () => {
    if (!form.amount || !form.paymentDate || !form.billingProfileCode || !form.firmBankAccountId) return;
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
              Ledger type
              <select style={inputStyle} value={form.ledgerClass} onChange={(e) => set('ledgerClass', e.target.value)} disabled={!!invoice}>
                {LEDGER_CLASS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Ledger view
              <select style={inputStyle} value={form.ledgerMovementKind} onChange={(e) => set('ledgerMovementKind', e.target.value)}>
                {LEDGER_MOVEMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <label style={labelStyle}>
              Amount (₹)
              <input type="number" style={inputStyle} placeholder="e.g. 5900" value={form.amount} onChange={e=>set('amount',e.target.value)} />
            </label>
            <label style={labelStyle}>
              Payment Date
              <DateInput style={inputStyle} value={form.paymentDate} onChange={e=>set('paymentDate',e.target.value)} />
            </label>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <label style={labelStyle}>
              Payment Method
              <select style={inputStyle} value={form.method} onChange={e=>set('method',e.target.value)}>
                {PAYMENT_METHOD_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Reference No.
              <input type="text" style={inputStyle} placeholder="UTR / Cheque No." value={form.reference} onChange={e=>set('reference',e.target.value)} />
            </label>
          </div>
          <label style={labelStyle}>
            Billing Profile
            <BillingProfileSelect
              style={inputStyle}
              value={form.billingProfileCode}
              onChange={(code) => set('billingProfileCode', code)}
            />
          </label>
          <label style={labelStyle}>
            Bank / cash account
            <select
              style={inputStyle}
              value={form.firmBankAccountId}
              onChange={(e) => set('firmBankAccountId', e.target.value)}
              disabled={!form.billingProfileCode || banksLoading}
            >
              <option value="">{banksLoading ? 'Loading…' : '— Select account —'}</option>
              {banks.map((b) => (
                <option key={b.id} value={String(b.id)}>{b.name} ({b.accountType})</option>
              ))}
            </select>
          </label>
          {!banksLoading && form.billingProfileCode && banks.length === 0 && (
            <div style={{ fontSize: 12, color: '#b45309' }}>No bank accounts for this firm. Add them under Finance → Bank &amp; firm txns.</div>
          )}
        </div>
        <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10 }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button onClick={handleSave} style={btnPrimary}>Save Payment</button>
        </div>
      </div>
    </div>
  );
}

// ── PaymentExpenseModal (firm paid on behalf of client) ─────────────────────

const PAYMENT_EXPENSE_SETTLEMENT_OPTIONS = [
  { value: 'receipt', label: 'Client receipt' },
  { value: 'unallocated_advance', label: 'Unallocated advance' },
];

function PaymentExpenseModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    entityId: '',
    entityName: '',
    entityType: 'contact',
    amount: '',
    txnDate: new Date().toISOString().slice(0, 10),
    expensePurpose: 'challan',
    method: 'NEFT',
    referenceNumber: '',
    billingProfileCode: '',
    firmBankAccountId: '',
    description: '',
    notes: '',
    ledgerClass: 'regular',
    ledgerMovementKind: 'fees',
  });
  const [settlementLines, setSettlementLines] = useState([
    { targetType: 'unallocated_advance', targetTxnId: '', amount: '' },
  ]);
  /** Header amount last mirrored onto the single unallocated settlement line (avoids sticking on first digit). */
  const paymentAmountMirrorRef = useRef('');
  const [receiptOpts, setReceiptOpts] = useState([]);
  const [receiptOptsLoading, setReceiptOptsLoading] = useState(false);
  const [banks, setBanks] = useState([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const code = form.billingProfileCode;
    if (!code) {
      setBanks([]);
      return;
    }
    let cancel = false;
    setBanksLoading(true);
    listFirmBankAccounts(code)
      .then((rows) => {
        if (cancel) return;
        const list = Array.isArray(rows) ? rows.filter((b) => b.isActive !== false) : [];
        setBanks(list);
        setForm((f) => {
          if (f.firmBankAccountId && list.some((b) => String(b.id) === String(f.firmBankAccountId))) return f;
          return { ...f, firmBankAccountId: list[0] ? String(list[0].id) : '' };
        });
      })
      .catch(() => { if (!cancel) setBanks([]); })
      .finally(() => { if (!cancel) setBanksLoading(false); });
    return () => { cancel = true; };
  }, [form.billingProfileCode]);

  useEffect(() => {
    const idNum = parseInt(form.entityId, 10);
    if (!form.entityId || Number.isNaN(idNum) || idNum <= 0) {
      setReceiptOpts([]);
      return;
    }
    let cancel = false;
    setReceiptOptsLoading(true);
    const params = {
      ledgerClass: normalizeLedgerClassForApi(form.ledgerClass),
      ledgerMovementKind: form.ledgerMovementKind === 'reimbursement' ? 'reimbursement' : 'fees',
    };
    if (form.entityType === 'organization') {
      params.organizationId = idNum;
    } else {
      params.clientId = idNum;
    }
    getReceiptsWithUnallocated(params)
      .then((rows) => {
        if (cancel) return;
        setReceiptOpts(Array.isArray(rows) ? rows : []);
      })
      .catch(() => { if (!cancel) setReceiptOpts([]); })
      .finally(() => { if (!cancel) setReceiptOptsLoading(false); });
    return () => { cancel = true; };
  }, [form.entityId, form.entityType, form.ledgerClass, form.ledgerMovementKind]);

  useEffect(() => {
    setSettlementLines((L) => {
      if (L.length !== 1 || L[0].targetType !== 'unallocated_advance') return L;
      const lineAmt = String(L[0].amount ?? '').trim();
      const snap = String(paymentAmountMirrorRef.current ?? '').trim();
      if (lineAmt !== '' && lineAmt !== snap) return L;
      paymentAmountMirrorRef.current = form.amount;
      const next = String(form.amount ?? '').trim();
      if (!next) return [{ ...L[0], amount: '' }];
      return [{ ...L[0], amount: form.amount }];
    });
  }, [form.amount]);

  const setSettleLine = (idx, patch) => {
    setSettlementLines((L) => L.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };
  const addSettleLine = () => {
    setSettlementLines((L) => [...L, { targetType: 'unallocated_advance', targetTxnId: '', amount: '' }]);
  };
  const removeSettleLine = (idx) => {
    setSettlementLines((L) => (L.length <= 1 ? L : L.filter((_, i) => i !== idx)));
  };

  const handleSave = () => {
    if (!form.entityId || !form.amount || !form.txnDate || !form.description.trim() || !form.billingProfileCode || !form.firmBankAccountId) return;
    const total = parseFloat(form.amount);
    if (Number.isNaN(total) || total <= 0) return;
    const lines = settlementLines.map((l) => ({
      target_type: l.targetType,
      target_txn_id: l.targetType === 'receipt' ? (parseInt(l.targetTxnId, 10) || 0) : undefined,
      amount: parseFloat(l.amount) || 0,
    })).filter((l) => l.amount > 0);
    if (lines.length === 0) {
      window.alert('Add at least one settlement line with a positive amount.');
      return;
    }
    const sum = lines.reduce((s, l) => s + l.amount, 0);
    if (Math.abs(sum - total) > 0.02) {
      window.alert(`Allocation lines must sum to the payment amount (₹${total.toFixed(2)}); currently ₹${sum.toFixed(2)}.`);
      return;
    }
    for (const l of lines) {
      if (l.target_type === 'receipt' && (!l.target_txn_id || l.target_txn_id <= 0)) {
        window.alert('Select a client receipt for each receipt line, or switch the line to Unallocated advance.');
        return;
      }
    }
    onSave({ ...form, settlementLines });
    onClose();
  };
  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 580 }}>
        <div style={modalHeaderStyle}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>💳 Payment on behalf of client</span>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={labelStyle}>
            Client (contact or organization)
            <EntitySearchDropdown
              value={form.entityId}
              displayValue={form.entityName}
              entityType={form.entityType}
              onChange={(c) => {
                setForm((f) => ({
                  ...f,
                  entityId: String(c.id),
                  entityName: c.displayName,
                  entityType: c.entityType,
                }));
                paymentAmountMirrorRef.current = '';
                setSettlementLines([{ targetType: 'unallocated_advance', targetTxnId: '', amount: '' }]);
              }}
              placeholder="Search contact or organization…"
              style={inputStyle}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={labelStyle}>
              Ledger type
              <select
                style={inputStyle}
                value={form.ledgerClass}
                onChange={(e) => {
                  set('ledgerClass', e.target.value);
                  paymentAmountMirrorRef.current = '';
                  setSettlementLines([{ targetType: 'unallocated_advance', targetTxnId: '', amount: '' }]);
                }}
              >
                {LEDGER_CLASS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Ledger view
              <select
                style={inputStyle}
                value={form.ledgerMovementKind}
                onChange={(e) => {
                  set('ledgerMovementKind', e.target.value);
                  paymentAmountMirrorRef.current = '';
                  setSettlementLines([{ targetType: 'unallocated_advance', targetTxnId: '', amount: '' }]);
                }}
              >
                {LEDGER_MOVEMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={labelStyle}>
              Amount (₹)
              <input type="number" style={inputStyle} placeholder="e.g. 2500" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
            </label>
            <label style={labelStyle}>
              Payment date
              <DateInput style={inputStyle} value={form.txnDate} onChange={(e) => set('txnDate', e.target.value)} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={labelStyle}>
              Purpose
              <select
                style={inputStyle}
                value={form.expensePurpose}
                onChange={(e) => set('expensePurpose', e.target.value)}
              >
                {EXPENSE_PURPOSE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Description (shown on ledger) *
              <input type="text" style={inputStyle} placeholder="What was paid and why" value={form.description} onChange={(e) => set('description', e.target.value)} aria-required />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={labelStyle}>
              Paid via
              <select style={inputStyle} value={form.method} onChange={(e) => set('method', e.target.value)}>
                {PAYMENT_METHOD_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Reference no. (UTR / challan / cheque)
              <input type="text" style={inputStyle} placeholder="Optional" value={form.referenceNumber} onChange={(e) => set('referenceNumber', e.target.value)} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={labelStyle}>
              Billing profile
              <BillingProfileSelect
                style={inputStyle}
                value={form.billingProfileCode}
                onChange={(code) => set('billingProfileCode', code)}
                placeholder="— Select billing profile —"
              />
            </label>
            <label style={labelStyle}>
              Bank / cash account
              <select
                style={inputStyle}
                value={form.firmBankAccountId}
                onChange={(e) => set('firmBankAccountId', e.target.value)}
                disabled={!form.billingProfileCode || banksLoading}
              >
                <option value="">{banksLoading ? 'Loading…' : '— Select account —'}</option>
                {banks.map((b) => (
                  <option key={b.id} value={String(b.id)}>{b.name} ({b.accountType})</option>
                ))}
              </select>
            </label>
          </div>
          <label style={labelStyle}>
            Internal notes
            <input type="text" style={inputStyle} placeholder="Optional" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </label>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Settlement (must sum to amount)</span>
              <button type="button" onClick={addSettleLine} style={{ ...btnSecondary, fontSize: 12, padding: '4px 10px' }}>+ Line</button>
            </div>
            {settlementLines.map((line, idx) => (
              <div
                key={`pay-settle-${idx}-${line.targetType}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '150px 1fr 100px 32px',
                  gap: 8,
                  alignItems: 'start',
                  marginBottom: 10,
                }}
              >
                <select
                  style={inputStyle}
                  value={line.targetType}
                  onChange={(e) => {
                    const targetType = e.target.value;
                    const patch = {
                      targetType,
                      targetTxnId: '',
                      amount: line.amount,
                    };
                    if (targetType === 'unallocated_advance') {
                      const amt = String(form.amount || '').trim();
                      if (amt) {
                        patch.amount = form.amount;
                        paymentAmountMirrorRef.current = form.amount;
                      }
                    }
                    setSettleLine(idx, patch);
                  }}
                >
                  {PAYMENT_EXPENSE_SETTLEMENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <div style={{ minWidth: 0 }}>
                  {line.targetType === 'receipt' && (
                    <select
                      style={inputStyle}
                      value={line.targetTxnId}
                      onChange={(e) => setSettleLine(idx, { targetTxnId: e.target.value })}
                    >
                      <option value="">
                        {receiptOptsLoading ? 'Loading receipts…' : (receiptOpts.length === 0 ? '— No receipts with unallocated balance —' : '— Select receipt —')}
                      </option>
                      {receiptOpts.map((r) => (
                        <option key={r.id} value={String(r.id)}>
                          {(r.public_ref || `Receipt #${r.id}`)} · {r.txn_date} · ₹{Number(r.unallocated_advance).toLocaleString('en-IN')} avail
                        </option>
                      ))}
                    </select>
                  )}
                  {line.targetType === 'unallocated_advance' && (
                    <span style={{ fontSize: 12, color: '#64748b', lineHeight: '38px' }}>No target — bill-by-bill uses unallocated advance</span>
                  )}
                </div>
                <input
                  type="number"
                  style={inputStyle}
                  placeholder="₹"
                  value={line.amount}
                  onChange={(e) => setSettleLine(idx, { amount: e.target.value })}
                />
                <button type="button" onClick={() => removeSettleLine(idx)} style={{ ...iconBtn, alignSelf: 'start' }} title="Remove line">−</button>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
          <button type="button" onClick={handleSave} style={btnPrimary}>Save payment</button>
        </div>
      </div>
    </div>
  );
}

/** Searchable picker for linking an open invoice (Record Receipt modal). */
function LinkedInvoiceSearchDropdown({ invoices, value, onChange, placeholder = 'Search invoice # or client…' }) {
  const containerRef = useRef(null);
  const selectedLabel = useMemo(() => {
    if (!value) return '';
    const inv = (invoices || []).find((i) => String(i.id) === String(value));
    return inv ? `${inv.invoiceNumber} – ${inv.clientName}` : '';
  }, [value, invoices]);

  const [query, setQuery] = useState('');
  useEffect(() => {
    setQuery(selectedLabel);
  }, [selectedLabel]);

  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = invoices || [];
    if (!q) return list.slice(0, 100);
    return list.filter((inv) =>
      String(inv.invoiceNumber || '').toLowerCase().includes(q)
      || String(inv.clientName || '').toLowerCase().includes(q),
    ).slice(0, 50);
  }, [invoices, query]);

  const dropdownStyle = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 9999,
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    maxHeight: 240,
    overflowY: 'auto',
    marginTop: 2,
  };

  const itemStyle = {
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: 13,
    color: '#334155',
    background: '#fff',
    borderBottom: '1px solid #f8fafc',
  };

  function handleInput(e) {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    if (!val.trim()) {
      onChange('');
      return;
    }
    const exact = (invoices || []).find((i) => `${i.invoiceNumber} – ${i.clientName}` === val.trim());
    if (!exact) {
      onChange('');
    }
  }

  function handleFocus() {
    setOpen(true);
  }

  function handleSelect(inv) {
    const label = `${inv.invoiceNumber} – ${inv.clientName}`;
    setQuery(label);
    setOpen(false);
    onChange(String(inv.id));
  }

  function handleClearNone(e) {
    e.preventDefault();
    setQuery('');
    setOpen(false);
    onChange('');
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={query}
        onChange={handleInput}
        onFocus={handleFocus}
        placeholder={placeholder}
        style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
        autoComplete="off"
      />
      {open && (
        <div style={dropdownStyle}>
          <div
            style={{ ...itemStyle, fontStyle: 'italic', color: '#64748b' }}
            onMouseDown={handleClearNone}
          >
            — None —
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: '#94a3b8' }}>No matching invoices</div>
          ) : (
            filtered.map((inv) => (
              <div
                key={inv.id}
                style={itemStyle}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f4ff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(inv);
                }}
              >
                {inv.invoiceNumber}
                {' – '}
                {inv.clientName}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── ReceiptModal ──────────────────────────────────────────────────────────────

const RECEIPT_ALLOC_TARGET_OPTIONS = [
  { value: 'invoice', label: 'Invoice' },
  { value: 'payment_expense', label: 'Payment (on behalf)' },
  { value: 'unallocated_advance', label: 'Unallocated advance' },
];

const PAYMENT_SETTLEMENT_TARGET_OPTIONS = [
  { value: 'receipt', label: 'Receipt' },
  { value: 'unallocated_advance', label: 'Unallocated advance' },
];

function ReceiptModal({ onClose, onSave, openInvoices }) {
  const [form, setForm] = useState({
    entityId: '',
    entityName: '',
    entityType: 'contact',
    amount: '',
    txnDate: new Date().toISOString().slice(0, 10),
    method: 'NEFT',
    referenceNumber: '',
    billingProfileCode: '',
    firmBankAccountId: '',
    notes: '',
    ledgerClass: 'regular',
    ledgerMovementKind: 'fees',
  });
  const [allocLines, setAllocLines] = useState([
    { targetType: 'invoice', targetTxnId: '', amount: '' },
  ]);
  /** Header amount last mirrored onto the single unallocated allocation line (avoids sticking on first digit). */
  const receiptAmountMirrorRef = useRef('');
  const [payRows, setPayRows] = useState([]);
  const [banks, setBanks] = useState([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const code = form.billingProfileCode;
    if (!code) {
      setBanks([]);
      return;
    }
    let cancel = false;
    setBanksLoading(true);
    listFirmBankAccounts(code)
      .then((rows) => {
        if (cancel) return;
        const list = Array.isArray(rows) ? rows.filter((b) => b.isActive !== false) : [];
        setBanks(list);
        setForm((f) => {
          if (f.firmBankAccountId && list.some((b) => String(b.id) === String(f.firmBankAccountId))) return f;
          return { ...f, firmBankAccountId: list[0] ? String(list[0].id) : '' };
        });
      })
      .catch(() => { if (!cancel) setBanks([]); })
      .finally(() => { if (!cancel) setBanksLoading(false); });
    return () => { cancel = true; };
  }, [form.billingProfileCode]);

  useEffect(() => {
    if (!form.entityId) {
      setPayRows([]);
      return;
    }
    let cancel = false;
    const txnParams = {
      txnType: 'payment_expense',
      perPage: 100,
      status: 'active',
      ...(form.entityType === 'organization'
        ? { organizationId: form.entityId }
        : { clientId: form.entityId }),
    };
    getTxns(txnParams)
      .then(({ txns }) => {
        if (cancel) return;
        const f = (txns || []).filter((t) =>
          (t.ledgerClass || 'regular') === form.ledgerClass
          && (t.ledgerMovementKind || 'fees') === form.ledgerMovementKind,
        );
        setPayRows(f);
      })
      .catch(() => { if (!cancel) setPayRows([]); });
    return () => { cancel = true; };
  }, [form.entityId, form.entityType, form.ledgerClass, form.ledgerMovementKind]);

  useEffect(() => {
    setAllocLines((L) => {
      if (L.length !== 1 || L[0].targetType !== 'unallocated_advance') return L;
      const lineAmt = String(L[0].amount ?? '').trim();
      const snap = String(receiptAmountMirrorRef.current ?? '').trim();
      if (lineAmt !== '' && lineAmt !== snap) return L;
      receiptAmountMirrorRef.current = form.amount;
      const next = String(form.amount ?? '').trim();
      if (!next) return [{ ...L[0], amount: '' }];
      return [{ ...L[0], amount: form.amount }];
    });
  }, [form.amount]);

  const ledgerMatchedInvoices = useMemo(
    () => (openInvoices || []).filter((inv) => (inv.ledgerClass || 'regular') === form.ledgerClass),
    [openInvoices, form.ledgerClass],
  );

  const setLine = (idx, patch) => {
    setAllocLines((L) => L.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const addAllocLine = () => {
    setAllocLines((L) => [...L, { targetType: 'unallocated_advance', targetTxnId: '', amount: '' }]);
  };

  const removeAllocLine = (idx) => {
    setAllocLines((L) => (L.length <= 1 ? L : L.filter((_, i) => i !== idx)));
  };

  const handleSave = () => {
    if (!form.entityId || !form.amount || !form.txnDate || !form.billingProfileCode || !form.firmBankAccountId) return;
    const total = parseFloat(form.amount);
    if (Number.isNaN(total) || total <= 0) return;
    const lines = allocLines.map((l) => ({
      target_type: l.targetType,
      target_txn_id: l.targetType === 'unallocated_advance' ? undefined : (parseInt(l.targetTxnId, 10) || 0),
      amount: parseFloat(l.amount) || 0,
    })).filter((l) => l.amount > 0);
    if (lines.length === 0) return;
    const sum = lines.reduce((s, l) => s + l.amount, 0);
    if (Math.abs(sum - total) > 0.02) {
      window.alert(`Allocation lines must sum to the receipt amount (₹${total.toFixed(2)}); currently ₹${sum.toFixed(2)}.`);
      return;
    }
    for (const l of lines) {
      if (l.target_type !== 'unallocated_advance' && (!l.target_txn_id || l.target_txn_id <= 0)) {
        window.alert('Select an invoice or payment for each non-advance line.');
        return;
      }
    }
    onSave({ ...form, allocations: lines });
    onClose();
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={modalHeaderStyle}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>💵 Record Receipt</span>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={labelStyle}>
            Client (contact or organization)
            <EntitySearchDropdown
              value={form.entityId}
              displayValue={form.entityName}
              entityType={form.entityType}
              onChange={(c) => {
                setForm((f) => ({
                  ...f,
                  entityId: c.id,
                  entityName: c.displayName,
                  entityType: c.entityType,
                }));
                receiptAmountMirrorRef.current = '';
                setAllocLines([{ targetType: 'invoice', targetTxnId: '', amount: '' }]);
              }}
              placeholder="Search contact or organization…"
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={labelStyle}>
              Ledger type
              <select
                style={inputStyle}
                value={form.ledgerClass}
                onChange={(e) => {
                  setForm((f) => ({ ...f, ledgerClass: e.target.value }));
                  receiptAmountMirrorRef.current = '';
                  setAllocLines([{ targetType: 'invoice', targetTxnId: '', amount: '' }]);
                }}
              >
                {LEDGER_CLASS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Ledger view
              <select style={inputStyle} value={form.ledgerMovementKind} onChange={(e) => set('ledgerMovementKind', e.target.value)}>
                {LEDGER_MOVEMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={labelStyle}>
              Amount (₹)
              <input type="number" style={inputStyle} placeholder="e.g. 5900" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
            </label>
            <label style={labelStyle}>
              Receipt Date
              <DateInput style={inputStyle} value={form.txnDate} onChange={(e) => set('txnDate', e.target.value)} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={labelStyle}>
              Payment Method
              <select style={inputStyle} value={form.method} onChange={(e) => set('method', e.target.value)}>
                {PAYMENT_METHOD_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Reference No. (UTR / Cheque No)
              <input type="text" style={inputStyle} placeholder="UTR / Cheque No." value={form.referenceNumber} onChange={(e) => set('referenceNumber', e.target.value)} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={labelStyle}>
              Billing Profile
              <BillingProfileSelect
                style={inputStyle}
                value={form.billingProfileCode}
                onChange={(code) => set('billingProfileCode', code)}
              />
            </label>
            <label style={labelStyle}>
              Bank / cash account
              <select
                style={inputStyle}
                value={form.firmBankAccountId}
                onChange={(e) => set('firmBankAccountId', e.target.value)}
                disabled={!form.billingProfileCode || banksLoading}
              >
                <option value="">{banksLoading ? 'Loading…' : '— Select account —'}</option>
                {banks.map((b) => (
                  <option key={b.id} value={String(b.id)}>{b.name} ({b.accountType})</option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Settlement (must sum to amount)</span>
              <button type="button" onClick={addAllocLine} style={{ ...btnSecondary, fontSize: 12, padding: '4px 10px' }}>+ Line</button>
            </div>
            {allocLines.map((line, idx) => (
              <div
                key={`alloc-${idx}-${line.targetType}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '130px 1fr 100px 32px',
                  gap: 8,
                  alignItems: 'start',
                  marginBottom: 10,
                }}
              >
                <select
                  style={inputStyle}
                  value={line.targetType}
                  onChange={(e) => {
                    const targetType = e.target.value;
                    const patch = {
                      targetType,
                      targetTxnId: '',
                      amount: line.amount,
                    };
                    if (targetType === 'unallocated_advance') {
                      const amt = String(form.amount || '').trim();
                      if (amt) {
                        patch.amount = form.amount;
                        receiptAmountMirrorRef.current = form.amount;
                      }
                    }
                    setLine(idx, patch);
                  }}
                >
                  {RECEIPT_ALLOC_TARGET_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <div style={{ minWidth: 0 }}>
                  {line.targetType === 'invoice' && (
                    <LinkedInvoiceSearchDropdown
                      invoices={ledgerMatchedInvoices}
                      value={line.targetTxnId}
                      onChange={(id) => setLine(idx, { targetTxnId: id })}
                      placeholder="Invoice…"
                    />
                  )}
                  {line.targetType === 'payment_expense' && (
                    <select
                      style={inputStyle}
                      value={line.targetTxnId}
                      onChange={(e) => setLine(idx, { targetTxnId: e.target.value })}
                    >
                      <option value="">— Payment —</option>
                      {payRows.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          #{p.id} — ₹{(p.amount || 0).toLocaleString('en-IN')} — {(p.narration || '').slice(0, 40)}
                        </option>
                      ))}
                    </select>
                  )}
                  {line.targetType === 'unallocated_advance' && (
                    <span style={{ fontSize: 12, color: '#64748b', lineHeight: '38px' }}>No target — advance held on ledger</span>
                  )}
                </div>
                <input
                  type="number"
                  style={inputStyle}
                  placeholder="₹"
                  value={line.amount}
                  onChange={(e) => setLine(idx, { amount: e.target.value })}
                />
                <button type="button" onClick={() => removeAllocLine(idx)} style={{ ...iconBtn, alignSelf: 'start' }} title="Remove line">−</button>
              </div>
            ))}
          </div>

          <label style={labelStyle}>
            Notes
            <input type="text" style={inputStyle} placeholder="Optional notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </label>
        </div>
        <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
          <button type="button" onClick={handleSave} style={btnPrimary}>Save Receipt</button>
        </div>
      </div>
    </div>
  );
}

// ── TdsModal ──────────────────────────────────────────────────────────────────

function TdsModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    clientId: '',
    clientName: '',
    amount: '',
    txnDate: new Date().toISOString().slice(0,10),
    tdsSection: '194J',
    tdsRate: '',
    billingProfileCode: '',
    notes: '',
    ledgerClass: 'regular',
    ledgerMovementKind: 'fees',
  });
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
              Ledger type
              <select style={inputStyle} value={form.ledgerClass} onChange={e=>set('ledgerClass',e.target.value)}>
                {LEDGER_CLASS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Ledger view
              <select style={inputStyle} value={form.ledgerMovementKind} onChange={e=>set('ledgerMovementKind',e.target.value)}>
                {LEDGER_MOVEMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <label style={labelStyle}>
              Amount (₹)
              <input type="number" style={inputStyle} placeholder="e.g. 5000" value={form.amount} onChange={e=>set('amount',e.target.value)} />
            </label>
            <label style={labelStyle}>
              TDS Date
              <DateInput style={inputStyle} value={form.txnDate} onChange={e=>set('txnDate',e.target.value)} />
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
            <BillingProfileSelect
              style={inputStyle}
              value={form.billingProfileCode}
              onChange={(code) => set('billingProfileCode', code)}
            />
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
  const [form, setForm] = useState({
    clientId: '',
    clientName: '',
    amount: '',
    txnDate: new Date().toISOString().slice(0,10),
    narration: '',
    billingProfileCode: '',
    notes: '',
    ledgerClass: 'regular',
    ledgerMovementKind: 'fees',
  });
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
              Ledger type
              <select style={inputStyle} value={form.ledgerClass} onChange={e=>set('ledgerClass',e.target.value)}>
                {LEDGER_CLASS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Ledger view
              <select style={inputStyle} value={form.ledgerMovementKind} onChange={e=>set('ledgerMovementKind',e.target.value)}>
                {LEDGER_MOVEMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <label style={labelStyle}>
              Amount (₹)
              <input type="number" style={inputStyle} placeholder="e.g. 1000" value={form.amount} onChange={e=>set('amount',e.target.value)} />
            </label>
            <label style={labelStyle}>
              Date
              <DateInput style={inputStyle} value={form.txnDate} onChange={e=>set('txnDate',e.target.value)} />
            </label>
          </div>
          <label style={labelStyle}>
            Narration
            <input type="text" style={inputStyle} placeholder="e.g. Discount on outstanding for FY 2024-25" value={form.narration} onChange={e=>set('narration',e.target.value)} />
          </label>
          <label style={labelStyle}>
            Billing Profile
            <BillingProfileSelect
              style={inputStyle}
              value={form.billingProfileCode}
              onChange={(code) => set('billingProfileCode', code)}
            />
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

function CreditNoteModal({ onClose, onSave, openInvoices, creditNotes }) {
  const [ledgerClassFilter, setLedgerClassFilter] = useState('regular');
  const [form, setForm] = useState({
    clientId: '',
    clientName: '',
    linkedTxnId: '',
    amount: '',
    txnDate: new Date().toISOString().slice(0, 10),
    narration: '',
    billingProfileCode: '',
    notes: '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const creditedByInvoice = useMemo(() => {
    const m = {};
    (creditNotes || []).forEach((c) => {
      if (!c.linkedTxnId) return;
      const k = String(c.linkedTxnId);
      m[k] = (m[k] || 0) + (parseFloat(c.amount, 10) || 0);
    });
    return m;
  }, [creditNotes]);

  const invoiceOptions = useMemo(() => (
    (openInvoices || []).filter((inv) => {
      if ((inv.ledgerClass || 'regular') !== ledgerClassFilter) return false;
      const st = inv.status || inv.invoiceStatus || '';
      if (st === 'cancelled') return false;
      const cred = creditedByInvoice[String(inv.id)] || 0;
      const rem = (parseFloat(inv.amount, 10) || 0) - cred;
      return rem > 0.0001;
    })
  ), [openInvoices, ledgerClassFilter, creditedByInvoice]);

  const handleSave = () => {
    if (!form.amount || !form.linkedTxnId) return;
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
            Invoice ledger type
            <select
              style={inputStyle}
              value={ledgerClassFilter}
              onChange={(e) => {
                setLedgerClassFilter(e.target.value);
                setForm((f) => ({ ...f, linkedTxnId: '' }));
              }}
            >
              {LEDGER_CLASS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Original Invoice (required)
            <select
              style={inputStyle}
              value={form.linkedTxnId}
              onChange={(e) => {
                const idStr = e.target.value;
                const inv = (openInvoices || []).find((i) => String(i.id) === String(idStr));
                setForm((f) => ({
                  ...f,
                  linkedTxnId: idStr,
                  clientId: inv?.clientId != null ? String(inv.clientId) : f.clientId,
                  clientName: inv?.clientName || f.clientName,
                  billingProfileCode: inv?.billingProfileCode || f.billingProfileCode,
                }));
              }}
            >
              <option value="">— Select Invoice —</option>
              {invoiceOptions.map((inv) => {
                const cred = creditedByInvoice[String(inv.id)] || 0;
                const rem = Math.max(0, (parseFloat(inv.amount, 10) || 0) - cred);
                return (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} – {inv.clientName} (balance ₹{rem.toLocaleString('en-IN')})
                  </option>
                );
              })}
            </select>
          </label>
          {form.linkedTxnId ? (
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Ledger type for this credit note is taken from the selected invoice ({ledgerClassLabel(ledgerClassFilter)}).
            </div>
          ) : null}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <label style={labelStyle}>
              Amount (₹)
              <input type="number" style={inputStyle} placeholder="Partial or full amount" value={form.amount} onChange={e=>set('amount',e.target.value)} />
            </label>
            <label style={labelStyle}>
              Date
              <DateInput style={inputStyle} value={form.txnDate} onChange={e=>set('txnDate',e.target.value)} />
            </label>
          </div>
          <label style={labelStyle}>
            Narration
            <input type="text" style={inputStyle} placeholder="Reason for credit note" value={form.narration} onChange={e=>set('narration',e.target.value)} />
          </label>
          <label style={labelStyle}>
            Billing Profile
            <BillingProfileSelect
              style={inputStyle}
              value={form.billingProfileCode}
              onChange={(code) => set('billingProfileCode', code)}
            />
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

function buildOpeningProfileRows(existingBalances, ledgerClass) {
  const lc = normalizeLedgerClassForApi(ledgerClass);
  return getBillingProfiles().map((p) => {
    const feesBal = existingBalances.find(
      (b) =>
        b.billingProfileCode === p.code
        && b.ledgerClass === lc
        && b.ledgerMovementKind === 'fees',
    );
    const reimBal = existingBalances.find(
      (b) =>
        b.billingProfileCode === p.code
        && b.ledgerClass === lc
        && b.ledgerMovementKind === 'reimbursement',
    );
    return {
      profileCode: p.code,
      profileName: p.name,
      feesAmount:  feesBal ? String(feesBal.amount) : '',
      feesType:    feesBal ? feesBal.type : 'debit',
      reimAmount:  reimBal ? String(reimBal.amount) : '',
      reimType:    reimBal ? reimBal.type : 'debit',
    };
  });
}

function signedOpeningSlice(amountStr, drCr) {
  if (amountStr === '' || amountStr == null) return 0;
  const a = parseFloat(amountStr, 10);
  if (Number.isNaN(a)) return NaN;
  return drCr === 'credit' ? -a : a;
}

function formatNetBalance(net) {
  if (Number.isNaN(net)) return '—';
  if (Math.abs(net) < 0.00001) return '₹0';
  const abs = Math.abs(net).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return net > 0 ? `₹${abs} Dr` : `₹${abs} Cr`;
}

function rowConsolidatedNetNumber(feesAmount, feesType, reimAmount, reimType) {
  const f = signedOpeningSlice(feesAmount, feesType);
  const r = signedOpeningSlice(reimAmount, reimType);
  if (Number.isNaN(f) || Number.isNaN(r)) return NaN;
  return Math.round((f + r) * 100) / 100;
}

function formatConsolidatedNet(feesAmount, feesType, reimAmount, reimType) {
  return formatNetBalance(rowConsolidatedNetNumber(feesAmount, feesType, reimAmount, reimType));
}

/** Earliest txn_date among opening rows for this ledger type (profiles may share one OB date). */
function inferOpeningTxnDate(existingBalances, ledgerClass) {
  const lc = normalizeLedgerClassForApi(ledgerClass);
  const rows = existingBalances.filter((b) => b.ledgerClass === lc);
  const dates = [...new Set(rows.map((r) => r.txnDate).filter(Boolean))].sort();
  return dates.length ? dates[0] : '';
}

function OpeningBalanceModal({
  onClose,
  onSave,
  entityId,
  entityName,
  entityType,
  existingBalances,
}) {
  const rowGrid = {
    display:               'grid',
    gridTemplateColumns:   'minmax(88px,1fr) 92px 72px 92px 72px minmax(88px,1fr)',
    gap:                   8,
    alignItems:            'center',
    marginBottom:          10,
  };

  const [ledgerClassPick, setLedgerClassPick] = useState('regular');
  const [balances, setBalances] = useState(() => buildOpeningProfileRows([], 'regular'));

  useEffect(() => {
    setBalances(buildOpeningProfileRows(existingBalances, ledgerClassPick));
  }, [existingBalances, ledgerClassPick]);

  const openingTotals = useMemo(() => {
    let feesSignedSum = 0;
    let reimSignedSum = 0;
    let consolidatedSum = 0;
    let feesInvalid = false;
    let reimInvalid = false;
    let consolidatedInvalid = false;
    for (const b of balances) {
      const f = signedOpeningSlice(b.feesAmount, b.feesType);
      const r = signedOpeningSlice(b.reimAmount, b.reimType);
      if (Number.isNaN(f)) feesInvalid = true;
      else feesSignedSum += f;
      if (Number.isNaN(r)) reimInvalid = true;
      else reimSignedSum += r;
      const n = rowConsolidatedNetNumber(b.feesAmount, b.feesType, b.reimAmount, b.reimType);
      if (Number.isNaN(n)) {
        consolidatedInvalid = true;
      } else {
        consolidatedSum += n;
      }
    }
    const feesNetRounded = Math.round(feesSignedSum * 100) / 100;
    const reimNetRounded = Math.round(reimSignedSum * 100) / 100;
    const netRounded = Math.round(consolidatedSum * 100) / 100;
    return {
      feesLabel:         feesInvalid ? '—' : formatNetBalance(feesNetRounded),
      reimLabel:         reimInvalid ? '—' : formatNetBalance(reimNetRounded),
      consolidatedLabel: consolidatedInvalid ? '—' : formatNetBalance(netRounded),
    };
  }, [balances]);

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [openingTxnDate, setOpeningTxnDate] = useState(() => inferOpeningTxnDate(existingBalances || [], ledgerClassPick)
    || new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const inferred = inferOpeningTxnDate(existingBalances || [], ledgerClassPick);
    setOpeningTxnDate(inferred || new Date().toISOString().slice(0, 10));
  }, [existingBalances, ledgerClassPick]);

  function setField(idx, key, val) {
    setBalances((prev) => prev.map((b, i) => (i === idx ? { ...b, [key]: val } : b)));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const ops = [];
      const idNum = parseInt(String(entityId), 10);
      const needsTxnDate = balances.some((b) => {
        const f = b.feesAmount === '' ? 0 : parseFloat(b.feesAmount, 10);
        const r = b.reimAmount === '' ? 0 : parseFloat(b.reimAmount, 10);
        return (f > 0 || r > 0);
      });
      if (needsTxnDate && !openingTxnDate) {
        setError('Choose the opening balance date.');
        return;
      }
      for (const b of balances) {
        const feesAmt = b.feesAmount === '' ? 0 : parseFloat(b.feesAmount, 10);
        const reimAmt = b.reimAmount === '' ? 0 : parseFloat(b.reimAmount, 10);
        if (Number.isNaN(feesAmt) || Number.isNaN(reimAmt)) {
          setError('Enter valid amounts or leave fields blank to clear.');
          return;
        }
        if (feesAmt < 0 || reimAmt < 0) {
          setError('Amounts cannot be negative.');
          return;
        }
        const sliceBase = {
          billing_profile_code: b.profileCode,
          ledger_class:         normalizeLedgerClassForApi(ledgerClassPick),
        };
        if (entityType === 'organization') {
          sliceBase.organization_id = idNum;
        } else {
          sliceBase.client_id = idNum;
        }
        const datePart = openingTxnDate && needsTxnDate ? { txn_date: openingTxnDate } : {};
        ops.push(
          setOpeningBalance({
            ...sliceBase,
            ...datePart,
            amount:                 feesAmt,
            type:                   b.feesType,
            ledger_movement_kind:   'fees',
          }),
        );
        ops.push(
          setOpeningBalance({
            ...sliceBase,
            ...datePart,
            amount:                 reimAmt,
            type:                   b.reimType,
            ledger_movement_kind:   'reimbursement',
          }),
        );
      }
      const results = await Promise.allSettled(ops);
      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        setError(failures.map((f) => f.reason?.message || 'Unknown error').join('; '));
      } else {
        onSave();
        onClose();
      }
    } catch (e) {
      setError(e.message || 'Failed to save opening balances.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, minWidth: 700, maxWidth: 900 }}>
        <div style={modalHeaderStyle}>
          <span style={{ fontSize:15, fontWeight:700 }}>📖 Opening Balances — {entityName}</span>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ padding:'16px 24px' }}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:12, alignItems:'center', marginBottom:12 }}>
            <label style={{ fontSize:12, color:'#475569', display:'flex', alignItems:'center', gap:8 }}>
              Ledger type
              <select
                style={{ ...inputStyle, minWidth:140 }}
                value={ledgerClassPick}
                onChange={(e) => setLedgerClassPick(e.target.value)}
              >
                {LEDGER_CLASS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize:12, color:'#475569', display:'flex', alignItems:'center', gap:8 }}>
              As of date
              <input
                type="date"
                value={openingTxnDate}
                onChange={(e) => setOpeningTxnDate(e.target.value)}
                style={{ ...inputStyle, minWidth:160 }}
              />
            </label>
          </div>
          <p style={{ fontSize:12, color:'#64748b', margin:'0 0 12px 0' }}>
            Enter professional fees and taxes / reimbursement separately. The consolidated column shows net Dr/Cr (Dr = client owes you).
            Zero or blank clears that slice for the selected ledger type. Switch ledger type above to edit Regular, Memorandum, or Optional opening balances separately.
          </p>
          <div style={{ ...rowGrid, marginBottom:8, paddingBottom:6, borderBottom:'1px solid #e2e8f0' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#64748b' }}>Profile</div>
            <div style={{ fontSize:11, fontWeight:700, color:'#64748b', textAlign:'right' }}>Prof. fees ₹</div>
            <div style={{ fontSize:11, fontWeight:700, color:'#64748b' }}>Dr/Cr</div>
            <div style={{ fontSize:11, fontWeight:700, color:'#64748b', textAlign:'right' }}>Tax / reimb. ₹</div>
            <div style={{ fontSize:11, fontWeight:700, color:'#64748b' }}>Dr/Cr</div>
            <div style={{ fontSize:11, fontWeight:700, color:'#64748b', textAlign:'center' }}>Consolidated</div>
          </div>
          {balances.map((b, idx) => (
            <div key={b.profileCode} style={rowGrid}>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'#475569' }}>{b.profileCode}</div>
                <div style={{ fontSize:11, color:'#94a3b8' }}>{b.profileName}</div>
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={b.feesAmount}
                onChange={(e) => setField(idx, 'feesAmount', e.target.value)}
                style={{ ...inputStyle, textAlign:'right' }}
              />
              <select
                value={b.feesType}
                onChange={(e) => setField(idx, 'feesType', e.target.value)}
                style={inputStyle}
              >
                <option value="debit">Dr</option>
                <option value="credit">Cr</option>
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={b.reimAmount}
                onChange={(e) => setField(idx, 'reimAmount', e.target.value)}
                style={{ ...inputStyle, textAlign:'right' }}
              />
              <select
                value={b.reimType}
                onChange={(e) => setField(idx, 'reimType', e.target.value)}
                style={inputStyle}
              >
                <option value="debit">Dr</option>
                <option value="credit">Cr</option>
              </select>
              <div style={{ fontSize:12, fontWeight:600, textAlign:'center', color:'#0f172a' }}>
                {formatConsolidatedNet(b.feesAmount, b.feesType, b.reimAmount, b.reimType)}
              </div>
            </div>
          ))}
          <div
            style={{
              ...rowGrid,
              marginTop:   4,
              paddingTop:  10,
              borderTop:   '1px solid #e2e8f0',
            }}
          >
            <div style={{ fontSize:12, fontWeight:700, color:'#0f172a' }}>Total</div>
            <div style={{ fontSize:12, fontWeight:600, textAlign:'right', color:'#0f172a' }}>
              {openingTotals.feesLabel}
            </div>
            <div style={{ fontSize:12, color:'#94a3b8' }}>—</div>
            <div style={{ fontSize:12, fontWeight:600, textAlign:'right', color:'#0f172a' }}>
              {openingTotals.reimLabel}
            </div>
            <div style={{ fontSize:12, color:'#94a3b8' }}>—</div>
            <div style={{ fontSize:12, fontWeight:600, textAlign:'center', color:'#0f172a' }}>
              {openingTotals.consolidatedLabel}
            </div>
          </div>
          {error && <div style={{ color:'#dc2626', fontSize:12, marginTop:8 }}>{error}</div>}
        </div>
        <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'flex-end', gap:10 }}>
          <button type="button" onClick={onClose} style={btnSecondary} disabled={saving}>Cancel</button>
          <button type="button" onClick={handleSave} style={btnPrimary} disabled={saving}>
            {saving ? 'Saving…' : '💾 Save opening balances'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Invoices page ────────────────────────────────────────────────────────

export default function Invoices() {
  const { hasPermission } = useAuth();
  const canEditInvoice = hasPermission('invoices.edit');
  const canDeleteInvoice = hasPermission('invoices.delete');
  const canCreateInvoice = hasPermission('invoices.create');
  const canBillingClosure = hasPermission('services.edit') || hasPermission('invoices.edit');
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
    return t || 'invoices';
  });

  useEffect(() => {
    const t = searchParams.get('tab');
    if (!t) return;
    const allowed = ['invoices', 'receipts', 'payments', 'tds', 'rebate', 'credit_note', 'ledger', 'bill_settlement', 'service_billing'];
    if (allowed.includes(t)) setTab(t);
  }, [searchParams]);

  // ── Invoice tab state ───────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter]         = useState('all');
  const [showRaiseInvoice, setShowRaiseInvoice] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [selectedInvoice, setSelectedInvoice]   = useState(null);
  const [viewInvoiceTxn, setViewInvoiceTxn]     = useState(null);
  const [editInvoiceId, setEditInvoiceId]       = useState(null);
  const [editLedgerTxnId, setEditLedgerTxnId]   = useState(null);
  const [ledgerDeletePrompt, setLedgerDeletePrompt] = useState(null);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const [invoices, setInvoices]                 = useState([]);
  const [invLoading, setInvLoading]             = useState(true);

  // ── Receipts tab state ──────────────────────────────────────────────────────
  const [receipts, setReceipts]         = useState([]);
  const [recLoading, setRecLoading]     = useState(false);
  const [recLoaded, setRecLoaded]       = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedReceiptIds, setSelectedReceiptIds] = useState([]);

  // ── Payments (on behalf) tab state ─────────────────────────────────────────
  const [paymentExpenses, setPaymentExpenses] = useState([]);
  const [payLoading, setPayLoading] = useState(false);
  const [paymentsFilterByLedger, setPaymentsFilterByLedger] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState([]);

  // ── TDS tab state ───────────────────────────────────────────────────────────
  const [tdsFilter, setTdsFilter]       = useState('all');
  const [tdsEntries, setTdsEntries]     = useState([]);
  const [tdsLoading, setTdsLoading]     = useState(false);
  const [selectedTds, setSelectedTds]   = useState([]);
  const [selectedTdsDeleteIds, setSelectedTdsDeleteIds] = useState([]);
  const [showTdsModal, setShowTdsModal] = useState(false);
  const [txnAuditModalTxn, setTxnAuditModalTxn] = useState(null);

  // ── Rebate tab state ────────────────────────────────────────────────────────
  const [rebates, setRebates]               = useState([]);
  const [rebLoading, setRebLoading]         = useState(false);
  const [rebLoaded, setRebLoaded]           = useState(false);
  const [showRebateModal, setShowRebateModal] = useState(false);
  const [selectedRebateIds, setSelectedRebateIds] = useState([]);

  // ── Credit Note tab state ───────────────────────────────────────────────────
  const [creditNotes, setCreditNotes]     = useState([]);
  const [cnLoading, setCnLoading]         = useState(false);
  const [cnLoaded, setCnLoaded]           = useState(false);
  const [showCnModal, setShowCnModal]     = useState(false);
  const [selectedCreditNoteIds, setSelectedCreditNoteIds] = useState([]);
  const [txnListSearchQuery, setTxnListSearchQuery] = useState('');

  // ── Ledger tab state ────────────────────────────────────────────────────────
  const [ledgerClientId, setLedgerClientId]       = useState('');
  const [billReport, setBillReport]               = useState(null);
  const [billLoading, setBillLoading]             = useState(false);
  const [ledgerClientName, setLedgerClientName]   = useState('');
  const [ledgerEntityType, setLedgerEntityType]   = useState('contact');
  const [ledger, setLedger]                       = useState([]);
  const [ledgerLoading, setLedgerLoading]       = useState(false);
  const [openingBalances, setOpeningBalances]   = useState([]);
  const [showOpeningModal, setShowOpeningModal] = useState(false);
  const [ledgerFyStartYear, setLedgerFyStartYear] = useState(null);
  const [ledgerFilterDateFrom, setLedgerFilterDateFrom] = useState('');
  const [ledgerFilterDateTo, setLedgerFilterDateTo]     = useState('');
  const [ledgerLedgerClass, setLedgerLedgerClass] = useState('regular');
  const [ledgerLedgerView, setLedgerLedgerView] = useState('consolidated');
  const [ledgerReconcileModalOpen, setLedgerReconcileModalOpen] = useState(false);
  const [ledgerReconcileLoading, setLedgerReconcileLoading] = useState(false);
  const [ledgerReconcilePayload, setLedgerReconcilePayload] = useState(null);
  const [ledgerReconcileError, setLedgerReconcileError] = useState('');

  const paymentExpenseFetchParams = useMemo(() => {
    const params = { txnType: 'payment_expense', perPage: 100 };
    if (paymentsFilterByLedger && ledgerClientId) {
      if (ledgerEntityType === 'organization') {
        params.organizationId = ledgerClientId;
      } else {
        params.clientId = ledgerClientId;
      }
      params.ledgerClass = normalizeLedgerClassForApi(ledgerLedgerClass);
    }
    return params;
  }, [paymentsFilterByLedger, ledgerClientId, ledgerEntityType, ledgerLedgerClass]);

  function openLedgerFromPaymentExpense(p) {
    const orgRaw = p.organizationId != null && p.organizationId !== '' ? parseInt(String(p.organizationId), 10) : 0;
    const cidRaw = p.clientId != null && p.clientId !== '' ? parseInt(String(p.clientId), 10) : 0;
    if (orgRaw > 0) {
      setLedgerEntityType('organization');
      setLedgerClientId(String(orgRaw));
    } else if (cidRaw > 0) {
      setLedgerEntityType('contact');
      setLedgerClientId(String(cidRaw));
    }
    setLedgerClientName(p.clientName || '');
    setLedgerLedgerClass(normalizeLedgerClassForApi(p.ledgerClass));
    const mk = p.ledgerMovementKind;
    if (mk === 'reimbursement') setLedgerLedgerView('reimbursement');
    else if (mk === 'fees') setLedgerLedgerView('fees');
    else setLedgerLedgerView('consolidated');
    setTab('ledger');
  }

  // ── Service billing tab ─────────────────────────────────────────────────────
  const [billingCompletion, setBillingCompletion]       = useState('any');
  const [billingClosureFilter, setBillingClosureFilter]   = useState('pending');
  const [billingSearch, setBillingSearch]                 = useState('');
  const [billingPage, setBillingPage]                     = useState(1);
  const [billingRows, setBillingRows]                     = useState([]);
  const [billingLoading, setBillingLoading]               = useState(false);
  const [billingPagination, setBillingPagination]       = useState({ total: 0, last_page: 1 });
  const [raiseInvoicePrefill, setRaiseInvoicePrefill]   = useState(null);
  const [billingHistoryServiceId, setBillingHistoryServiceId] = useState(null);
  const [billingHistoryRows, setBillingHistoryRows]     = useState([]);
  const [billingHistoryLoading, setBillingHistoryLoading] = useState(false);

  function reloadInvoices() {
    setInvLoading(true);
    getTxns({ txnType: 'invoice' })
      .then(({ txns }) => setInvoices(txns))
      .catch(() => {})
      .finally(() => setInvLoading(false));
  }

  // ── Load invoices on mount ──────────────────────────────────────────────────
  useEffect(() => {
    reloadInvoices();
  }, []);

  async function handleRazorpayCollect(inv) {
    try {
      await loadRazorpayScript();
      const order = await createRazorpayOrderForTxn(inv.id);
      openRazorpayCheckout({
        keyId: order.keyId,
        orderId: order.orderId,
        amountPaise: order.amountPaise,
        name: 'Invoice payment',
        description: inv.invoiceNumber || `Invoice #${inv.id}`,
        onSuccess: () => {
          window.alert('Payment submitted. Refreshing list.');
          reloadInvoices();
        },
        onFailure: (err) => window.alert(err.message || 'Payment failed'),
      });
    } catch (e) {
      window.alert(e.message || 'Could not start Razorpay checkout');
    }
  }

  useEffect(() => {
    setTxnListSearchQuery('');
  }, [tab]);

  useEffect(() => {
    const raw = searchParams.get('openTxn');
    if (raw == null || invLoading) return;
    const txn = invoices.find(i => String(i.id) === String(raw));
    if (txn) {
      setTab('invoices');
      setStatusFilter('all');
      setSelectedInvoice(txn);
      setViewInvoiceTxn(txn);
      requestAnimationFrame(() => {
        document.getElementById(`txn-row-${txn.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    }
    const next = new URLSearchParams(searchParams);
    next.delete('openTxn');
    setSearchParams(next, { replace: true });
  }, [searchParams, invLoading, invoices, setSearchParams]);

  // ── Load receipts when receipts tab first opened ────────────────────────────
  useEffect(() => {
    if (tab !== 'receipts' || recLoaded) return;
    setRecLoading(true);
    getTxns({ txnType: 'receipt' })
      .then(({ txns }) => { setReceipts(txns); setRecLoaded(true); })
      .catch(() => {})
      .finally(() => setRecLoading(false));
  }, [tab, recLoaded]);

  // ── Load payment expenses when Payments tab is active (optionally scoped to Ledger entity) ──
  useEffect(() => {
    if (tab !== 'payments') return;
    setPayLoading(true);
    getTxns(paymentExpenseFetchParams)
      .then(({ txns }) => setPaymentExpenses(txns))
      .catch(() => {})
      .finally(() => setPayLoading(false));
  }, [tab, paymentExpenseFetchParams]);

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
    if ((tab !== 'ledger' && tab !== 'bill_settlement') || !ledgerClientId) return;
    setLedgerLoading(true);
    const ledgerParam = ledgerEntityType === 'organization'
      ? {
        organizationId: ledgerClientId,
        ledgerClass:    ledgerLedgerClass,
        ledgerView:     ledgerLedgerView,
      }
      : {
        clientId:    ledgerClientId,
        ledgerClass: ledgerLedgerClass,
        ledgerView:  ledgerLedgerView,
      };
    Promise.all([
      getLedger(ledgerParam).catch(() => []),
      getOpeningBalance(
        ledgerEntityType === 'organization'
          ? { organizationId: ledgerClientId }
          : { clientId: ledgerClientId },
      ).catch(() => []),
    ]).then(([entries, obs]) => {
      setLedger(entries);
      setOpeningBalances(obs);
      setLedgerFyStartYear((prev) => {
        const fys = collectIndianFYStartYearsWithFallback(entries);
        if (prev != null && fys.includes(prev)) return prev;
        return fys[fys.length - 1];
      });
    }).finally(() => setLedgerLoading(false));
  }, [tab, ledgerClientId, ledgerEntityType, ledgerLedgerClass, ledgerLedgerView]);

  useEffect(() => {
    if (tab !== 'bill_settlement' || !ledgerClientId) {
      setBillReport(null);
      return;
    }
    setBillLoading(true);
    const params = {
      ledgerClass: ledgerLedgerClass,
      ledgerView: ledgerLedgerView,
      dateFrom: ledgerFilterDateFrom || undefined,
      dateTo: ledgerFilterDateTo || undefined,
    };
    if (ledgerEntityType === 'organization') {
      params.organizationId = ledgerClientId;
    } else {
      params.clientId = ledgerClientId;
    }
    getBillSettlementReport(params)
      .then((r) => setBillReport(r))
      .catch(() => setBillReport(null))
      .finally(() => setBillLoading(false));
  }, [tab, ledgerClientId, ledgerEntityType, ledgerLedgerClass, ledgerLedgerView, ledgerFilterDateFrom, ledgerFilterDateTo]);

  useEffect(() => {
    setLedgerFilterDateFrom('');
    setLedgerFilterDateTo('');
  }, [ledgerClientId, ledgerLedgerClass, ledgerLedgerView]);

  useEffect(() => {
    setBillingPage(1);
  }, [billingCompletion, billingClosureFilter, billingSearch]);

  useEffect(() => {
    if (tab !== 'service_billing') return undefined;
    setBillingLoading(true);
    getBillingReport({
      page: billingPage,
      perPage: 20,
      completion: billingCompletion,
      closure: billingClosureFilter,
      search: billingSearch,
    })
      .then(({ rows, pagination }) => {
        setBillingRows(rows);
        setBillingPagination(pagination || {});
      })
      .catch(() => setBillingRows([]))
      .finally(() => setBillingLoading(false));
    return undefined;
  }, [tab, billingPage, billingCompletion, billingClosureFilter, billingSearch]);

  useEffect(() => {
    if (!billingHistoryServiceId) {
      setBillingHistoryRows([]);
      return undefined;
    }
    setBillingHistoryLoading(true);
    getServiceBillingInvoices(billingHistoryServiceId)
      .then(setBillingHistoryRows)
      .catch(() => setBillingHistoryRows([]))
      .finally(() => setBillingHistoryLoading(false));
    return undefined;
  }, [billingHistoryServiceId]);

  const ledgerFyOptions = useMemo(
    () => collectIndianFYStartYearsWithFallback(ledger),
    [ledger]
  );

  const ledgerDisplayRows = useMemo(() => {
    if (!ledger.length) return [];
    if (!ledgerFyOptions.length || ledgerFyStartYear == null) {
      return ledger.map((e) => ({ ...e }));
    }
    return buildLedgerRowsForIndianFY(
      ledger,
      ledgerFyStartYear,
      ledgerFilterDateFrom,
      ledgerFilterDateTo
    );
  }, [ledger, ledgerFyOptions, ledgerFyStartYear, ledgerFilterDateFrom, ledgerFilterDateTo]);

  // ── Summary cards ───────────────────────────────────────────────────────────
  const totalBilled    = invoices.reduce((a, i) => a + (i.amount || i.debit || 0), 0);
  const totalCollected = receipts.reduce(
    (a, r) => a + signedLedgerTxnAmount(r.txnType, r.amount || r.credit || 0),
    0,
  );
  const outstanding    = totalBilled - totalCollected;
  const tdsPending     = tdsEntries.filter(t => t.tdsStatus === 'provisional').reduce((a, t) => a + t.amount, 0);

  const filteredInvoices = invoices.filter(i =>
    statusFilter === 'all' || i.invoiceStatus === statusFilter || i.status === statusFilter
  );

  const visibleInvoices = useMemo(() => {
    if (!txnListSearchQuery.trim()) return filteredInvoices;
    const q = txnListSearchQuery;
    return filteredInvoices.filter((i) => txnFieldsIncludeQuery(q, [
      i.invoiceNumber,
      i.id,
      i.clientName,
      i.txnDate,
      i.invoiceDate,
      i.dueDate,
      i.invoiceStatus,
      i.status,
      i.billingProfileCode,
      i.notes,
      i.amount,
      i.debit,
    ]));
  }, [filteredInvoices, txnListSearchQuery]);

  const visibleReceipts = useMemo(() => {
    if (!txnListSearchQuery.trim()) return receipts;
    const q = txnListSearchQuery;
    return receipts.filter((r) => txnFieldsIncludeQuery(q, [
      r.publicRef,
      r.id,
      r.clientName,
      r.txnDate,
      r.paymentMethod,
      r.referenceNumber,
      r.billingProfileCode,
      r.linkedTxnId,
      r.notes,
      formatSignedInrAmount(r.txnType, r.amount || r.credit || 0),
    ]));
  }, [receipts, txnListSearchQuery]);

  const visiblePaymentExpenses = useMemo(() => {
    if (!txnListSearchQuery.trim()) return paymentExpenses;
    const q = txnListSearchQuery;
    return paymentExpenses.filter((p) => txnFieldsIncludeQuery(q, [
      p.publicRef,
      p.id,
      p.clientName,
      paymentExpenseBookedOnLabel(p),
      p.txnDate,
      p.paymentMethod,
      p.referenceNumber,
      p.narration,
      p.notes,
      p.billingProfileCode,
      p.paidFrom,
      p.expensePurpose,
      expensePurposeLabel(p.expensePurpose),
      ledgerClassLabel(p.ledgerClass),
      p.ledgerMovementKind,
      formatSignedInrAmount(p.txnType, p.amount || 0),
    ]));
  }, [paymentExpenses, txnListSearchQuery]);

  const visibleTdsEntries = useMemo(() => {
    if (!txnListSearchQuery.trim()) return tdsEntries;
    const q = txnListSearchQuery;
    return tdsEntries.filter((t) => txnFieldsIncludeQuery(q, [
      t.id,
      t.clientName,
      t.txnDate,
      t.tdsSection,
      t.tdsRate,
      t.tdsStatus,
      t.txnType,
      t.billingProfileCode,
      formatSignedInrAmount(t.txnType, t.amount || 0),
    ]));
  }, [tdsEntries, txnListSearchQuery]);

  const visibleRebates = useMemo(() => {
    if (!txnListSearchQuery.trim()) return rebates;
    const q = txnListSearchQuery;
    return rebates.filter((r) => txnFieldsIncludeQuery(q, [
      r.id,
      r.clientName,
      r.txnDate,
      r.narration,
      r.notes,
      r.billingProfileCode,
      r.amount,
    ]));
  }, [rebates, txnListSearchQuery]);

  const visibleCreditNotes = useMemo(() => {
    if (!txnListSearchQuery.trim()) return creditNotes;
    const q = txnListSearchQuery;
    return creditNotes.filter((c) => txnFieldsIncludeQuery(q, [
      c.id,
      c.clientName,
      c.txnDate,
      c.linkedTxnId,
      c.narration,
      c.billingProfileCode,
      c.amount,
    ]));
  }, [creditNotes, txnListSearchQuery]);

  // ── Invoice handlers ────────────────────────────────────────────────────────
  function handleRaiseInvoice(data) {
    const idNum = parseInt(data.entityId, 10);
    if (Number.isNaN(idNum) || idNum <= 0) return;
    const lineItems = (data.lineItems || []).map((l) => {
      const row = {
        description: String(l.description || '').trim(),
        amount: typeof l.amount === 'number' ? l.amount : parseFloat(l.amount, 10),
      };
      if (l.line_kind) row.line_kind = l.line_kind;
      if (l.engagement_type_id != null) row.engagement_type_id = l.engagement_type_id;
      return row;
    }).filter((l) => l.description && Number.isFinite(l.amount) && l.amount > 0);
    if (lineItems.length === 0) return;
    const profile = getBillingProfileByCode(data.billingProfileCode);
    const subtotal = lineItems.reduce((a, l) => a + l.amount, 0);
    const payload = {
      txn_type:             'invoice',
      txn_date:             data.invoiceDate,
      due_date:             data.dueDate || null,
      amount:               subtotal,
      billing_profile_code: data.billingProfileCode,
      notes:                data.notes,
      line_items:           lineItems,
      billing_gst_registered: Boolean(profile?.gstRegistered),
      billing_supplier_state_code: profile?.gstRegistered ? (profile.stateCode || stateCodeFromGstin(profile.gstin) || null) : null,
      billing_supplier_gstin: profile?.gstRegistered ? (profile.gstin || null) : null,
      default_gst_rate_percent: profile?.defaultGstRate ?? 18,
    };
    const sid = parseInt(data.serviceEngagementId, 10);
    if (Number.isInteger(sid) && sid > 0) {
      payload.service_id = sid;
    }
    if (data.entityType === 'organization') {
      payload.organization_id = idNum;
    } else {
      payload.client_id = idNum;
    }
    payload.ledger_class = normalizeLedgerClassForApi(data.ledgerClass);
    payload.invoice_cost_analysis_confirm = Boolean(data.invoiceCostAnalysisConfirm);
    createTxn(payload)
      .then((newInv) => {
        setInvoices((prev) => [newInv, ...prev]);
        if (tab === 'service_billing') {
          getBillingReport({
            page: billingPage,
            perPage: 20,
            completion: billingCompletion,
            closure: billingClosureFilter,
            search: billingSearch,
          })
            .then(({ rows, pagination }) => {
              setBillingRows(rows);
              setBillingPagination(pagination || {});
            })
            .catch(() => {});
        }
      })
      .catch((err) => {
        const d = err?.apiData;
        if (d?.code === 'invoice_cost_analysis_confirm_required') {
          const lines = (d.violations || []).map((v) => `• ${v.message}`).join('\n');
          window.alert(
            `${err.message}\n\n${lines}\n\nIf you are Accounts or Super Admin, open Raise Invoice, tick the confirmation box, and submit again.`
          );
          return;
        }
        window.alert(err?.message || 'Could not create invoice.');
      });
  }

  function handleRecordPayment(data) {
    if (!selectedInvoice) return;
    const receiptBody = {
      amount:               parseFloat(data.amount),
      txn_date:             data.paymentDate,
      payment_method:       data.method,
      reference_number:     data.reference,
      billing_profile_code: data.billingProfileCode,
      firm_bank_account_id: parseInt(data.firmBankAccountId, 10),
      ledger_class:         normalizeLedgerClassForApi(data.ledgerClass),
      ledger_movement_kind: data.ledgerMovementKind === 'reimbursement' ? 'reimbursement' : 'fees',
      allocations: [{
        target_type:     'invoice',
        target_txn_id:   selectedInvoice.id,
        amount:          parseFloat(data.amount),
      }],
    };
    if (selectedInvoice.organizationId) {
      receiptBody.organization_id = selectedInvoice.organizationId;
    } else {
      receiptBody.client_id = selectedInvoice.clientId;
    }
    createReceipt(receiptBody)
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

  function handleSavePaymentExpense(data) {
    const idNum = parseInt(data.entityId, 10);
    if (Number.isNaN(idNum) || idNum <= 0) return;
    const purposeLabel = expensePurposeLabel(data.expensePurpose);
    const narration = data.description.trim()
      ? `${purposeLabel} — ${data.description.trim()}`
      : purposeLabel;
    const lines = (data.settlementLines || []).map((l) => ({
      target_type: l.targetType,
      target_txn_id: l.targetType === 'receipt' ? (parseInt(l.targetTxnId, 10) || 0) : undefined,
      amount: parseFloat(l.amount) || 0,
    })).filter((l) => l.amount > 0);
    if (lines.length === 0) {
      window.alert('Add settlement lines that sum to the payment amount.');
      return;
    }
    const payAmt = parseFloat(data.amount);
    const sum = lines.reduce((s, l) => s + l.amount, 0);
    if (Math.abs(sum - payAmt) > 0.02) {
      window.alert(`Settlement lines must sum to the payment amount (₹${payAmt.toFixed(2)}).`);
      return;
    }
    for (const l of lines) {
      if (l.target_type === 'receipt' && (!l.target_txn_id || l.target_txn_id <= 0)) {
        window.alert('Select a client receipt for each receipt line, or use Unallocated advance.');
        return;
      }
    }
    const settlement_lines = lines.map((l) => (
      l.target_type === 'receipt'
        ? { target_type: 'receipt', target_txn_id: l.target_txn_id, amount: l.amount }
        : { target_type: 'unallocated_advance', amount: l.amount }
    ));
    const payload = {
      amount: payAmt,
      txn_date: data.txnDate,
      payment_method: data.method,
      reference_number: data.referenceNumber || null,
      billing_profile_code: data.billingProfileCode || null,
      firm_bank_account_id: parseInt(data.firmBankAccountId, 10),
      expense_purpose: data.expensePurpose || null,
      narration,
      notes: data.notes || null,
      ledger_class: normalizeLedgerClassForApi(data.ledgerClass),
      ledger_movement_kind: data.ledgerMovementKind === 'reimbursement' ? 'reimbursement' : 'fees',
      settlement_lines,
    };
    if (data.entityType === 'organization') {
      payload.organization_id = idNum;
    } else {
      payload.client_id = idNum;
    }
    createPaymentExpense(payload)
      .then(() => getTxns(paymentExpenseFetchParams).then(({ txns }) => setPaymentExpenses(txns)))
      .catch((err) => {
        window.alert(err?.message || 'Could not save payment on behalf.');
      });
  }

  function handleSaveReceipt(data) {
    const idNum = parseInt(data.entityId, 10);
    if (!idNum) return;
    const payload = {
      amount:               parseFloat(data.amount),
      txn_date:             data.txnDate,
      payment_method:       data.method,
      reference_number:     data.referenceNumber,
      billing_profile_code: data.billingProfileCode,
      firm_bank_account_id: parseInt(data.firmBankAccountId, 10),
      notes:                data.notes,
      ledger_class:         normalizeLedgerClassForApi(data.ledgerClass),
      ledger_movement_kind: data.ledgerMovementKind === 'reimbursement' ? 'reimbursement' : 'fees',
      allocations:          data.allocations,
    };
    if (data.entityType === 'organization') {
      payload.organization_id = idNum;
    } else {
      payload.client_id = idNum;
    }
    createReceipt(payload)
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
      ledger_class:         normalizeLedgerClassForApi(data.ledgerClass),
      ledger_movement_kind: data.ledgerMovementKind === 'reimbursement' ? 'reimbursement' : 'fees',
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
      ledger_class:         normalizeLedgerClassForApi(data.ledgerClass),
      ledger_movement_kind: data.ledgerMovementKind === 'reimbursement' ? 'reimbursement' : 'fees',
    })
      .then(reb => setRebates(prev => [reb, ...prev]))
      .catch(() => {});
  }

  function handleSaveCreditNote(data) {
    const inv = invoices.find((i) => String(i.id) === String(data.linkedTxnId));
    if (!inv) {
      window.alert('Invoice not found.');
      return;
    }
    const cred = creditNotes
      .filter((c) => String(c.linkedTxnId) === String(inv.id))
      .reduce((s, c) => s + (parseFloat(c.amount, 10) || 0), 0);
    const remaining = (parseFloat(inv.amount, 10) || 0) - cred;
    const amt = parseFloat(data.amount, 10);
    if (amt > remaining + 0.0001) {
      window.alert(`Amount exceeds remaining creditable balance (₹${remaining.toLocaleString('en-IN')}).`);
      return;
    }
    const payload = {
      amount:               amt,
      txn_date:             data.txnDate,
      linked_txn_id:        parseInt(data.linkedTxnId, 10),
      narration:            data.narration,
      billing_profile_code: data.billingProfileCode || inv.billingProfileCode,
      notes:                data.notes,
    };
    if (inv.organizationId) {
      payload.organization_id = inv.organizationId;
    } else {
      payload.client_id = inv.clientId || data.clientId;
    }
    createCreditNote(payload)
      .then(cn => setCreditNotes(prev => [cn, ...prev]))
      .catch((err) => { window.alert(err?.message || 'Could not create credit note.'); });
  }

  function loadLedgerReconciliation() {
    if (!ledgerClientId) return;
    setLedgerReconcileLoading(true);
    setLedgerReconcileError('');
    setLedgerReconcilePayload(null);
    const req = ledgerEntityType === 'organization'
      ? { organizationId: ledgerClientId, ledgerClass: ledgerLedgerClass }
      : { clientId: ledgerClientId, ledgerClass: ledgerLedgerClass };
    getLedgerReconciliation(req)
      .then((data) => setLedgerReconcilePayload(data))
      .catch((e) => setLedgerReconcileError(e?.message || 'Could not load reconciliation.'))
      .finally(() => setLedgerReconcileLoading(false));
  }

  function handleOpeningBalanceSaved() {
    if (ledgerClientId) {
      const ledgerParam = ledgerEntityType === 'organization'
        ? {
          organizationId: ledgerClientId,
          ledgerClass:    ledgerLedgerClass,
          ledgerView:     ledgerLedgerView,
        }
        : {
          clientId:    ledgerClientId,
          ledgerClass: ledgerLedgerClass,
          ledgerView:  ledgerLedgerView,
        };
      Promise.all([
        getLedger(ledgerParam).catch(() => []),
        getOpeningBalance(
          ledgerEntityType === 'organization'
            ? { organizationId: ledgerClientId }
            : { clientId: ledgerClientId },
        ).catch(() => []),
      ]).then(([entries, obs]) => {
        setLedger(entries);
        setOpeningBalances(obs);
        setLedgerFyStartYear((prev) => {
          const fys = collectIndianFYStartYearsWithFallback(entries);
          if (prev != null && fys.includes(prev)) return prev;
          return fys[fys.length - 1];
        });
      });
    }
  }

  function toggleTdsSelect(id) {
    setSelectedTds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function toggleTdsDeleteSelect(id) {
    setSelectedTdsDeleteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleLedgerDeleted(deletedIds) {
    const idSet = new Set((deletedIds || []).map((x) => String(x)));
    setInvoices((prev) => prev.filter((x) => !idSet.has(String(x.id))));
    setReceipts((prev) => prev.filter((x) => !idSet.has(String(x.id))));
    setPaymentExpenses((prev) => prev.filter((x) => !idSet.has(String(x.id))));
    setTdsEntries((prev) => prev.filter((x) => !idSet.has(String(x.id))));
    setRebates((prev) => prev.filter((x) => !idSet.has(String(x.id))));
    setCreditNotes((prev) => prev.filter((x) => !idSet.has(String(x.id))));
    setSelectedInvoiceIds([]);
    setSelectedReceiptIds([]);
    setSelectedPaymentIds([]);
    setSelectedTds([]);
    setSelectedTdsDeleteIds([]);
    setSelectedRebateIds([]);
    setSelectedCreditNoteIds([]);
  }

  function refreshBillingReport() {
    getBillingReport({
      page: billingPage,
      perPage: 20,
      completion: billingCompletion,
      closure: billingClosureFilter,
      search: billingSearch,
    })
      .then(({ rows, pagination }) => {
        setBillingRows(rows);
        setBillingPagination(pagination || {});
      })
      .catch(() => {});
  }

  function billingPrefillFromRow(row) {
    const oid = row.organizationId && Number(row.organizationId) > 0;
    const cid = row.clientId && Number(row.clientId) > 0;
    if (oid) {
      return {
        entityId: row.organizationId,
        entityName: row.clientName,
        entityType: 'organization',
        serviceEngagementId: row.id,
      };
    }
    if (cid) {
      return {
        entityId: row.clientId,
        entityName: row.clientName,
        entityType: 'contact',
        serviceEngagementId: row.id,
      };
    }
    return {
      entityId: '',
      entityName: row.clientName || '',
      entityType: 'contact',
      serviceEngagementId: row.id,
    };
  }

  function handleBillingMarkBuilt(row) {
    if (!canBillingClosure) return;
    if (!window.confirm(`Mark engagement #${row.id} as billed? It will leave the pending billing queue.`)) return;
    patchBillingClosure(row.id, { closure: 'built' })
      .then((res) => {
        const m = res?.billing_time_metrics;
        if (m?.is_below_planned) {
          const inv = Number(m.invoiced_subtotal ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const plan = Number(m.planned_value_at_user_rates ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const bh = Number(m.billable_hours ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const avg = m.avg_achieved_rate_per_hour != null
            ? `₹${Number(m.avg_achieved_rate_per_hour).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/hr`
            : '—';
          window.alert(
            `Billing benchmark (informational)\n\n` +
            `Invoiced subtotal: ₹${inv}\n` +
            `Value at team planned rates (billable hours × each user’s ₹/hr): ₹${plan}\n` +
            `Billable hours: ${bh}\n` +
            `Achieved effective rate: ${avg}\n\n` +
            `Invoiced amount is below the planned-rate benchmark. You can still proceed; this is for awareness only.`,
          );
        }
        refreshBillingReport();
      })
      .catch((e) => window.alert(e?.message || 'Could not update.'));
  }

  function handleBillingNonBillable(row) {
    if (!canBillingClosure) return;
    const reason = window.prompt('Optional reason (non-billable):', '');
    if (reason === null) return;
    patchBillingClosure(row.id, { closure: 'non_billable', reason })
      .then(() => refreshBillingReport())
      .catch((e) => window.alert(e?.message || 'Could not update.'));
  }

  const TABS = [
    { key:'invoices',    label:'🧾 Invoices' },
    { key:'receipts',    label:'💵 Receipts' },
    { key:'payments',    label:'💳 Payments (on behalf)' },
    { key:'tds',         label:'📋 TDS' },
    { key:'rebate',      label:'💸 Rebate/Discount' },
    { key:'credit_note', label:'📝 Credit Notes' },
    { key:'ledger',      label:'📒 Ledger' },
    { key:'bill_settlement', label:'📑 Bill by bill' },
    { key:'service_billing', label:'📋 Service billing' },
  ];

  return (
    <div style={{ padding:24 }}>
      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showRaiseInvoice && (
        <RaiseInvoiceModal
          open={showRaiseInvoice}
          prefill={raiseInvoicePrefill}
          onClose={() => { setShowRaiseInvoice(false); setRaiseInvoicePrefill(null); }}
          onSave={(data) => {
            handleRaiseInvoice(data);
            setShowRaiseInvoice(false);
            setRaiseInvoicePrefill(null);
          }}
        />
      )}
      {billingHistoryServiceId != null && (
        <div style={overlayStyle} role="presentation" onClick={() => setBillingHistoryServiceId(null)}>
          <div
            role="dialog"
            aria-modal="true"
            style={{ ...modalStyle, maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={modalHeaderStyle}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>Invoice history (service #{billingHistoryServiceId})</span>
              <button type="button" onClick={() => setBillingHistoryServiceId(null)} style={closeBtnStyle}>✕</button>
            </div>
            <div style={{ padding: '16px 24px 24px' }}>
              {billingHistoryLoading ? (
                <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div>
              ) : billingHistoryRows.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: 13 }}>No invoice transactions linked to this engagement.</div>
              ) : (
                <table style={{ ...tableStyle, fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Invoice #', 'Date', 'Subtotal', 'Status'].map((h) => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {billingHistoryRows.map((t) => (
                      <tr key={t.id} style={trStyle}>
                        <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{t.invoiceNumber || `INV-${t.id}`}</td>
                        <td style={tdStyle}>{t.txnDate || '—'}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>₹{t.subtotal.toLocaleString('en-IN')}</td>
                        <td style={tdStyle}>{t.invoiceStatus || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
      {viewInvoiceTxn && (
        <InvoiceViewModal
          txn={viewInvoiceTxn}
          onClose={() => setViewInvoiceTxn(null)}
          canEditInvoice={canEditInvoice}
          canDeleteInvoice={canDeleteInvoice}
          onEdit={(t) => { setViewInvoiceTxn(null); setEditInvoiceId(t.id); }}
          onDelete={(t) => {
            setViewInvoiceTxn(null);
            setLedgerDeletePrompt({
              title: 'Delete invoice',
              items: [{ id: t.id, label: `${t.invoiceNumber || `INV-${t.id}`} — ${t.clientName}` }],
            });
          }}
        />
      )}
      {editInvoiceId != null && (
        <EditInvoiceModal
          invoiceId={editInvoiceId}
          onClose={() => setEditInvoiceId(null)}
          onSaved={(row) => {
            setInvoices((prev) => prev.map((x) => (String(x.id) === String(row.id) ? row : x)));
          }}
        />
      )}
      {editLedgerTxnId != null && (
        <EditLedgerTxnModal
          txnId={editLedgerTxnId}
          onClose={() => setEditLedgerTxnId(null)}
          onSaved={(row) => {
            const tt = row.txnType;
            if (tt === 'receipt' || tt === 'receipt_reversal') {
              getTxns({ txnType: 'receipt' }).then(({ txns }) => setReceipts(txns));
            } else if (tt === 'payment_expense' || tt === 'payment_expense_reversal') {
              getTxns(paymentExpenseFetchParams).then(({ txns }) => setPaymentExpenses(txns));
            } else if (tt === 'tds_provisional' || tt === 'tds_final' || tt === 'tds_reversal') {
              const params = tdsFilter === 'all' ? {} : { tdsStatus: tdsFilter };
              getTdsEntries(params).then(setTdsEntries);
            }
          }}
        />
      )}
      {ledgerDeletePrompt && (
        <LedgerDeleteModal
          title={ledgerDeletePrompt.title}
          items={ledgerDeletePrompt.items}
          onClose={() => setLedgerDeletePrompt(null)}
          onDeleted={handleLedgerDeleted}
        />
      )}
      {txnAuditModalTxn && (
        <TxnAuditLogModal key={txnAuditModalTxn.id} txn={txnAuditModalTxn} onClose={() => setTxnAuditModalTxn(null)} />
      )}
      {ledgerReconcileModalOpen && (
        <div
          style={{ ...overlayStyle, zIndex: 1100 }}
          role="presentation"
          onClick={() => !ledgerReconcileLoading && setLedgerReconcileModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ledger-reconcile-title"
            style={{
              background: '#fff',
              borderRadius: 12,
              maxWidth: 720,
              width: '92vw',
              maxHeight: '85vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ ...modalHeaderStyle, flexShrink: 0 }}>
              <span id="ledger-reconcile-title" style={{ fontWeight: 700, fontSize: 16 }}>Ledger reconciliation</span>
              <button
                type="button"
                style={closeBtnStyle}
                disabled={ledgerReconcileLoading}
                onClick={() => setLedgerReconcileModalOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div style={{ padding: 16, overflow: 'auto', fontSize: 12 }}>
              <p style={{ margin: '0 0 12px', color: '#64748b' }}>
                Raw <code style={{ fontSize: 11 }}>txn</code> counts for this entity and ledger class versus row counts after the same presentation logic as GET{' '}
                <code style={{ fontSize: 11 }}>/api/admin/txn/ledger</code>.
                Use this to verify types such as <code style={{ fontSize: 11 }}>payment_expense</code>, receipts, and rebates are present before FY/date UI folding.
              </p>
              <button
                type="button"
                style={{ ...btnSecondary, marginBottom: 12, fontSize: 12 }}
                disabled={ledgerReconcileLoading || !ledgerClientId}
                onClick={loadLedgerReconciliation}
              >
                Refresh
              </button>
              {ledgerReconcileLoading && <div style={{ color: '#64748b' }}>Loading…</div>}
              {ledgerReconcileError && <div style={{ color: '#dc2626', marginBottom: 8 }}>{ledgerReconcileError}</div>}
              {ledgerReconcilePayload && (
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    background: '#f8fafc',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 11,
                    lineHeight: 1.45,
                    overflow: 'auto',
                    maxHeight: '55vh',
                  }}
                >
                  {JSON.stringify(ledgerReconcilePayload, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
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
      {showPaymentModal && (
        <PaymentExpenseModal
          onClose={() => setShowPaymentModal(false)}
          onSave={(data) => { handleSavePaymentExpense(data); setShowPaymentModal(false); }}
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
          creditNotes={creditNotes}
          onClose={() => setShowCnModal(false)}
          onSave={(data) => { handleSaveCreditNote(data); setShowCnModal(false); }}
        />
      )}
      {showOpeningModal && ledgerClientId && (
        <OpeningBalanceModal
          entityId={ledgerClientId}
          entityName={ledgerClientName}
          entityType={ledgerEntityType}
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
        {tab==='invoices' && canCreateInvoice && (
          <button onClick={() => { setRaiseInvoicePrefill(null); setShowRaiseInvoice(true); }} style={{ ...btnPrimary, marginLeft:'auto' }}>🧾 Raise Invoice</button>
        )}
        {tab === 'service_billing' && canCreateInvoice && (
          <button
            type="button"
            onClick={() => { setRaiseInvoicePrefill(null); setShowRaiseInvoice(true); }}
            style={{ ...btnPrimary, marginLeft: 'auto' }}
          >
            🧾 Raise Invoice
          </button>
        )}
        {tab==='receipts' && (
          <button onClick={() => setShowReceiptModal(true)} style={{ ...btnPrimary, marginLeft:'auto' }}>+ Receipt</button>
        )}
        {tab==='payments' && (
          <button onClick={() => setShowPaymentModal(true)} style={{ ...btnPrimary, marginLeft:'auto' }}>+ Payment</button>
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

      {TXN_LIST_SEARCH_TABS.has(tab) && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: '#f8fafc',
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <label htmlFor="txn-list-search" style={{ fontSize: 12, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
            Search table
          </label>
          <input
            id="txn-list-search"
            type="search"
            value={txnListSearchQuery}
            onChange={(e) => setTxnListSearchQuery(e.target.value)}
            placeholder={
              tab === 'invoices'
                ? 'Invoice #, client, date, status, billing profile…'
                : tab === 'receipts'
                  ? 'Ref, client, method, notes…'
                  : tab === 'payments'
                    ? 'Ref, client, purpose, narration, notes…'
                    : tab === 'tds'
                      ? 'Client, section, billing profile…'
                      : tab === 'rebate'
                        ? 'Client, narration, notes…'
                        : tab === 'credit_note'
                          ? 'Client, linked invoice, narration…'
                          : 'Search…'
            }
            style={{ ...inputStyle, flex: 1, minWidth: 200, maxWidth: 520 }}
            autoComplete="off"
          />
          {tab === 'payments' && (
            <>
              <label
                style={{
                  fontSize: 12,
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                }}
                title="Same contact/org AND ledger type (Regular / Memorandum / Optional) as the Ledger tab"
              >
                <input
                  type="checkbox"
                  checked={paymentsFilterByLedger}
                  disabled={!ledgerClientId}
                  onChange={(e) => setPaymentsFilterByLedger(e.target.checked)}
                />
                Match Ledger tab (entity + ledger type)
              </label>
              {paymentsFilterByLedger && ledgerClientId && (
                <span style={{ fontSize: 12, color: '#0369a1' }}>
                  Payments for {ledgerClientName || 'selected entity'} (
                  {ledgerEntityType === 'organization' ? 'Organization' : 'Contact'} #{ledgerClientId})
                </span>
              )}
              {paymentsFilterByLedger && !ledgerClientId && (
                <span style={{ fontSize: 12, color: '#b45309' }}>
                  Select a client or organization on the Ledger tab first.
                </span>
              )}
            </>
          )}
        </div>
      )}

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
          {canDeleteInvoice && selectedInvoiceIds.length > 0 && (
            <div style={{ padding: '10px 16px', background: '#fef2f2', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#991b1b', fontWeight: 600 }}>{selectedInvoiceIds.length} selected</span>
              <button
                type="button"
                style={{ ...btnPrimary, background: '#b91c1c', fontSize: 12, padding: '6px 12px' }}
                onClick={() => setLedgerDeletePrompt({
                  title: 'Delete invoices',
                  items: selectedInvoiceIds.map((id) => {
                    const inv = invoices.find((x) => Number(x.id) === Number(id));
                    return {
                      id,
                      label: inv ? `${inv.invoiceNumber || `INV-${inv.id}`} — ${inv.clientName}` : `Invoice #${id}`,
                    };
                  }),
                })}
              >
                Delete selected
              </button>
              <button type="button" style={{ ...btnSecondary, fontSize: 12, padding: '6px 12px' }} onClick={() => setSelectedInvoiceIds([])}>Clear selection</button>
            </div>
          )}
          <table style={tableStyle}>
            <thead>
              <tr>
                {canDeleteInvoice && (
                  <th style={{ ...thStyle, width: 36 }}>
                    <input
                      type="checkbox"
                      title="Select all"
                      checked={visibleInvoices.length > 0 && visibleInvoices.every((i) => selectedInvoiceIds.some((x) => Number(x) === Number(i.id)))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedInvoiceIds(visibleInvoices.map((x) => x.id));
                        } else {
                          setSelectedInvoiceIds([]);
                        }
                      }}
                    />
                  </th>
                )}
                {['Invoice #','Client','Date','Due Date','Amount','Billing Profile','Status','Last updated by','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {invLoading ? (
                <tr><td colSpan={canDeleteInvoice ? 10 : 9} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Loading invoices…</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={canDeleteInvoice ? 10 : 9} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No invoices yet. Raise one to begin.</td></tr>
              ) : filteredInvoices.length === 0 ? (
                <tr><td colSpan={canDeleteInvoice ? 10 : 9} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No invoices match the status filters.</td></tr>
              ) : visibleInvoices.length === 0 ? (
                <tr><td colSpan={canDeleteInvoice ? 10 : 9} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No invoices match your search.</td></tr>
              ) : visibleInvoices.map(i=>(
                <tr
                  key={i.id}
                  id={`txn-row-${i.id}`}
                  style={{ ...trStyle, cursor: 'pointer' }}
                  onClick={() => setViewInvoiceTxn(i)}
                >
                  {canDeleteInvoice && (
                    <td style={{ ...tdStyle, width: 36 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedInvoiceIds.some((x) => Number(x) === Number(i.id))}
                        onChange={() => setSelectedInvoiceIds((prev) => {
                          const has = prev.some((x) => Number(x) === Number(i.id));
                          return has ? prev.filter((x) => Number(x) !== Number(i.id)) : [...prev, i.id];
                        })}
                      />
                    </td>
                  )}
                  <td style={{ ...tdStyle, fontWeight:600, fontFamily:'monospace', fontSize:12 }}>{i.invoiceNumber || `INV-${i.id}`}</td>
                  <td style={tdStyle}>{i.clientName}</td>
                  <td style={tdStyle}>{i.txnDate || i.invoiceDate}</td>
                  <td style={tdStyle}>{i.dueDate || '—'}</td>
                  <td style={{ ...tdStyle, fontWeight:600 }}>₹{(i.amount || i.debit || 0).toLocaleString('en-IN')}</td>
                  <td style={tdStyle}><BillingProfileBadge code={i.billingProfileCode} /></td>
                  <td style={tdStyle}><StatusBadge status={i.invoiceStatus || i.status} /></td>
                  <LastUpdatedByCell txn={i} onOpenAudit={setTxnAuditModalTxn} tdStyle={tdStyle} />
                  <td style={tdStyle} onClick={e => e.stopPropagation()}>
                    <button type="button" style={iconBtn} onClick={() => setViewInvoiceTxn(i)}>👁 View</button>
                    {canEditInvoice && (
                      <button type="button" style={iconBtn} onClick={() => setEditInvoiceId(i.id)}>✏️ Edit</button>
                    )}
                    <button type="button" style={iconBtn} onClick={() => { setSelectedInvoice(i); setShowRecordPayment(true); }}>💳 Pay</button>
                    {canCreateInvoice && ['sent', 'partially_paid', 'overdue'].includes(String(i.invoiceStatus || i.status || '')) && (
                      <button type="button" style={iconBtn} onClick={(e) => { e.stopPropagation(); handleRazorpayCollect(i); }} title="Collect with Razorpay">₹ Razorpay</button>
                    )}
                    {canDeleteInvoice && (
                      <button
                        type="button"
                        style={iconBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setLedgerDeletePrompt({
                            title: 'Delete invoice',
                            items: [{ id: i.id, label: `${i.invoiceNumber || `INV-${i.id}`} — ${i.clientName}` }],
                          });
                        }}
                      >
                        🗑 Delete
                      </button>
                    )}
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
          {canDeleteInvoice && selectedReceiptIds.length > 0 && (
            <div style={{ padding: '10px 16px', background: '#fef2f2', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#991b1b', fontWeight: 600 }}>{selectedReceiptIds.length} selected</span>
              <button
                type="button"
                style={{ ...btnPrimary, background: '#b91c1c', fontSize: 12, padding: '6px 12px' }}
                onClick={() => setLedgerDeletePrompt({
                  title: 'Delete receipts',
                  items: selectedReceiptIds.map((id) => {
                    const r = receipts.find((x) => Number(x.id) === Number(id));
                    return {
                      id,
                      label: r
                        ? `${r.txnDate || '—'} — ${r.clientName} — ${formatSignedInrAmount(r.txnType, r.amount || r.credit || 0)}`
                        : `Receipt #${id}`,
                    };
                  }),
                })}
              >
                Delete selected
              </button>
              <button type="button" style={{ ...btnSecondary, fontSize: 12, padding: '6px 12px' }} onClick={() => setSelectedReceiptIds([])}>Clear selection</button>
            </div>
          )}
          <table style={tableStyle}>
            <thead>
              <tr>
                {canDeleteInvoice && (
                  <th style={{ ...thStyle, width: 36 }}>
                    <input
                      type="checkbox"
                      title="Select all"
                      checked={visibleReceipts.length > 0 && visibleReceipts.every((r) => selectedReceiptIds.some((x) => Number(x) === Number(r.id)))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedReceiptIds(visibleReceipts.map((x) => x.id));
                        } else {
                          setSelectedReceiptIds([]);
                        }
                      }}
                    />
                  </th>
                )}
                {['Date','Ref','Client','Amount','Method','Reference No.','Billing Profile','Linked Invoice','Notes','Last updated by','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {recLoading ? (
                <tr><td colSpan={canDeleteInvoice ? 12 : 11} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Loading receipts…</td></tr>
              ) : receipts.length === 0 ? (
                <tr><td colSpan={canDeleteInvoice ? 12 : 11} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No receipts found. Click "+ Receipt" to record one.</td></tr>
              ) : visibleReceipts.length === 0 ? (
                <tr><td colSpan={canDeleteInvoice ? 12 : 11} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No receipts match your search.</td></tr>
              ) : visibleReceipts.map(r=>(
                <tr key={r.id} style={trStyle}>
                  {canDeleteInvoice && (
                    <td style={{ ...tdStyle, width: 36 }}>
                      <input
                        type="checkbox"
                        checked={selectedReceiptIds.some((x) => Number(x) === Number(r.id))}
                        onChange={() => setSelectedReceiptIds((prev) => {
                          const has = prev.some((x) => Number(x) === Number(r.id));
                          return has ? prev.filter((x) => Number(x) !== Number(r.id)) : [...prev, r.id];
                        })}
                      />
                    </td>
                  )}
                  <td style={tdStyle}>{r.txnDate}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{r.publicRef || '—'}</td>
                  <td style={tdStyle}>{r.clientName}</td>
                  <td style={{ ...tdStyle, fontWeight:600, color:'#16a34a' }}>{formatSignedInrAmount(r.txnType, r.amount || r.credit || 0)}</td>
                  <td style={tdStyle}>{r.paymentMethod || '—'}</td>
                  <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:12 }}>{r.referenceNumber || '—'}</td>
                  <td style={tdStyle}><BillingProfileBadge code={r.billingProfileCode} /></td>
                  <td style={tdStyle}>{r.linkedTxnId ? `#${r.linkedTxnId}` : '—'}</td>
                  <td style={tdStyle}>{r.notes || '—'}</td>
                  <LastUpdatedByCell txn={r} onOpenAudit={setTxnAuditModalTxn} tdStyle={tdStyle} />
                  <td style={tdStyle}>
                    {canEditInvoice && (
                      <button type="button" style={iconBtn} onClick={() => setEditLedgerTxnId(r.id)}>✏️ Edit</button>
                    )}
                    {canDeleteInvoice && (
                      <button
                        type="button"
                        style={iconBtn}
                        onClick={() => setLedgerDeletePrompt({
                          title: 'Delete receipt',
                          items: [{
                            id: r.id,
                            label: `${r.txnDate || '—'} — ${r.clientName} — ${formatSignedInrAmount(r.txnType, r.amount || r.credit || 0)}`,
                          }],
                        })}
                      >
                        🗑 Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: Payments (on behalf) ───────────────────────────────────────── */}
      {tab === 'payments' && (
        <div style={cardStyle}>
          {ledgerClientId && !paymentsFilterByLedger && (
            <div style={{
              padding: '10px 14px',
              background: '#fffbeb',
              borderBottom: '1px solid #fde68a',
              fontSize: 12,
              color: '#92400e',
            }}
            >
              Amber-highlighted rows do not match the Ledger tab <strong>entity</strong> or <strong>ledger type</strong>. Enable &quot;Match Ledger tab (entity + ledger type)&quot; next to the search bar to narrow the list, or click &quot;Ledger&quot; on a row to open that booking&apos;s ledger.
            </div>
          )}
          {canDeleteInvoice && selectedPaymentIds.length > 0 && (
            <div style={{ padding: '10px 16px', background: '#fef2f2', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#991b1b', fontWeight: 600 }}>{selectedPaymentIds.length} selected</span>
              <button
                type="button"
                style={{ ...btnPrimary, background: '#b91c1c', fontSize: 12, padding: '6px 12px' }}
                onClick={() => setLedgerDeletePrompt({
                  title: 'Delete payments (on behalf)',
                  items: selectedPaymentIds.map((id) => {
                    const p = paymentExpenses.find((x) => Number(x.id) === Number(id));
                    return {
                      id,
                      label: p
                        ? `${p.txnDate || '—'} — ${p.clientName} — ${formatSignedInrAmount(p.txnType, p.amount || 0)}`
                        : `Payment #${id}`,
                    };
                  }),
                })}
              >
                Delete selected
              </button>
              <button type="button" style={{ ...btnSecondary, fontSize: 12, padding: '6px 12px' }} onClick={() => setSelectedPaymentIds([])}>Clear selection</button>
            </div>
          )}
          <table style={tableStyle}>
            <thead>
              <tr>
                {canDeleteInvoice && (
                  <th style={{ ...thStyle, width: 36 }}>
                    <input
                      type="checkbox"
                      title="Select all"
                      checked={visiblePaymentExpenses.length > 0 && visiblePaymentExpenses.every((p) => selectedPaymentIds.some((x) => Number(x) === Number(p.id)))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPaymentIds(visiblePaymentExpenses.map((x) => x.id));
                        } else {
                          setSelectedPaymentIds([]);
                        }
                      }}
                    />
                  </th>
                )}
                {['Date', 'Ref', 'Client', 'Booked on', 'Ledger type', 'Movement', 'Amount', 'Purpose', 'Paid via', 'Paid from', 'Reference', 'Narration', 'Billing profile', 'Notes', 'Last updated by', 'Actions'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payLoading ? (
                <tr><td colSpan={canDeleteInvoice ? 17 : 16} style={{ ...tdStyle, textAlign: 'center', padding: 24, color: '#94a3b8' }}>Loading payments…</td></tr>
              ) : paymentExpenses.length === 0 ? (
                <tr><td colSpan={canDeleteInvoice ? 17 : 16} style={{ ...tdStyle, textAlign: 'center', padding: 24, color: '#94a3b8' }}>No payments on behalf found. Click &quot;+ Payment&quot; to record one.</td></tr>
              ) : visiblePaymentExpenses.length === 0 ? (
                <tr><td colSpan={canDeleteInvoice ? 17 : 16} style={{ ...tdStyle, textAlign: 'center', padding: 24, color: '#94a3b8' }}>No payments match your search.</td></tr>
              ) : visiblePaymentExpenses.map((p) => {
                const ledgerMismatch = ledgerClientId && !paymentsFilterByLedger && (
                  !paymentExpenseMatchesLedgerSelection(p, ledgerClientId, ledgerEntityType)
                  || normalizeLedgerClassForApi(p.ledgerClass) !== normalizeLedgerClassForApi(ledgerLedgerClass)
                );
                return (
                <tr key={p.id} style={{
                  ...trStyle,
                  ...(ledgerMismatch ? { background: '#fffbeb' } : {}),
                }}
                >
                  {canDeleteInvoice && (
                    <td style={{ ...tdStyle, width: 36 }}>
                      <input
                        type="checkbox"
                        checked={selectedPaymentIds.some((x) => Number(x) === Number(p.id))}
                        onChange={() => setSelectedPaymentIds((prev) => {
                          const has = prev.some((x) => Number(x) === Number(p.id));
                          return has ? prev.filter((x) => Number(x) !== Number(p.id)) : [...prev, p.id];
                        })}
                      />
                    </td>
                  )}
                  <td style={tdStyle}>{p.txnDate}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{p.publicRef || '—'}</td>
                  <td style={tdStyle}>{p.clientName}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }} title="Which contact or organization ledger this payment debits">{paymentExpenseBookedOnLabel(p) || '—'}</td>
                  <td style={tdStyle}>{ledgerClassLabel(p.ledgerClass)}</td>
                  <td style={tdStyle}>
                    {p.ledgerMovementKind === 'reimbursement'
                      ? 'Reimbursement'
                      : p.ledgerMovementKind === 'fees'
                        ? 'Fees'
                        : '—'}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: '#b91c1c' }} title="Recoverable from client (ledger debit)">{formatSignedInrAmount(p.txnType, p.amount || 0)}</td>
                  <td style={tdStyle}>{expensePurposeLabel(p.expensePurpose)}</td>
                  <td style={tdStyle}>{p.paymentMethod || '—'}</td>
                  <td style={{ ...tdStyle, maxWidth: 140, whiteSpace: 'normal' }}>{p.paidFrom || '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{p.referenceNumber || '—'}</td>
                  <td style={{ ...tdStyle, maxWidth: 200, whiteSpace: 'normal' }}>{p.narration || '—'}</td>
                  <td style={tdStyle}><BillingProfileBadge code={p.billingProfileCode} /></td>
                  <td style={{ ...tdStyle, maxWidth: 160, whiteSpace: 'normal' }}>{p.notes || '—'}</td>
                  <LastUpdatedByCell txn={p} onOpenAudit={setTxnAuditModalTxn} tdStyle={tdStyle} />
                  <td style={tdStyle}>
                    <button
                      type="button"
                      style={iconBtn}
                      title="Open Ledger tab with this entity and ledger filters"
                      onClick={() => openLedgerFromPaymentExpense(p)}
                    >
                      Ledger
                    </button>
                    {canEditInvoice && (
                      <button type="button" style={iconBtn} onClick={() => setEditLedgerTxnId(p.id)}>✏️ Edit</button>
                    )}
                    {canDeleteInvoice && (
                      <button
                        type="button"
                        style={iconBtn}
                        onClick={() => setLedgerDeletePrompt({
                          title: 'Delete payment (on behalf)',
                          items: [{
                            id: p.id,
                            label: `${p.txnDate || '—'} — ${p.clientName} — ${formatSignedInrAmount(p.txnType, p.amount || 0)}`,
                          }],
                        })}
                      >
                        🗑 Delete
                      </button>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: TDS ──────────────────────────────────────────────────────── */}
      {tab==='tds' && (
        <div style={cardStyle}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #f1f5f9', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            {['all','provisional','final'].map(s=>(
              <button key={s} onClick={()=>{ setTdsFilter(s); setSelectedTds([]); setSelectedTdsDeleteIds([]); }} style={{ padding:'4px 12px', background: tdsFilter===s?'#7c3aed':'#f8fafc', color: tdsFilter===s?'#fff':'#64748b', border:'1px solid #e2e8f0', borderRadius:16, fontSize:12, cursor:'pointer', fontWeight:600 }}>
                {s==='all'?'All':s.charAt(0).toUpperCase()+s.slice(1)}
              </button>
            ))}
            {selectedTds.length > 0 && (
              <button onClick={handleFinalizeTds} style={{ ...btnPrimary, background:'#7c3aed', marginLeft:8, fontSize:12, padding:'6px 14px' }}>
                ✅ Mark as Final ({selectedTds.length} selected)
              </button>
            )}
            {canDeleteInvoice && selectedTdsDeleteIds.length > 0 && (
              <button
                type="button"
                onClick={() => setLedgerDeletePrompt({
                  title: 'Delete TDS entries',
                  items: selectedTdsDeleteIds.map((id) => {
                    const t = tdsEntries.find((x) => Number(x.id) === Number(id));
                    return {
                      id,
                      label: t
                        ? `${t.txnDate || '—'} — ${t.clientName} — ${formatSignedInrAmount(t.txnType, t.amount || 0)} (${t.txnType || ''})`
                        : `TDS #${id}`,
                    };
                  }),
                })}
                style={{ ...btnPrimary, background:'#b91c1c', marginLeft:8, fontSize:12, padding:'6px 14px' }}
              >
                🗑 Delete selected ({selectedTdsDeleteIds.length})
              </button>
            )}
          </div>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 44, fontSize: 11 }} title="Mark provisional as final">Final</th>
                {canDeleteInvoice && <th style={{ ...thStyle, width: 36, fontSize: 11 }}>Del</th>}
                {['Date','Client','Amount','Section','Rate','Status','Billing Profile','Last updated by'].map(h=><th key={h} style={thStyle}>{h}</th>)}
                {(canEditInvoice || canDeleteInvoice) && <th style={thStyle}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {tdsLoading ? (
                <tr><td colSpan={9 + (canDeleteInvoice ? 1 : 0) + ((canEditInvoice || canDeleteInvoice) ? 1 : 0)} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Loading TDS entries…</td></tr>
              ) : tdsEntries.length === 0 ? (
                <tr><td colSpan={9 + (canDeleteInvoice ? 1 : 0) + ((canEditInvoice || canDeleteInvoice) ? 1 : 0)} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No TDS entries found. Click "+ Book TDS" to add one.</td></tr>
              ) : visibleTdsEntries.length === 0 ? (
                <tr><td colSpan={9 + (canDeleteInvoice ? 1 : 0) + ((canEditInvoice || canDeleteInvoice) ? 1 : 0)} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No TDS entries match your search.</td></tr>
              ) : visibleTdsEntries.map(t=>(
                <tr key={t.id} style={trStyle}>
                  <td style={{ ...tdStyle, width:44 }}>
                    {t.tdsStatus === 'provisional' && (
                      <input type="checkbox" checked={selectedTds.includes(t.id)} onChange={()=>toggleTdsSelect(t.id)} />
                    )}
                  </td>
                  {canDeleteInvoice && (
                    <td style={{ ...tdStyle, width:36 }}>
                      <input
                        type="checkbox"
                        checked={selectedTdsDeleteIds.includes(t.id)}
                        onChange={() => toggleTdsDeleteSelect(t.id)}
                      />
                    </td>
                  )}
                  <td style={tdStyle}>{t.txnDate}</td>
                  <td style={tdStyle}>{t.clientName}</td>
                  <td style={{ ...tdStyle, fontWeight:600 }}>{formatSignedInrAmount(t.txnType, t.amount || 0)}</td>
                  <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:12 }}>{t.tdsSection || '—'}</td>
                  <td style={tdStyle}>{t.tdsRate ? `${t.tdsRate}%` : '—'}</td>
                  <td style={tdStyle}><TxnTypeBadge type={t.txnType} /></td>
                  <td style={tdStyle}><BillingProfileBadge code={t.billingProfileCode} /></td>
                  <LastUpdatedByCell txn={t} onOpenAudit={setTxnAuditModalTxn} tdStyle={tdStyle} />
                  {(canEditInvoice || canDeleteInvoice) && (
                    <td style={tdStyle}>
                      {canEditInvoice && (
                        <button type="button" style={iconBtn} onClick={() => setEditLedgerTxnId(t.id)}>✏️ Edit</button>
                      )}
                      {canDeleteInvoice && (
                        <button
                          type="button"
                          style={iconBtn}
                          onClick={() => setLedgerDeletePrompt({
                            title: 'Delete TDS entry',
                            items: [{
                              id: t.id,
                              label: `${t.txnDate || '—'} — ${t.clientName} — ${formatSignedInrAmount(t.txnType, t.amount || 0)} (${t.txnType || ''})`,
                            }],
                          })}
                        >
                          🗑 Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: Rebate/Discount ──────────────────────────────────────────── */}
      {tab==='rebate' && (
        <div style={cardStyle}>
          {canDeleteInvoice && selectedRebateIds.length > 0 && (
            <div style={{ padding: '10px 16px', background: '#fef2f2', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#991b1b', fontWeight: 600 }}>{selectedRebateIds.length} selected</span>
              <button
                type="button"
                style={{ ...btnPrimary, background: '#b91c1c', fontSize: 12, padding: '6px 12px' }}
                onClick={() => setLedgerDeletePrompt({
                  title: 'Delete rebate / discount',
                  items: selectedRebateIds.map((id) => {
                    const r = rebates.find((x) => Number(x.id) === Number(id));
                    return {
                      id,
                      label: r
                        ? `${r.txnDate || '—'} — ${r.clientName} — ₹${(r.amount || 0).toLocaleString('en-IN')}`
                        : `Rebate #${id}`,
                    };
                  }),
                })}
              >
                Delete selected
              </button>
              <button type="button" style={{ ...btnSecondary, fontSize: 12, padding: '6px 12px' }} onClick={() => setSelectedRebateIds([])}>Clear selection</button>
            </div>
          )}
          <table style={tableStyle}>
            <thead>
              <tr>
                {canDeleteInvoice && (
                  <th style={{ ...thStyle, width: 36 }}>
                    <input
                      type="checkbox"
                      title="Select all"
                      checked={visibleRebates.length > 0 && visibleRebates.every((r) => selectedRebateIds.some((x) => Number(x) === Number(r.id)))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRebateIds(visibleRebates.map((x) => x.id));
                        } else {
                          setSelectedRebateIds([]);
                        }
                      }}
                    />
                  </th>
                )}
                {['Date','Client','Amount','Narration','Billing Profile','Notes','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rebLoading ? (
                <tr><td colSpan={canDeleteInvoice ? 8 : 7} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Loading rebate entries…</td></tr>
              ) : rebates.length === 0 ? (
                <tr><td colSpan={canDeleteInvoice ? 8 : 7} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No rebate/discount entries found. Click "+ Rebate/Discount" to add one.</td></tr>
              ) : visibleRebates.length === 0 ? (
                <tr><td colSpan={canDeleteInvoice ? 8 : 7} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No entries match your search.</td></tr>
              ) : visibleRebates.map(r=>(
                <tr key={r.id} style={trStyle}>
                  {canDeleteInvoice && (
                    <td style={{ ...tdStyle, width: 36 }}>
                      <input
                        type="checkbox"
                        checked={selectedRebateIds.some((x) => Number(x) === Number(r.id))}
                        onChange={() => setSelectedRebateIds((prev) => {
                          const has = prev.some((x) => Number(x) === Number(r.id));
                          return has ? prev.filter((x) => Number(x) !== Number(r.id)) : [...prev, r.id];
                        })}
                      />
                    </td>
                  )}
                  <td style={tdStyle}>{r.txnDate}</td>
                  <td style={tdStyle}>{r.clientName}</td>
                  <td style={{ ...tdStyle, fontWeight:600, color:'#be123c' }}>₹{r.amount.toLocaleString('en-IN')}</td>
                  <td style={tdStyle}>{r.narration || '—'}</td>
                  <td style={tdStyle}><BillingProfileBadge code={r.billingProfileCode} /></td>
                  <td style={tdStyle}>{r.notes || '—'}</td>
                  <td style={tdStyle}>
                    {canDeleteInvoice && (
                      <button
                        type="button"
                        style={iconBtn}
                        onClick={() => setLedgerDeletePrompt({
                          title: 'Delete rebate / discount',
                          items: [{
                            id: r.id,
                            label: `${r.txnDate || '—'} — ${r.clientName} — ₹${(r.amount || 0).toLocaleString('en-IN')}`,
                          }],
                        })}
                      >
                        🗑 Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: Credit Notes ─────────────────────────────────────────────── */}
      {tab==='credit_note' && (
        <div style={cardStyle}>
          {canDeleteInvoice && selectedCreditNoteIds.length > 0 && (
            <div style={{ padding: '10px 16px', background: '#fef2f2', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#991b1b', fontWeight: 600 }}>{selectedCreditNoteIds.length} selected</span>
              <button
                type="button"
                style={{ ...btnPrimary, background: '#b91c1c', fontSize: 12, padding: '6px 12px' }}
                onClick={() => setLedgerDeletePrompt({
                  title: 'Delete credit notes',
                  items: selectedCreditNoteIds.map((id) => {
                    const c = creditNotes.find((x) => Number(x.id) === Number(id));
                    return {
                      id,
                      label: c
                        ? `${c.txnDate || '—'} — ${c.clientName} — ₹${(c.amount || 0).toLocaleString('en-IN')}${c.linkedTxnId ? ` (inv #${c.linkedTxnId})` : ''}`
                        : `Credit note #${id}`,
                    };
                  }),
                })}
              >
                Delete selected
              </button>
              <button type="button" style={{ ...btnSecondary, fontSize: 12, padding: '6px 12px' }} onClick={() => setSelectedCreditNoteIds([])}>Clear selection</button>
            </div>
          )}
          <table style={tableStyle}>
            <thead>
              <tr>
                {canDeleteInvoice && (
                  <th style={{ ...thStyle, width: 36 }}>
                    <input
                      type="checkbox"
                      title="Select all"
                      checked={visibleCreditNotes.length > 0 && visibleCreditNotes.every((c) => selectedCreditNoteIds.some((x) => Number(x) === Number(c.id)))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCreditNoteIds(visibleCreditNotes.map((x) => x.id));
                        } else {
                          setSelectedCreditNoteIds([]);
                        }
                      }}
                    />
                  </th>
                )}
                {['Date','Client','Amount','Linked Invoice','Narration','Billing Profile','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {cnLoading ? (
                <tr><td colSpan={canDeleteInvoice ? 8 : 7} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Loading credit notes…</td></tr>
              ) : creditNotes.length === 0 ? (
                <tr><td colSpan={canDeleteInvoice ? 8 : 7} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No credit notes found. Click "+ Credit Note" to add one.</td></tr>
              ) : visibleCreditNotes.length === 0 ? (
                <tr><td colSpan={canDeleteInvoice ? 8 : 7} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No credit notes match your search.</td></tr>
              ) : visibleCreditNotes.map(c=>(
                <tr key={c.id} style={trStyle}>
                  {canDeleteInvoice && (
                    <td style={{ ...tdStyle, width: 36 }}>
                      <input
                        type="checkbox"
                        checked={selectedCreditNoteIds.some((x) => Number(x) === Number(c.id))}
                        onChange={() => setSelectedCreditNoteIds((prev) => {
                          const has = prev.some((x) => Number(x) === Number(c.id));
                          return has ? prev.filter((x) => Number(x) !== Number(c.id)) : [...prev, c.id];
                        })}
                      />
                    </td>
                  )}
                  <td style={tdStyle}>{c.txnDate}</td>
                  <td style={tdStyle}>{c.clientName}</td>
                  <td style={{ ...tdStyle, fontWeight:600, color:'#854d0e' }}>₹{c.amount.toLocaleString('en-IN')}</td>
                  <td style={tdStyle}>{c.linkedTxnId ? `#${c.linkedTxnId}` : '—'}</td>
                  <td style={tdStyle}>{c.narration || '—'}</td>
                  <td style={tdStyle}><BillingProfileBadge code={c.billingProfileCode} /></td>
                  <td style={tdStyle}>
                    {canDeleteInvoice && (
                      <button
                        type="button"
                        style={iconBtn}
                        onClick={() => setLedgerDeletePrompt({
                          title: 'Delete credit note',
                          items: [{
                            id: c.id,
                            label: `${c.txnDate || '—'} — ${c.clientName} — ₹${(c.amount || 0).toLocaleString('en-IN')}${c.linkedTxnId ? ` (inv #${c.linkedTxnId})` : ''}`,
                          }],
                        })}
                      >
                        🗑 Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: Ledger ───────────────────────────────────────────────────── */}
      {tab==='ledger' && (
        <div style={cardStyle}>
          <div style={ledgerToolbarBarStyle}>
            <div style={ledgerToolbarGroupStyle}>
              <span style={ledgerToolbarLabelStyle}>Client:</span>
              <div style={{ flex: '0 0 clamp(200px, 26vw, 300px)', minWidth: 0 }}>
                <EntitySearchDropdown
                  value={ledgerClientId}
                  displayValue={ledgerClientName}
                  entityType={ledgerEntityType}
                  onChange={c => {
                    setLedgerClientId(String(c.id));
                    setLedgerClientName(c.displayName);
                    setLedgerEntityType(c.entityType);
                  }}
                  placeholder="Search contact or organization…"
                />
              </div>
            </div>
            <div style={ledgerToolbarScrollTailStyle}>
            {ledgerClientId && (
              <>
                <div style={ledgerToolbarGroupStyle}>
                  <span style={ledgerToolbarLabelStyle}>Ledger type:</span>
                  <select
                    style={{ ...ledgerToolbarSelectStyle, minWidth: 116 }}
                    value={ledgerLedgerClass}
                    onChange={(e) => setLedgerLedgerClass(e.target.value)}
                  >
                    {LEDGER_CLASS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div style={ledgerToolbarGroupStyle}>
                  <span style={ledgerToolbarLabelStyle}>View:</span>
                  <select
                    style={{ ...ledgerToolbarSelectStyle, minWidth: 144 }}
                    value={ledgerLedgerView}
                    onChange={(e) => setLedgerLedgerView(e.target.value)}
                  >
                    {LEDGER_VIEW_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            {ledgerClientId && !ledgerLoading && (
              <>
                <div style={ledgerToolbarGroupStyle}>
                  <span style={ledgerToolbarLabelStyle}>Financial year:</span>
                  <select
                    style={{ ...ledgerToolbarSelectStyle, minWidth: 128, maxWidth: 168 }}
                    value={ledgerFyStartYear ?? ledgerFyOptions[ledgerFyOptions.length - 1]}
                    onChange={(e) => setLedgerFyStartYear(parseInt(e.target.value, 10))}
                  >
                    {ledgerFyOptions.map((y) => (
                      <option key={y} value={y}>
                        {indianFYLabel(y)}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={ledgerToolbarGroupStyle}>
                  <span style={ledgerToolbarLabelStyle}>Date from:</span>
                  <DateInput
                    style={ledgerToolbarDateStyle}
                    min={ledgerFyStartYear != null ? indianFYBounds(ledgerFyStartYear).start : undefined}
                    max={ledgerFyStartYear != null ? indianFYBounds(ledgerFyStartYear).end : undefined}
                    value={ledgerFilterDateFrom}
                    onChange={(e) => setLedgerFilterDateFrom(e.target.value)}
                  />
                  <span style={ledgerToolbarLabelStyle}>to</span>
                  <DateInput
                    style={ledgerToolbarDateStyle}
                    min={ledgerFyStartYear != null ? indianFYBounds(ledgerFyStartYear).start : undefined}
                    max={ledgerFyStartYear != null ? indianFYBounds(ledgerFyStartYear).end : undefined}
                    value={ledgerFilterDateTo}
                    onChange={(e) => setLedgerFilterDateTo(e.target.value)}
                  />
                </div>
                {(ledgerFilterDateFrom || ledgerFilterDateTo) && (
                  <div style={ledgerToolbarGroupStyle}>
                    <button
                      type="button"
                      style={{ ...btnSecondary, fontSize:12, padding:'6px 10px', whiteSpace:'nowrap' }}
                      onClick={() => {
                        setLedgerFilterDateFrom('');
                        setLedgerFilterDateTo('');
                      }}
                    >
                      Clear dates
                    </button>
                  </div>
                )}
              </>
            )}
            {ledgerClientId && !ledgerLoading && ledgerDisplayRows.length > 0 && (
              <div style={ledgerToolbarGroupStyle}>
                <button
                  type="button"
                  style={{ ...btnSecondary, fontSize:12, padding:'6px 12px', whiteSpace:'nowrap' }}
                  onClick={() => {
                    const fy =
                      ledgerFyStartYear != null
                        ? indianFYLabel(ledgerFyStartYear)
                        : (ledgerFyOptions.length
                            ? indianFYLabel(ledgerFyOptions[ledgerFyOptions.length - 1])
                            : '');
                    exportLedgerExcel({
                      rows: ledgerDisplayRows,
                      clientName: ledgerClientName,
                      fyLabel: fy,
                      dateFrom: ledgerFilterDateFrom,
                      dateTo: ledgerFilterDateTo,
                    });
                  }}
                >
                  ⬇ Excel
                </button>
                <button
                  type="button"
                  style={{ ...btnSecondary, fontSize:12, padding:'6px 12px', whiteSpace:'nowrap' }}
                  onClick={() => {
                    const fy =
                      ledgerFyStartYear != null
                        ? indianFYLabel(ledgerFyStartYear)
                        : (ledgerFyOptions.length
                            ? indianFYLabel(ledgerFyOptions[ledgerFyOptions.length - 1])
                            : '');
                    exportLedgerPdf({
                      rows: ledgerDisplayRows,
                      clientName: ledgerClientName,
                      fyLabel: fy,
                      dateFrom: ledgerFilterDateFrom,
                      dateTo: ledgerFilterDateTo,
                      logoSrc: ledgerLogoUrl,
                    }).catch(() => {});
                  }}
                >
                  ⬇ PDF
                </button>
              </div>
            )}
            {ledgerClientId && (
              <div style={{ ...ledgerToolbarGroupStyle, gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  style={{ ...btnSecondary, fontSize:12, padding:'6px 12px', whiteSpace:'nowrap' }}
                  onClick={() => setShowOpeningModal(true)}
                >
                  📖 Opening Balances
                </button>
                <button
                  type="button"
                  style={{ ...btnSecondary, fontSize:12, padding:'6px 12px', whiteSpace:'nowrap' }}
                  disabled={ledgerLoading}
                  onClick={() => { setLedgerReconcileModalOpen(true); loadLedgerReconciliation(); }}
                >
                  Ledger reconciliation
                </button>
              </div>
            )}
            </div>
          </div>
          {ledgerClientId && (
            <div style={{
              padding: '8px 16px',
              borderBottom: '1px solid #f1f5f9',
              fontSize: 12,
              color: '#64748b',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px 16px',
              alignItems: 'center',
            }}
            >
              {ledgerLedgerView === 'fees' && (
                <span style={{ color: '#b45309' }}>
                  Fees only hides reimbursement movement rows (including reimbursement payments on behalf). Use Consolidated or Reimbursement only to see those lines.
                </span>
              )}
              {ledgerLedgerView === 'reimbursement' && (
                <span style={{ color: '#b45309' }}>
                  Reimbursement only hides professional fees movement rows. Use Consolidated or Fees only as needed.
                </span>
              )}
              {(ledgerFilterDateFrom || ledgerFilterDateTo) && (
                <span>
                  Rows outside the selected date range are folded into <strong>Balance b/f</strong> for this FY window (not omitted from the underlying ledger).
                </span>
              )}
            </div>
          )}
          {!ledgerClientId ? (
            <div style={{ padding:32, textAlign:'center', color:'#94a3b8', fontSize:13 }}>
              Search for a client above to view their ledger.
            </div>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  {['Date','Entry Type','Narration','Details','Billing Profile','Debit (Dr)','Credit (Cr)','Balance'].map(h=>(
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledgerLoading ? (
                  <tr><td colSpan={8} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Loading ledger…</td></tr>
                ) : ledger.length === 0 ? (
                  <tr><td colSpan={8} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No ledger entries for this client.</td></tr>
                ) : ledgerDisplayRows.map((e, i) => (
                  <tr
                    key={e.synthetic ? e.id : `${e.id ?? 'row'}-${i}`}
                    style={{
                      ...trStyle,
                      ...(e.txnType === 'opening_balance' ? { background: '#fffbeb' } : {}),
                      ...(e.txnType === 'brought_forward' ? { background: '#f1f5f9' } : {}),
                    }}
                  >
                    <td style={tdStyle}>{e.txnDate || e.date || '—'}</td>
                    <td style={tdStyle}><TxnTypeBadge type={e.txnType} /></td>
                    <td style={{ ...tdStyle, fontStyle: e.txnType === 'opening_balance' || e.txnType === 'brought_forward' ? 'italic' : 'normal' }}>{e.narration || '—'}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'normal', maxWidth: 280, fontSize: 12, color: '#64748b' }}>{buildLedgerDetailLine(e) || '—'}</td>
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

      {/* ── Tab: Bill by bill settlement ─────────────────────────────────────── */}
      {tab === 'bill_settlement' && (
        <div style={cardStyle}>
          <div style={ledgerToolbarBarStyle}>
            <div style={ledgerToolbarGroupStyle}>
              <span style={ledgerToolbarLabelStyle}>Client:</span>
              <div style={{ flex: '0 0 clamp(200px, 26vw, 300px)', minWidth: 0 }}>
                <EntitySearchDropdown
                  value={ledgerClientId}
                  displayValue={ledgerClientName}
                  entityType={ledgerEntityType}
                  onChange={(c) => {
                    setLedgerClientId(String(c.id));
                    setLedgerClientName(c.displayName);
                    setLedgerEntityType(c.entityType);
                  }}
                  placeholder="Search contact or organization…"
                />
              </div>
            </div>
            <div style={ledgerToolbarScrollTailStyle}>
            {ledgerClientId && (
              <>
                <div style={ledgerToolbarGroupStyle}>
                  <span style={ledgerToolbarLabelStyle}>Ledger type:</span>
                  <select
                    style={{ ...ledgerToolbarSelectStyle, minWidth: 116 }}
                    value={ledgerLedgerClass}
                    onChange={(e) => setLedgerLedgerClass(e.target.value)}
                  >
                    {LEDGER_CLASS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div style={ledgerToolbarGroupStyle}>
                  <span style={ledgerToolbarLabelStyle}>View:</span>
                  <select
                    style={{ ...ledgerToolbarSelectStyle, minWidth: 144 }}
                    value={ledgerLedgerView}
                    onChange={(e) => setLedgerLedgerView(e.target.value)}
                  >
                    {LEDGER_VIEW_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            {ledgerClientId && !ledgerLoading && (
              <>
                <div style={ledgerToolbarGroupStyle}>
                  <span style={ledgerToolbarLabelStyle}>Financial year:</span>
                  <select
                    style={{ ...ledgerToolbarSelectStyle, minWidth: 128, maxWidth: 168 }}
                    value={ledgerFyStartYear ?? ledgerFyOptions[ledgerFyOptions.length - 1]}
                    onChange={(e) => setLedgerFyStartYear(parseInt(e.target.value, 10))}
                  >
                    {ledgerFyOptions.map((y) => (
                      <option key={y} value={y}>
                        {indianFYLabel(y)}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={ledgerToolbarGroupStyle}>
                  <span style={ledgerToolbarLabelStyle}>Date from:</span>
                  <DateInput
                    style={ledgerToolbarDateStyle}
                    min={ledgerFyStartYear != null ? indianFYBounds(ledgerFyStartYear).start : undefined}
                    max={ledgerFyStartYear != null ? indianFYBounds(ledgerFyStartYear).end : undefined}
                    value={ledgerFilterDateFrom}
                    onChange={(e) => setLedgerFilterDateFrom(e.target.value)}
                  />
                  <span style={ledgerToolbarLabelStyle}>to</span>
                  <DateInput
                    style={ledgerToolbarDateStyle}
                    min={ledgerFyStartYear != null ? indianFYBounds(ledgerFyStartYear).start : undefined}
                    max={ledgerFyStartYear != null ? indianFYBounds(ledgerFyStartYear).end : undefined}
                    value={ledgerFilterDateTo}
                    onChange={(e) => setLedgerFilterDateTo(e.target.value)}
                  />
                </div>
                {(ledgerFilterDateFrom || ledgerFilterDateTo) && (
                  <div style={ledgerToolbarGroupStyle}>
                    <button
                      type="button"
                      style={{ ...btnSecondary, fontSize: 12, padding: '6px 10px', whiteSpace: 'nowrap' }}
                      onClick={() => {
                        setLedgerFilterDateFrom('');
                        setLedgerFilterDateTo('');
                      }}
                    >
                      Clear dates
                    </button>
                  </div>
                )}
              </>
            )}
            </div>
          </div>
          {ledgerClientId && (
            <div style={{
              padding: '8px 16px',
              borderBottom: '1px solid #f1f5f9',
              fontSize: 12,
              color: '#64748b',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px 16px',
              alignItems: 'center',
            }}
            >
              {ledgerLedgerView === 'fees' && (
                <span style={{ color: '#b45309' }}>
                  Fees only excludes reimbursement movement activity from sliced ledger logic underlying this report.
                </span>
              )}
              {ledgerLedgerView === 'reimbursement' && (
                <span style={{ color: '#b45309' }}>
                  Reimbursement only excludes fees movement activity from sliced ledger logic underlying this report.
                </span>
              )}
              {(ledgerFilterDateFrom || ledgerFilterDateTo) && (
                <span>
                  Date filters apply to this settlement report window; broader ledger rows may sit outside the range.
                </span>
              )}
            </div>
          )}
          {!ledgerClientId ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Search for a client to load the bill-by-bill settlement report.
            </div>
          ) : billLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Loading report…</div>
          ) : (
            <>
              {billReport && (
                <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 13, color: '#334155' }}>
                  <strong>Ledger closing balance:</strong>
                  {' '}
                  ₹
                  {(billReport.ledger_closing_balance ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {' · '}
                  <strong>Report net:</strong>
                  {' '}
                  ₹
                  {(billReport.report_net ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {' · '}
                  <strong>Reconciliation gap:</strong>
                  {' '}
                  ₹
                  {(billReport.reconciliation_gap ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {['Kind', 'Date', 'Ref', 'Label', 'Gross', 'CN/Adj (−)', 'Applied', 'Outstanding', 'Net effect'].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!(billReport && Array.isArray(billReport.lines) && billReport.lines.length) ? (
                    <tr>
                      <td colSpan={9} style={{ ...tdStyle, textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                        No lines for this filter (or no data yet).
                      </td>
                    </tr>
                  ) : (
                    billReport.lines.map((row, i) => (
                      <tr key={`${row.txn_id}-${row.line_kind}-${i}`} style={trStyle}>
                        <td style={tdStyle}>{row.line_kind || '—'}</td>
                        <td style={tdStyle}>{row.date || '—'}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{row.public_ref || (row.txn_id ? `#${row.txn_id}` : '—')}</td>
                        <td style={{ ...tdStyle, maxWidth: 220, whiteSpace: 'normal' }}>{row.label || '—'}</td>
                        <td style={tdStyle}>₹{parseFloat(row.gross || 0).toLocaleString('en-IN')}</td>
                        <td style={tdStyle}>₹{parseFloat(row.credit_note_credits || 0).toLocaleString('en-IN')}</td>
                        <td style={tdStyle}>₹{parseFloat(row.applied_receipts || 0).toLocaleString('en-IN')}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>₹{parseFloat(row.outstanding || 0).toLocaleString('en-IN')}</td>
                        <td style={tdStyle}>₹{parseFloat(row.net_balance_effect || 0).toLocaleString('en-IN')}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {tab === 'service_billing' && (
        <div style={cardStyle}>
          <div
            style={{
              padding: '8px 16px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              flexWrap: 'nowrap',
              gap: 12,
              alignItems: 'center',
              overflowX: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>Completion</span>
              <select
                style={{ ...inputStyle, minWidth: 140, width: 160 }}
                value={billingCompletion}
                onChange={(e) => setBillingCompletion(e.target.value)}
              >
                <option value="engagement">Engagement completed</option>
                <option value="tasks">All tasks done</option>
                <option value="any">Any (union)</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>Queue</span>
              <select
                style={{ ...inputStyle, minWidth: 112, width: 120 }}
                value={billingClosureFilter}
                onChange={(e) => setBillingClosureFilter(e.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="built">Billed</option>
                <option value="non_billable">Non-billable</option>
              </select>
            </div>
            <input
              type="search"
              placeholder="Search client or service…"
              value={billingSearch}
              onChange={(e) => setBillingSearch(e.target.value)}
              style={{
                ...inputStyle,
                flex: '1 1 160px',
                minWidth: 120,
                width: 'auto',
                maxWidth: '100%',
              }}
            />
          </div>
          <table style={tableStyle}>
            <thead>
              <tr>
                {['#', 'Client', 'Engagement', 'Badges', 'Billed (₹)', 'Invoices', 'Status', 'Actions'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {billingLoading ? (
                <tr>
                  <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                    Loading service billing…
                  </td>
                </tr>
              ) : billingRows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                    No rows for this filter. Completed engagements or all tasks done enter the queue when billing is open.
                  </td>
                </tr>
              ) : (
                billingRows.map((row) => (
                  <tr key={row.id} style={trStyle}>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{row.id}</td>
                    <td style={{ ...tdStyle, maxWidth: 200, whiteSpace: 'normal' }}>{row.clientName}</td>
                    <td style={{ ...tdStyle, maxWidth: 220, whiteSpace: 'normal' }}>{row.serviceType || '—'}</td>
                    <td style={{ ...tdStyle, fontSize: 11 }}>
                      {row.completionFlags?.engagementCompleted && (
                        <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: 4, marginRight: 4 }}>Engagement</span>
                      )}
                      {row.completionFlags?.allTasksDone && (
                        <span style={{ background: '#f0fdf4', color: '#15803d', padding: '2px 6px', borderRadius: 4 }}>Tasks</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      ₹{row.amountBilled.toLocaleString('en-IN')}
                    </td>
                    <td style={tdStyle}>{row.invoiceCount}</td>
                    <td style={tdStyle}>
                      {billingClosureFilter === 'pending' ? (
                        row.hasInvoice ? (
                          <span style={{ color: '#15803d', fontWeight: 700 }}>Final</span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Not invoiced</span>
                        )
                      ) : billingClosureFilter === 'built' ? (
                        <span style={{ fontSize: 12 }}>
                          {row.billingBuiltAmount != null
                            ? `₹${Number(row.billingBuiltAmount).toLocaleString('en-IN')}`
                            : '—'}
                          {row.billingBuiltAt ? (
                            <span style={{ color: '#94a3b8', display: 'block', fontSize: 11 }}>
                              {String(row.billingBuiltAt).slice(0, 10)}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, whiteSpace: 'normal', maxWidth: 200 }}>
                          {row.nonBillableReason || '—'}
                          {row.nonBillableAt ? (
                            <span style={{ color: '#94a3b8', display: 'block', fontSize: 11 }}>
                              {String(row.nonBillableAt).slice(0, 10)}
                            </span>
                          ) : null}
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'normal' }}>
                      <button
                        type="button"
                        style={iconBtn}
                        title="Invoice history"
                        onClick={() => setBillingHistoryServiceId(row.id)}
                      >
                        👁
                      </button>
                      {canCreateInvoice && billingClosureFilter === 'pending' && (
                        <button
                          type="button"
                          style={iconBtn}
                          onClick={() => {
                            setRaiseInvoicePrefill(billingPrefillFromRow(row));
                            setShowRaiseInvoice(true);
                          }}
                        >
                          Raise invoice
                        </button>
                      )}
                      {canBillingClosure && billingClosureFilter === 'pending' && (
                        <>
                          <button type="button" style={iconBtn} onClick={() => handleBillingMarkBuilt(row)}>
                            Mark as billed
                          </button>
                          <button type="button" style={iconBtn} onClick={() => handleBillingNonBillable(row)}>
                            Non-billable
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {(billingPagination.last_page || 1) > 1 && (
            <div style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, color: '#64748b' }}>
              <button
                type="button"
                style={btnSecondary}
                disabled={billingPage <= 1}
                onClick={() => setBillingPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span>
                Page {billingPage} of {Math.max(1, billingPagination.last_page || 1)} ({billingPagination.total} total)
              </span>
              <button
                type="button"
                style={btnSecondary}
                disabled={billingPage >= (billingPagination.last_page || 1)}
                onClick={() => setBillingPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
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
const modalStyle = { background:'#fff', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.18)', minWidth:480, maxWidth:560, width:'100%', maxHeight:'90vh', overflowY:'auto', overflowX:'hidden' };
const modalHeaderStyle = { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 24px', borderBottom:'1px solid #f1f5f9' };
const closeBtnStyle = { background:'none', border:'none', cursor:'pointer', fontSize:16, color:'#64748b', padding:'2px 6px', borderRadius:4 };
const labelStyle = { display:'flex', flexDirection:'column', gap:4, fontSize:12, fontWeight:600, color:'#475569', minWidth:0 };
const inputStyle = { padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, color:'#334155', outline:'none', width:'100%', maxWidth:'100%', boxSizing:'border-box' };
/** Horizontal ledger toolbars: client search stays left (overflow visible) so dropdowns aren't clipped behind the row below. */
const ledgerToolbarBarStyle = {
  padding:'8px 16px',
  borderBottom:'1px solid #f1f5f9',
  display:'flex',
  flexWrap:'nowrap',
  gap:10,
  alignItems:'center',
  position:'relative',
  zIndex: 12,
  overflow:'visible',
};
/** Overflow-x-scroll lives here only so `overflow-x: auto` does not clip autocomplete menus in the sibling client cell. */
const ledgerToolbarScrollTailStyle = { flex:'1 1 auto', minWidth:0, display:'flex', flexWrap:'nowrap', gap:10, alignItems:'center', overflowX:'auto' };
const ledgerToolbarGroupStyle = { display:'flex', alignItems:'center', gap:6, flexShrink:0 };
const ledgerToolbarLabelStyle = { fontSize:12, color:'#64748b', fontWeight:600, whiteSpace:'nowrap' };
const ledgerToolbarSelectStyle = { ...inputStyle, width:'auto', maxWidth:200, flexShrink:0, cursor:'pointer' };
const ledgerToolbarDateStyle = { ...inputStyle, width:'auto', minWidth:130, maxWidth:150, flexShrink:0 };

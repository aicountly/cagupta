import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  getTxns, getTxn, createTxn, createReceipt, createPaymentExpense, createPaymentClientCost, createTds, finalizeTds,
  createRebate, createCreditNote, getLedger, getLedgerByGroup, getBillSettlementReport, getRecoveryByGroup,
  getFinanceSummary,
  getOpeningBalance, setOpeningBalance,
  updateTxn, bulkDeleteTxns, reinstateTxn,
  requestLedgerReversalUserOtp, reverseLedgerTxn, cancelLedgerReversalTxn, assignParkedTxn,
  postInvoiceCostAnalysisPreview,
  getReceiptsWithUnallocated,
  getLedgerReconciliation,
  normalizeLedgerClassForApi,
} from '../services/txnService';
import {
  getRecoveryLogs, createRecoveryLog, updateRecoveryLog,
} from '../services/recoveryLogService';
import {
  getRecoveryStatus, markNpa, markBadDebt,
} from '../services/ledgerRecoveryStatusService';
import {
  LastUpdatedByCell, TxnAuditEyeButton, TxnAuditLogModal,
} from '../../../components/finance/TxnAuditActivity';
import PendingLedgerChangeBanner from '../../../components/finance/PendingLedgerChangeBanner';
import ServiceBillingDetailModal from '../../../components/finance/ServiceBillingDetailModal';
import { useAuth } from '../../../auth/AuthContext';
import { getContact } from '../../../services/contactService';
import { getOrganization } from '../../../services/organizationService';
import { getCategories } from '../../../services/serviceCategoryService';
import {
  getEngagements,
  getBillingReport,
  getServiceBillingInvoices,
  patchBillingClosure,
  billingReturnServiceToTeam,
} from '../../../services/engagementService';
import { EXPENSE_PURPOSE_OPTIONS, expensePurposeLabel } from '../../../constants/expensePurposes';
import { buildLedgerDetailLine } from '../../../utils/ledgerTxnDetails';
import StatusBadge from '../../../components/common/StatusBadge';
import ListPaginationBar from '../../../components/common/ListPaginationBar';
import ClientSearchDropdown from '../../../components/common/ClientSearchDropdown';
import EntitySearchDropdown from '../../../components/common/EntitySearchDropdown';
import GroupSearchDropdown from '../../../components/common/GroupSearchDropdown';
import LineItemPresetCombobox from '../../../components/common/LineItemPresetCombobox';
import DateInput from '../../../components/common/DateInput';
import DateRangeSelector from '../../../components/common/DateRangeSelector';
import AmountInput from '../../../components/common/AmountInput';
import BillingProfileSelect from '../../../components/common/BillingProfileSelect';
import BillingProfileDefaultNotice from '../../../components/common/BillingProfileDefaultNotice';
import { getBillingProfiles, getBillingProfileByCode } from '../../../constants/billingProfiles';
import { listFirmBankAccounts } from '../../../services/firmBankAccountService';
import { stateCodeFromGstin } from '../../../utils/gstUtils';
import {
  collectIndianFYStartYearsWithFallback,
  buildLedgerRowsForIndianFY,
  indianFYLabel,
  indianFYBounds,
  getIndianFyDatesToToday,
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
  payment_client_cost: { bg:'#f5f3ff', color:'#5b21b6', border:'#ddd6fe' },
  receipt_reversal: { bg:'#ecfdf5', color:'#047857', border:'#6ee7b7' },
  payment_expense_reversal: { bg:'#fff7ed', color:'#c2410c', border:'#fdba74' },
  payment_client_cost_reversal: { bg:'#faf5ff', color:'#7c3aed', border:'#e9d5ff' },
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
    payment_client_cost: 'Client cost',
    receipt_reversal: 'Receipt reversal',
    payment_expense_reversal: 'Payment reversal',
    payment_client_cost_reversal: 'Client cost reversal',
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

const LEDGER_INACTIVE_STATUSES = new Set(['cancelled', 'reversed', 'deleted']);

function ledgerTxnStatus(txn) {
  return String(txn?.status || txn?.invoiceStatus || 'active').toLowerCase();
}

function isLedgerInactive(txn) {
  return LEDGER_INACTIVE_STATUSES.has(ledgerTxnStatus(txn));
}

function isLedgerCancelled(txn) {
  return ledgerTxnStatus(txn) === 'cancelled';
}

function isLedgerEditable(txn) {
  return !isLedgerInactive(txn);
}

function ledgerRowStyle(baseStyle, txn) {
  if (!isLedgerInactive(txn)) return baseStyle;
  return {
    ...baseStyle,
    textDecoration: 'line-through',
    opacity: 0.65,
    color: '#64748b',
  };
}

function LedgerStatusBadge({ txn }) {
  const st = ledgerTxnStatus(txn);
  if (st === 'active') return <StatusBadge status="active" />;
  if (st === 'cancelled' || st === 'reversed' || st === 'deleted') return <StatusBadge status={st} />;
  return <StatusBadge status={st} />;
}

function LedgerRowActions({
  txn,
  canEdit,
  canDelete,
  onEdit,
  onCancelPrompt,
  onReinstatePrompt,
  extraBefore,
}) {
  if (isLedgerCancelled(txn)) {
    return (
      <>
        {extraBefore}
        {canDelete && (
          <button
            type="button"
            style={{ ...iconBtn, color: '#15803d' }}
            onClick={(e) => { e?.stopPropagation?.(); onReinstatePrompt(txn); }}
          >
            ↩ Reinstate
          </button>
        )}
      </>
    );
  }
  if (isLedgerInactive(txn)) {
    return extraBefore || null;
  }
  return (
    <>
      {extraBefore}
      {canEdit && (
        <button type="button" style={iconBtn} onClick={(e) => { e?.stopPropagation?.(); onEdit(txn); }}>✏️ Edit</button>
      )}
      {canDelete && (
        <button type="button" style={iconBtn} onClick={(e) => { e?.stopPropagation?.(); onCancelPrompt(txn); }}>🗑 Delete</button>
      )}
    </>
  );
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
const TXN_LIST_SEARCH_TABS = new Set(['invoices', 'receipts', 'payments', 'payment_costs', 'tds', 'rebate', 'credit_note']);

/** Shared column headers for Payments (on behalf) and Payments (costs) tables — Actions is rendered separately (sticky). */
const PAYMENT_LIST_COLUMNS = [
  'Date', 'Ref', 'Client', 'Booked on', 'Ledger type', 'Status', 'Movement',
  'Amount', 'Purpose', 'Paid via', 'Paid from', 'Reference', 'Narration', 'Billing profile', 'Notes', 'Last updated by',
];

/** Filter recovery list groups — group mode shows all ledgers in matching groups; ledger mode matches entities. */
function filterRecoveryGroups(groups, query, mode) {
  if (!Array.isArray(groups) || groups.length === 0) return [];
  const q = String(query || '').trim();
  if (!q) return groups;

  if (mode === 'group') {
    return groups.filter((g) => txnFieldsIncludeQuery(q, [g.groupLabel, g.groupKey]));
  }

  return groups
    .map((g) => {
      const entities = (g.entities || []).filter((ent) => txnFieldsIncludeQuery(q, [
        ent.displayName,
        ent.entityType === 'organization' ? 'Organization' : 'Contact',
        ent.entityType,
        ent.entityId,
        ent.groupName,
      ]));
      if (entities.length === 0) return null;
      const groupTotal = entities.reduce((sum, e) => sum + (Number(e.rowTotal) || 0), 0);
      return { ...g, entities, groupTotal: Math.round(groupTotal * 100) / 100 };
    })
    .filter(Boolean);
}

function recoveryTotalsFromGroups(groups) {
  const totals = {
    regular: { fees: 0, taxes: 0, reimbursement: 0 },
    memorandum: { fees: 0, taxes: 0, reimbursement: 0 },
    optional: { fees: 0, taxes: 0, reimbursement: 0 },
    parked: { fees: 0, taxes: 0, reimbursement: 0 },
    grand: 0,
  };
  for (const g of groups) {
    for (const ent of g.entities || []) {
      for (const slot of ['regular', 'memorandum', 'optional', 'parked']) {
        const s = ent[slot] || {};
        totals[slot].fees += Number(s.fees) || 0;
        totals[slot].taxes += Number(s.taxes) || 0;
        totals[slot].reimbursement += Number(s.reimbursement) || 0;
      }
      totals.grand += Number(ent.rowTotal) || 0;
    }
  }
  for (const slot of ['regular', 'memorandum', 'optional', 'parked']) {
    for (const f of ['fees', 'taxes', 'reimbursement']) {
      totals[slot][f] = Math.round(totals[slot][f] * 100) / 100;
    }
  }
  totals.grand = Math.round(totals.grand * 100) / 100;
  return totals;
}

const TDS_SECTIONS = ['194J','194C','194H','194I','194A','194Q','Other'];

const PAYMENT_METHOD_OPTIONS = ['NEFT', 'RTGS', 'UPI', 'Cheque', 'Cash', 'IMPS', 'Payment Gateway'];
const CASH_PAYMENT_METHOD = 'Cash';

function firmBankAccountType(bank) {
  return String(bank?.accountType || bank?.account_type || '').trim().toLowerCase();
}

function isCashFirmBankAccount(bank) {
  return firmBankAccountType(bank) === 'cash';
}

function findFirmBankAccount(banks, firmBankAccountId) {
  if (!firmBankAccountId) return null;
  return (banks || []).find((b) => String(b.id) === String(firmBankAccountId)) || null;
}

/** Cash accounts only allow Cash; bank accounts allow all methods (incl. cash deposit). */
function paymentMethodOptionsForFirmBankAccount(banks, firmBankAccountId) {
  const sel = findFirmBankAccount(banks, firmBankAccountId);
  if (sel && isCashFirmBankAccount(sel)) {
    return [CASH_PAYMENT_METHOD];
  }
  return PAYMENT_METHOD_OPTIONS;
}

function coercePaymentMethodForFirmBankAccount(method, banks, firmBankAccountId) {
  const opts = paymentMethodOptionsForFirmBankAccount(banks, firmBankAccountId);
  if (opts.length === 1) return opts[0];
  if (method && opts.includes(method)) return method;
  return opts[0];
}

const RECEIPT_NARR_PREFIX = 'Receipt — ';
const PAYMENT_NARR_PREFIX = 'Payment — ';
const CLIENT_COST_NARR_PREFIX = 'Client cost — ';

/** Update narration only when it matches the server auto-generated `{prefix}{method}` form. */
function syncStandardNarrationForMethodChange(narration, previousMethod, newMethod, prefix) {
  if (!previousMethod || previousMethod === newMethod) return narration;
  const trimmed = (narration || '').trim();
  const expected = `${prefix}${previousMethod}`;
  if (trimmed === expected) return `${prefix}${newMethod}`;
  return narration;
}

const PAYMENT_ON_BEHALF_DEFAULTS = {
  billingProfileCode: 'RBGC-JAL',
  expensePurpose: 'challan',
  method: 'Payment Gateway',
  firmBankAccountName: 'SBI',
};

function defaultFirmBankAccountId(banks, preferredName) {
  const list = (banks || []).filter((b) => b.isActive !== false);
  if (preferredName) {
    const needle = String(preferredName).trim().toLowerCase();
    const match = list.find((b) => String(b.name || '').trim().toLowerCase() === needle);
    if (match) return String(match.id);
  }
  return list[0] ? String(list[0].id) : '';
}

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
  { value: 'parked', label: 'Parked' },
];

// Extended options for the Ledger tab only — includes "All classes" consolidated view
const LEDGER_CLASS_OPTIONS_WITH_ALL = [
  { value: 'all', label: 'All classes' },
  ...LEDGER_CLASS_OPTIONS,
];

function ledgerClassLabel(value) {
  if (String(value || '').trim() === 'client_costs') return 'Client Costs';
  const v = normalizeLedgerClassForApi(value);
  if (v === 'parked') return 'Parked';
  return LEDGER_CLASS_OPTIONS.find((o) => o.value === v)?.label || v;
}

/** Resolve txn id for audit modal from a ledger or list row. */
function resolveAuditTxnId(row) {
  if (!row || row.synthetic || row.txnType === 'brought_forward') return null;
  const id = Number(row.id);
  if (id > 0) return id;
  const src = Number(row.sourceTxnId);
  return src > 0 ? src : null;
}

/** Active parked receipt/payment that can still be moved to a final client ledger. */
function isParkedLedgerEntryUnparkable(entry) {
  if (!entry || entry.synthetic) return false;
  const tt = entry.txnType || '';
  if (tt === 'opening_balance' || tt === 'brought_forward') return false;
  if (entry.status && entry.status !== 'active') return false;
  if (entry.parkedTransferTargetTxnId) return false;
  return tt === 'receipt' || tt === 'payment_expense';
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
  const [clientMasterDefaultCode, setClientMasterDefaultCode] = useState('');
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
    setClientMasterDefaultCode('');
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
      setClientMasterDefaultCode('');
      return undefined;
    }
    let cancelled = false;
    const idNum = parseInt(form.entityId, 10);
    (async () => {
      try {
        if (form.entityType === 'organization') {
          const o = await getOrganization(idNum);
          if (cancelled) return;
          setRecipientGstin((o?.gstin || '').replace(/\s/g, '').toUpperCase());
          const code = String(o?.defaultBillingProfileCode || '').trim().toUpperCase();
          const profile = code ? getBillingProfileByCode(code) : null;
          if (profile) {
            setClientMasterDefaultCode(code);
            setForm((f) => ({ ...f, billingProfileCode: code }));
          } else {
            setClientMasterDefaultCode('');
          }
        } else {
          const c = await getContact(idNum);
          if (cancelled) return;
          setRecipientGstin((c?.gstin || '').replace(/\s/g, '').toUpperCase());
          const code = String(c?.defaultBillingProfileCode || '').trim().toUpperCase();
          const profile = code ? getBillingProfileByCode(code) : null;
          if (profile) {
            setClientMasterDefaultCode(code);
            setForm((f) => ({ ...f, billingProfileCode: code }));
          } else {
            setClientMasterDefaultCode('');
          }
        }
      } catch {
        if (!cancelled) {
          setRecipientGstin('');
          setClientMasterDefaultCode('');
        }
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

  const recipientStateCode = stateCodeFromGstin(recipientGstin);
  const supplierStateCode = selectedProfile?.gstRegistered
    ? (selectedProfile.stateCode || stateCodeFromGstin(selectedProfile.gstin))
    : '';
  const supplierGstOk = Boolean(supplierStateCode && supplierStateCode.length === 2);
  const gstBlocked = Boolean(selectedProfile?.gstRegistered && !recipientStateCode);
  const clientEditPath = form.entityId
    ? (form.entityType === 'organization'
      ? `/clients/organizations/${form.entityId}/edit`
      : `/clients/contacts/${form.entityId}/edit`)
    : null;

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
        window.alert(`Cannot save this GST invoice: the bill-to client has no GSTIN (needed for place of supply). Your billing profile ${profile.code} is configured — add the client's GSTIN in CRM and try again.`);
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
          {selectedProfile?.gstRegistered && (
            <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, lineHeight: 1.55 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: '#0f172a' }}>GST requirements</div>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
                Billing firm GSTIN (Settings) is not the same as the client&apos;s GSTIN.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ padding: 8, background: supplierGstOk ? '#f0fdf4' : '#fef2f2', border: `1px solid ${supplierGstOk ? '#bbf7d0' : '#fecaca'}`, borderRadius: 6 }}>
                  <div style={{ fontWeight: 600, color: supplierGstOk ? '#166534' : '#991b1b' }}>Your firm (supplier)</div>
                  <div style={{ marginTop: 4, color: '#334155' }}>
                    {selectedProfile.code} · GSTIN {selectedProfile.gstin || '—'} · State {supplierStateCode || '—'}
                  </div>
                  {!supplierGstOk && (
                    <div style={{ marginTop: 4, color: '#991b1b' }}>Complete Billing Firms in Settings.</div>
                  )}
                </div>
                <div style={{ padding: 8, background: recipientStateCode ? '#f0fdf4' : '#fffbeb', border: `1px solid ${recipientStateCode ? '#bbf7d0' : '#fde68a'}`, borderRadius: 6 }}>
                  <div style={{ fontWeight: 600, color: recipientStateCode ? '#166534' : '#92400e' }}>Client (place of supply)</div>
                  {recipientGstin ? (
                    <div style={{ marginTop: 4, color: '#334155' }}>
                      GSTIN <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{recipientGstin}</span> · State {recipientStateCode}
                    </div>
                  ) : form.entityId ? (
                    <>
                      <div style={{ marginTop: 4, color: '#92400e' }}>
                        No GSTIN on this {form.entityType === 'organization' ? 'organization' : 'contact'} — required for place of supply.
                      </div>
                      {clientEditPath && (
                        <button
                          type="button"
                          onClick={() => window.open(clientEditPath, '_blank')}
                          style={{ marginTop: 6, padding: 0, border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 12, fontWeight: 600, textDecoration: 'underline' }}
                        >
                          Edit {form.entityType === 'organization' ? 'organization' : 'contact'} to add GSTIN
                        </button>
                      )}
                    </>
                  ) : (
                    <div style={{ marginTop: 4, color: '#64748b' }}>Select a bill-to client above.</div>
                  )}
                </div>
              </div>
            </div>
          )}
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
                {LEDGER_CLASS_OPTIONS.filter((o) => o.value !== 'parked').map((o) => (
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
                    <AmountInput
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
                <div style={{ fontWeight:700, marginBottom:4 }}>
                  GST @ {gstPreview.rate}% (preview{!gstPreview.recipient ? ', estimated' : ''})
                </div>
                <div>GST amount: ₹{gstPreview.tax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div>Invoice total: ₹{gstPreview.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                {!gstPreview.recipient ? (
                  <div style={{ marginTop: 6, color: '#b45309', fontWeight: 600 }}>
                    Place of supply unknown — add client GSTIN before saving.
                  </div>
                ) : (
                  <div style={{ marginTop:4, color:'#64748b' }}>{gstPreview.split}</div>
                )}
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
            <BillingProfileDefaultNotice
              defaultCode={clientMasterDefaultCode}
              selectedCode={form.billingProfileCode}
            />
            {selectedProfile?.gstRegistered && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                Uses this firm&apos;s GSTIN as supplier. Client GSTIN is taken from <strong>Bill to</strong> above.
              </div>
            )}
          </label>
          <label style={labelStyle}>
            Notes
            <input type="text" style={inputStyle} placeholder="Optional notes" value={form.notes} onChange={e=>set('notes',e.target.value)} />
          </label>
        </div>
        <div style={{ padding:'12px 24px 20px', display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8 }}>
          {gstBlocked && (
            <div style={{ fontSize: 11, color: '#92400e', alignSelf: 'stretch', textAlign: 'right' }}>
              Add GSTIN on the bill-to client to save a GST invoice.
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
            <button
              type="button"
              onClick={handleSave}
              disabled={gstBlocked}
              title={gstBlocked ? 'Add GSTIN on the bill-to client to save a GST invoice.' : undefined}
              style={{ ...btnPrimary, ...(gstBlocked ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
            >
              Save Invoice
            </button>
          </div>
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
  const [info, setInfo] = useState('');
  const [pendingChange, setPendingChange] = useState(null);
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
    setInfo('');
    getTxn(invoiceId)
      .then((row) => {
        if (cancelled) return;
        setPendingChange(row.pendingLedgerChange || null);
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

  async function handleSave() {
    const parsed = form.lines.map(buildLineItemApiRow).filter(Boolean);
    if (!form.txnDate || parsed.length === 0) {
      setErr('Invoice date and at least one line item are required.');
      return;
    }
    const subtotal = parsed.reduce((a, l) => a + l.amount, 0);
    setSaving(true);
    setErr('');
    setInfo('');
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
      const updated = await updateTxn(invoiceId, payload);
      if (updated?.pendingLedgerChange) {
        setPendingChange(updated.pendingLedgerChange);
        setInfo(updated.queuedMessage || 'Invoice edit submitted for Super Admin approval.');
        return;
      }
      onSaved(updated);
      onClose();
    } catch (e) {
      if (e.pendingLedgerChange) setPendingChange(e.pendingLedgerChange);
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
          {info && <div style={{ color: '#047857', fontSize: 13 }}>{info}</div>}
          <PendingLedgerChangeBanner pending={pendingChange} />
          {!loading && (
            <>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                Changes are submitted for Super Admin approval from Team Approvals unless you are signed in as Super Admin.
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
                      <AmountInput style={inputStyle} value={line.amount} onChange={(e) => setLine(idx, 'amount', e.target.value)} />
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
            </>
          )}
        </div>
        <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
          <button type="button" style={btnPrimary} disabled={loading || saving || pendingChange} onClick={handleSave}>{saving ? 'Saving…' : 'Submit for approval'}</button>
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
  const isSuperAdmin = Boolean(session?.user?.permissions?.includes('*')) || isPrimarySuperAdmin;
  const ledgerUserRevFromServer = session?.user?.ledger_user_reversal_enabled ?? LEDGER_USER_REVERSAL_ENABLED;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [row, setRow] = useState(null);
  const [pendingChange, setPendingChange] = useState(null);
  const [saving, setSaving] = useState(false);

  const [revReason, setRevReason] = useState('');
  const [revUserOtp, setRevUserOtp] = useState('');
  const [revUserOtpSent, setRevUserOtpSent] = useState(false);
  const [revRequesting, setRevRequesting] = useState(false);
  const [revReversing, setRevReversing] = useState(false);
  const [revCancelReversing, setRevCancelReversing] = useState(false);
  const [cancelRevReason, setCancelRevReason] = useState('');

  const [recTxnDate, setRecTxnDate] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recMethod, setRecMethod] = useState('NEFT');
  const [recRef, setRecRef] = useState('');
  const [recNotes, setRecNotes] = useState('');
  const [recNarr, setRecNarr] = useState('');
  const [recBankId, setRecBankId] = useState('');
  const [recBillingProfileCode, setRecBillingProfileCode] = useState('');
  const [recLedgerClass, setRecLedgerClass] = useState('regular');
  const [recMovementKind, setRecMovementKind] = useState('fees');
  const [allocLines, setAllocLines] = useState([]);

  const [payTxnDate, setPayTxnDate] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('NEFT');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payNarr, setPayNarr] = useState('');
  const [payPurpose, setPayPurpose] = useState('misc');
  const [payBankId, setPayBankId] = useState('');
  const [payLedgerClass, setPayLedgerClass] = useState('regular');
  const [payMovementKind, setPayMovementKind] = useState('fees');
  const [settleLines, setSettleLines] = useState([]);

  const [tdsTxnDate, setTdsTxnDate] = useState('');
  const [tdsAmount, setTdsAmount] = useState('');
  const [tdsNotes, setTdsNotes] = useState('');
  const [tdsNarr, setTdsNarr] = useState('');
  const [tdsSection, setTdsSection] = useState('');
  const [tdsRate, setTdsRate] = useState('');
  const [editReason, setEditReason] = useState('');

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
    setInfo('');
    setPendingChange(null);
    setRevReason('');
    setRevUserOtp('');
    setRevUserOtpSent(false);
    setEditReason('');
    setCancelRevReason('');
    setRow(null);
    getTxn(txnId)
      .then((r) => {
        if (cancelled) return;
        setRow(r);
        setPendingChange(r.pendingLedgerChange || null);
        const tt = r.txnType;
        if (tt === 'receipt' || tt === 'receipt_reversal') {
          setRecTxnDate(r.txnDate || '');
          setRecAmount(String(r.amount ?? ''));
          setRecMethod(r.paymentMethod || 'NEFT');
          setRecRef(r.referenceNumber || '');
          setRecNotes(r.notes || '');
          setRecNarr(r.narration || '');
          setRecBankId(r.firmBankAccountId != null ? String(r.firmBankAccountId) : '');
          setRecBillingProfileCode(r.billingProfileCode || '');
          setRecLedgerClass(r.ledgerClass || 'regular');
          setRecMovementKind(r.ledgerMovementKind === 'reimbursement' ? 'reimbursement' : 'fees');
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
          setPayLedgerClass(r.ledgerClass || 'regular');
          setPayMovementKind(r.ledgerMovementKind === 'reimbursement' ? 'reimbursement' : 'fees');
          const sl = (r.settlementLines && r.settlementLines.length > 0)
            ? r.settlementLines.map((x) => ({
              targetType: x.targetType || 'receipt',
              targetTxnId: x.targetTxnId || '',
              amount: String(x.amount ?? ''),
            }))
            : [{ targetType: 'unallocated_advance', targetTxnId: '', amount: String(r.amount ?? '') }];
          setSettleLines(sl);
        } else if (tt === 'payment_client_cost' || tt === 'payment_client_cost_reversal') {
          setPayTxnDate(r.txnDate || '');
          setPayAmount(String(r.amount ?? ''));
          setPayMethod(r.paymentMethod || 'NEFT');
          setPayRef(r.referenceNumber || '');
          setPayNotes(r.notes || '');
          setPayNarr(r.narration || '');
          setPayPurpose(r.expensePurpose || 'misc');
          setPayBankId(r.firmBankAccountId != null ? String(r.firmBankAccountId) : '');
          setPayLedgerClass(r.ledgerClass || 'client_costs');
          setPayMovementKind(r.ledgerMovementKind === 'reimbursement' ? 'reimbursement' : 'fees');
          setSettleLines([]);
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

  const receiptOrPaymentEdit = row
    && (row.txnType === 'receipt'
      || row.txnType === 'receipt_reversal'
      || row.txnType === 'payment_expense'
      || row.txnType === 'payment_expense_reversal'
      || row.txnType === 'payment_client_cost'
      || row.txnType === 'payment_client_cost_reversal');

  const bankListProfileCode = (row?.txnType === 'receipt' || row?.txnType === 'receipt_reversal')
    ? recBillingProfileCode
    : row?.billingProfileCode;

  useEffect(() => {
    if (!receiptOrPaymentEdit) return undefined;
    const code = bankListProfileCode;
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
        if (row?.txnType === 'receipt' || row?.txnType === 'receipt_reversal') {
          setRecBankId((prev) => {
            if (!prev) return prev;
            return list.some((b) => String(b.id) === String(prev)) ? prev : '';
          });
        } else if (row?.txnType === 'payment_expense' || row?.txnType === 'payment_expense_reversal'
          || row?.txnType === 'payment_client_cost' || row?.txnType === 'payment_client_cost_reversal') {
          setPayBankId((prev) => {
            if (!prev) return prev;
            return list.some((b) => String(b.id) === String(prev)) ? prev : '';
          });
        }
      })
      .finally(() => {
        if (!cancelled) setBanksLoading(false);
      });
    return () => { cancelled = true; };
  }, [receiptOrPaymentEdit, bankListProfileCode, row?.txnType]);

  useEffect(() => {
    if (!recBankId) return undefined;
    setRecMethod((prevMethod) => {
      const coerced = coercePaymentMethodForFirmBankAccount(prevMethod, banks, recBankId);
      if (coerced !== prevMethod) {
        setRecNarr((narr) => syncStandardNarrationForMethodChange(narr, prevMethod, coerced, RECEIPT_NARR_PREFIX));
      }
      return coerced;
    });
    return undefined;
  }, [recBankId, banks]);

  useEffect(() => {
    if (!payBankId) return undefined;
    setPayMethod((prevMethod) => {
      const coerced = coercePaymentMethodForFirmBankAccount(prevMethod, banks, payBankId);
      if (coerced !== prevMethod) {
        const prefix = row?.txnType === 'payment_client_cost' || row?.txnType === 'payment_client_cost_reversal'
          ? CLIENT_COST_NARR_PREFIX
          : PAYMENT_NARR_PREFIX;
        setPayNarr((narr) => syncStandardNarrationForMethodChange(narr, prevMethod, coerced, prefix));
      }
      return coerced;
    });
    return undefined;
  }, [payBankId, banks, row?.txnType]);

  const withinUserRevWindow = row && row.createdAt
    && Number.isFinite(new Date(row.createdAt).getTime())
    && new Date(row.createdAt).getTime() >= Date.now() - 30 * 86400000;
  const userRevEligible = ledgerUserRevFromServer && withinUserRevWindow && row?.status === 'active';
  const needsReverseApproval = row?.status === 'active' && !isPrimarySuperAdmin && !userRevEligible;
  const userCancelRevEligible = ledgerUserRevFromServer && withinUserRevWindow && row?.status === 'reversed';
  const needsCancelRevApproval = row?.status === 'reversed' && !isPrimarySuperAdmin && !userCancelRevEligible;
  const ledgerEditCancelled = row && isLedgerCancelled(row);
  const ledgerEditReversed = row && row.status === 'reversed';
  const isCompensatingReversalRow = row
    && ['receipt_reversal', 'payment_expense_reversal', 'tds_reversal'].includes(row.txnType);
  const isParkedAssignable = row
    && row.ledgerClass === 'parked'
    && row.status === 'active'
    && (row.txnType === 'receipt' || row.txnType === 'payment_expense');

  const [assignEntityId, setAssignEntityId] = useState('');
  const [assignEntityName, setAssignEntityName] = useState('');
  const [assignEntityType, setAssignEntityType] = useState('contact');
  const [assignLedgerClass, setAssignLedgerClass] = useState('regular');
  const [assignMovementKind, setAssignMovementKind] = useState('fees');
  const [assignNotes, setAssignNotes] = useState('');
  const [assigning, setAssigning] = useState(false);

  async function handleAssignParked() {
    setErr('');
    if (!assignEntityId) {
      setErr('Select the target client or organization.');
      return;
    }
    setAssigning(true);
    try {
      const payload = {
        target_ledger_class: assignLedgerClass,
        target_ledger_movement_kind: assignMovementKind,
        notes: assignNotes.trim() || undefined,
      };
      if (assignEntityType === 'organization') {
        payload.target_organization_id = parseInt(assignEntityId, 10);
      } else {
        payload.target_client_id = parseInt(assignEntityId, 10);
      }
      await assignParkedTxn(txnId, payload);
      onSaved?.({});
      onClose();
    } catch (e) {
      setErr(e.message || 'Unpark failed.');
    } finally {
      setAssigning(false);
    }
  }

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
    setRevReversing(true);
    setErr('');
    setInfo('');
    try {
      const result = await reverseLedgerTxn(txnId, { reason });
      if (result?.pendingLedgerChange) {
        setPendingChange(result.pendingLedgerChange);
        setInfo(result.queuedMessage || 'Reversal submitted for Super Admin approval.');
        return;
      }
      onSaved?.({});
      onClose();
    } catch (e) {
      if (e.pendingLedgerChange) setPendingChange(e.pendingLedgerChange);
      setErr(e.message || 'Reversal failed.');
    } finally {
      setRevReversing(false);
    }
  }

  async function handleCancelLedgerReversal() {
    setErr('');
    if (isPrimarySuperAdmin) {
      setRevCancelReversing(true);
      try {
        await cancelLedgerReversalTxn(txnId, {});
        onSaved?.({});
        onClose();
      } catch (e) {
        setErr(e.message || 'Cancel reversal failed.');
      } finally {
        setRevCancelReversing(false);
      }
      return;
    }
    if (userCancelRevEligible) {
      const uo = revUserOtp.trim();
      if (!uo) {
        setErr('Enter the verification code sent to your email.');
        return;
      }
      setRevCancelReversing(true);
      try {
        await cancelLedgerReversalTxn(txnId, { otp: uo });
        onSaved?.({});
        onClose();
      } catch (e) {
        setErr(e.message || 'Cancel reversal failed.');
      } finally {
        setRevCancelReversing(false);
      }
      return;
    }
    setRevCancelReversing(true);
    setErr('');
    setInfo('');
    const reason = cancelRevReason.trim();
    if (!reason) {
      setErr('Please enter a reason for cancel reversal.');
      setRevCancelReversing(false);
      return;
    }
    try {
      const result = await cancelLedgerReversalTxn(txnId, { request_reason: reason });
      if (result?.pendingLedgerChange) {
        setPendingChange(result.pendingLedgerChange);
        setInfo(result.queuedMessage || 'Cancel reversal submitted for Super Admin approval.');
        return;
      }
      onSaved?.({});
      onClose();
    } catch (e) {
      if (e.pendingLedgerChange) setPendingChange(e.pendingLedgerChange);
      setErr(e.message || 'Cancel reversal failed.');
    } finally {
      setRevCancelReversing(false);
    }
  }

  async function handleSave() {
    setErr('');
    setInfo('');
    if (!row) return;
    const reason = editReason.trim();
    if (!reason) {
      setErr('Please enter a reason for this change.');
      return;
    }
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
        if (!recBillingProfileCode) throw new Error('Select billing profile.');
        payload = {
          txn_date: recTxnDate,
          amount,
          payment_method: recMethod,
          reference_number: recRef || null,
          notes: recNotes || null,
          narration: recNarr || null,
          billing_profile_code: recBillingProfileCode,
          firm_bank_account_id: bankId,
          ledger_class: normalizeLedgerClassForApi(recLedgerClass),
          ledger_movement_kind: recMovementKind === 'reimbursement' ? 'reimbursement' : 'fees',
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
          ledger_class: normalizeLedgerClassForApi(payLedgerClass),
          ledger_movement_kind: payMovementKind === 'reimbursement' ? 'reimbursement' : 'fees',
          settlement_lines,
        };
      } else if (tt === 'payment_client_cost' || tt === 'payment_client_cost_reversal') {
        const amount = parseFloat(payAmount);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid payment amount.');
        const bankId = parseInt(payBankId, 10);
        if (!bankId) throw new Error('Select bank / cash account.');
        payload = {
          txn_date: payTxnDate,
          amount,
          payment_method: payMethod,
          reference_number: payRef || null,
          notes: payNotes || null,
          narration: payNarr || null,
          expense_purpose: payPurpose,
          firm_bank_account_id: bankId,
          ledger_movement_kind: payMovementKind === 'reimbursement' ? 'reimbursement' : 'fees',
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
      payload.request_reason = reason;
      const updated = await updateTxn(txnId, payload);
      if (updated?.pendingLedgerChange) {
        setPendingChange(updated.pendingLedgerChange);
        setInfo(updated.queuedMessage || 'Edit submitted for Super Admin approval.');
        return;
      }
      onSaved(updated);
      onClose();
    } catch (e) {
      if (e.pendingLedgerChange) setPendingChange(e.pendingLedgerChange);
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
            : row.txnType === 'payment_client_cost'
              ? '✏️ Edit client cost payment'
              : row.txnType === 'payment_client_cost_reversal'
                ? '✏️ Edit client cost (reversal)'
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
          {info && <div style={{ color: '#047857', fontSize: 13 }}>{info}</div>}
          <PendingLedgerChangeBanner pending={pendingChange} />
          {!loading && row && ledgerEditCancelled && (
            <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#991b1b' }}>
              This transaction is cancelled and cannot be edited. Use <strong>Reinstate</strong> from the list to restore it to active.
            </div>
          )}
          {!loading && row && !ledgerEditCancelled && (
            <>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                Edits and reversals outside the 30-day self-service window are submitted to Team Approvals for Super Admin.
              </p>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {row.clientName || 'Unknown'} · Ref {row.publicRef || '—'} · Billing {row.billingProfileCode || '—'} · Status {row.status || 'active'}
              </div>
              {ledgerEditReversed && (
                <div style={{ padding: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
                  This posting is reversed and cannot be edited. Use <strong>Cancel reversal</strong> below to restore it to active.
                </div>
              )}
              {!ledgerEditReversed && (
              <>
              {(row.txnType === 'receipt' || row.txnType === 'receipt_reversal') && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <label style={labelStyle}>
                      Ledger type
                      {row.ledgerClass === 'parked' ? (
                        <input type="text" style={{ ...inputStyle, background: '#f8fafc' }} value="Parked" readOnly />
                      ) : (
                        <select
                          style={inputStyle}
                          value={recLedgerClass}
                          onChange={(e) => {
                            const lc = e.target.value;
                            setRecLedgerClass(lc);
                            if (lc === 'parked') {
                              setAllocLines([{ targetType: 'unallocated_advance', targetTxnId: '', amount: recAmount }]);
                            } else {
                              setAllocLines([{ targetType: 'invoice', targetTxnId: '', amount: '' }]);
                            }
                          }}
                        >
                          {LEDGER_CLASS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      )}
                    </label>
                    <label style={labelStyle}>
                      Ledger view
                      <select style={inputStyle} value={recMovementKind} onChange={(e) => setRecMovementKind(e.target.value)}>
                        {LEDGER_MOVEMENT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <label style={labelStyle}>
                      Receipt date *
                      <DateInput style={inputStyle} value={recTxnDate} onChange={(e) => setRecTxnDate(e.target.value)} />
                    </label>
                    <label style={labelStyle}>
                      Amount (₹) *
                      <AmountInput style={inputStyle} value={recAmount} onChange={(e) => setRecAmount(e.target.value)} />
                    </label>
                  </div>
                  <label style={labelStyle}>
                    Billing profile *
                    <BillingProfileSelect
                      style={inputStyle}
                      value={recBillingProfileCode}
                      onChange={(code) => setRecBillingProfileCode(code)}
                    />
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <label style={labelStyle}>
                      Payment method
                      <select
                        style={inputStyle}
                        value={recMethod}
                        onChange={(e) => {
                          const newMethod = e.target.value;
                          setRecNarr((narr) => syncStandardNarrationForMethodChange(narr, recMethod, newMethod, RECEIPT_NARR_PREFIX));
                          setRecMethod(newMethod);
                        }}
                        disabled={paymentMethodOptionsForFirmBankAccount(banks, recBankId).length === 1}
                      >
                        {paymentMethodOptionsForFirmBankAccount(banks, recBankId).map((m) => (
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
                      onChange={(e) => {
                        const bankId = e.target.value;
                        setRecBankId(bankId);
                        setRecMethod((m) => {
                          const coerced = coercePaymentMethodForFirmBankAccount(m, banks, bankId);
                          setRecNarr((narr) => syncStandardNarrationForMethodChange(narr, m, coerced, RECEIPT_NARR_PREFIX));
                          return coerced;
                        });
                      }}
                      disabled={!recBillingProfileCode || banksLoading}
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
                        <AmountInput style={inputStyle} placeholder="₹" value={line.amount} onChange={(e) => patchAllocLine(idx, { amount: e.target.value })} />
                        <button type="button" style={{ ...iconBtn, alignSelf: 'start' }} onClick={() => removeAllocLineRow(idx)} title="Remove">−</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {(row.txnType === 'payment_expense' || row.txnType === 'payment_expense_reversal'
                || row.txnType === 'payment_client_cost' || row.txnType === 'payment_client_cost_reversal') && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <label style={labelStyle}>
                      Ledger type
                      {(row.txnType === 'payment_client_cost' || row.txnType === 'payment_client_cost_reversal') ? (
                        <input type="text" style={{ ...inputStyle, background: '#f8fafc' }} value="Client Costs" readOnly />
                      ) : row.ledgerClass === 'parked' ? (
                        <input type="text" style={{ ...inputStyle, background: '#f8fafc' }} value="Parked" readOnly />
                      ) : (
                        <select
                          style={inputStyle}
                          value={payLedgerClass}
                          onChange={(e) => {
                            const lc = e.target.value;
                            setPayLedgerClass(lc);
                            if (lc === 'parked') {
                              setSettleLines([{ targetType: 'unallocated_advance', targetTxnId: '', amount: payAmount }]);
                            } else {
                              setSettleLines([{ targetType: 'receipt', targetTxnId: '', amount: '' }]);
                            }
                          }}
                        >
                          {LEDGER_CLASS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      )}
                    </label>
                    <label style={labelStyle}>
                      Ledger view
                      <select style={inputStyle} value={payMovementKind} onChange={(e) => setPayMovementKind(e.target.value)}>
                        {LEDGER_MOVEMENT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <label style={labelStyle}>
                      Date *
                      <DateInput style={inputStyle} value={payTxnDate} onChange={(e) => setPayTxnDate(e.target.value)} />
                    </label>
                    <label style={labelStyle}>
                      Amount (₹) *
                      <AmountInput style={inputStyle} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
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
                      <select
                        style={inputStyle}
                        value={payMethod}
                        onChange={(e) => {
                          const newMethod = e.target.value;
                          const prefix = (row.txnType === 'payment_client_cost' || row.txnType === 'payment_client_cost_reversal')
                            ? CLIENT_COST_NARR_PREFIX
                            : PAYMENT_NARR_PREFIX;
                          setPayNarr((narr) => syncStandardNarrationForMethodChange(narr, payMethod, newMethod, prefix));
                          setPayMethod(newMethod);
                        }}
                        disabled={paymentMethodOptionsForFirmBankAccount(banks, payBankId).length === 1}
                      >
                        {paymentMethodOptionsForFirmBankAccount(banks, payBankId).map((m) => (
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
                      onChange={(e) => {
                        const bankId = e.target.value;
                        setPayBankId(bankId);
                        setPayMethod((m) => {
                          const coerced = coercePaymentMethodForFirmBankAccount(m, banks, bankId);
                          const prefix = (row.txnType === 'payment_client_cost' || row.txnType === 'payment_client_cost_reversal')
                            ? CLIENT_COST_NARR_PREFIX
                            : PAYMENT_NARR_PREFIX;
                          setPayNarr((narr) => syncStandardNarrationForMethodChange(narr, m, coerced, prefix));
                          return coerced;
                        });
                      }}
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
                  {(row.txnType === 'payment_expense' || row.txnType === 'payment_expense_reversal') && (
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
                        <AmountInput style={inputStyle} placeholder="₹" value={line.amount} onChange={(e) => patchSettleLine(idx, { amount: e.target.value })} />
                        <button type="button" style={{ ...iconBtn, alignSelf: 'start' }} onClick={() => removeSettleLineRow(idx)} title="Remove">−</button>
                      </div>
                    ))}
                  </div>
                  )}
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
                      <AmountInput style={inputStyle} value={tdsAmount} onChange={(e) => setTdsAmount(e.target.value)} />
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <label style={labelStyle}>
                      Section
                      <input type="text" style={inputStyle} value={tdsSection} onChange={(e) => setTdsSection(e.target.value)} />
                    </label>
                    <label style={labelStyle}>
                      Rate %
                      <AmountInput style={inputStyle} value={tdsRate} onChange={(e) => setTdsRate(e.target.value)} />
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
              {!isCompensatingReversalRow && isParkedAssignable && (
              <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 16, paddingTop: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Unpark</div>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px', lineHeight: 1.45 }}>
                  Reverses this parked entry on today&apos;s date and recreates it on the target client with the original transaction date (full unallocated advance).
                </p>
                <label style={labelStyle}>
                  Target client / organization *
                  <EntitySearchDropdown
                    value={assignEntityId}
                    displayValue={assignEntityName}
                    entityType={assignEntityType}
                    onChange={(c) => {
                      setAssignEntityId(String(c.id));
                      setAssignEntityName(c.displayName);
                      setAssignEntityType(c.entityType);
                    }}
                    placeholder="Search final client…"
                  />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 10 }}>
                  <label style={labelStyle}>
                    Target ledger type *
                    <select style={inputStyle} value={assignLedgerClass} onChange={(e) => setAssignLedgerClass(e.target.value)}>
                      {LEDGER_CLASS_OPTIONS.filter((o) => o.value !== 'parked').map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                  <label style={labelStyle}>
                    Target ledger view *
                    <select style={inputStyle} value={assignMovementKind} onChange={(e) => setAssignMovementKind(e.target.value)}>
                      {LEDGER_MOVEMENT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label style={{ ...labelStyle, marginTop: 10 }}>
                  Notes (optional)
                  <input type="text" style={inputStyle} value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} />
                </label>
                <button
                  type="button"
                  style={{ ...btnPrimary, marginTop: 10 }}
                  disabled={assigning || loading || !row}
                  onClick={handleAssignParked}
                >
                  {assigning ? 'Unparking…' : 'Unpark'}
                </button>
              </div>
              )}
              </>
              )}
              {row?.parkedTransferTarget && (
                <div style={{ marginTop: 12, padding: 10, background: '#ecfdf5', borderRadius: 8, fontSize: 12, color: '#047857' }}>
                  Assigned to {row.parkedTransferTarget.publicRef || `#${row.parkedTransferTarget.id}`}
                  {' '}({ledgerClassLabel(row.parkedTransferTarget.ledgerClass)}, {row.parkedTransferTarget.ledgerMovementKind || 'fees'})
                  {' '}on {row.parkedTransferTarget.txnDate || '—'}
                </div>
              )}
              {row?.parkedTransferSource && (
                <div style={{ marginTop: 12, padding: 10, background: '#fffbeb', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                  Source parked entry: {row.parkedTransferSource.publicRef || `#${row.parkedTransferSource.id}`}
                  {' '}({row.parkedTransferSource.txnDate || '—'})
                </div>
              )}
              {!isCompensatingReversalRow && row?.ledgerClass !== 'parked' && (
              <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 16, paddingTop: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Reverse this posting</div>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px', lineHeight: 1.45 }}>
                  Inserts a compensating ledger row and marks the original as reversed (audit trail). Does not replace edit/delete above.
                </p>
                {needsReverseApproval && (
                  <p style={{ fontSize: 12, color: '#b45309', margin: '0 0 10px', lineHeight: 1.45 }}>
                    Outside the 30-day self-service window — reversal will be submitted for Super Admin approval.
                  </p>
                )}
                <label style={labelStyle}>
                  Reversal reason (min 10 characters) *
                  <textarea
                    style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                    value={revReason}
                    onChange={(e) => setRevReason(e.target.value)}
                    placeholder="Document why this posting is reversed…"
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
                <button
                  type="button"
                  style={{
                    ...btnSecondary,
                    marginTop: 8,
                    background: '#7f1d1d',
                    color: '#fff',
                    border: '1px solid #450a0a',
                  }}
                  disabled={revReversing || loading || !row || row.status !== 'active' || pendingChange}
                  onClick={handleReverseLedger}
                >
                  {revReversing ? 'Submitting…' : (needsReverseApproval ? 'Submit reversal for approval' : 'Reverse transaction')}
                </button>
                {row.status === 'reversed' && (
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed #cbd5e1' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Cancel ledger reversal</div>
                    <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px', lineHeight: 1.45 }}>
                      Restores this posting to <strong>active</strong> and drops the compensating reversal from the ledger.
                      On-behalf payments: settlement links are <strong>not</strong> restored automatically — re-link from receipts if needed.
                      Receipt reversals cannot be cancelled here (invoice allocations were cleared).
                    </p>
                    {needsCancelRevApproval && (
                      <p style={{ fontSize: 12, color: '#b45309', margin: '0 0 10px', lineHeight: 1.45 }}>
                        Outside the 30-day self-service window — cancel reversal will be submitted for Super Admin approval.
                      </p>
                    )}
                    {needsCancelRevApproval && (
                      <label style={labelStyle}>
                        Reason for cancel reversal (required) *
                        <textarea
                          style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                          rows={2}
                          value={cancelRevReason}
                          onChange={(e) => setCancelRevReason(e.target.value)}
                          placeholder="Explain why this reversal should be cancelled"
                        />
                      </label>
                    )}
                    {userCancelRevEligible && (
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
                    <button
                      type="button"
                      style={{
                        ...btnSecondary,
                        marginTop: 10,
                        background: '#14532d',
                        color: '#fff',
                        border: '1px solid #052e16',
                      }}
                      disabled={
                        revCancelReversing || loading || !row || row.status !== 'reversed' || pendingChange
                        || (needsCancelRevApproval && !cancelRevReason.trim())
                      }
                      onClick={handleCancelLedgerReversal}
                    >
                      {revCancelReversing ? 'Submitting…' : (needsCancelRevApproval ? 'Submit cancel reversal for approval' : 'Cancel reversal')}
                    </button>
                  </div>
                )}
              </div>
              )}
            </>
          )}
          {!loading && row && !ledgerEditCancelled && (
            <label style={labelStyle}>
              Reason for change *
              <textarea
                style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Explain why this ledger entry is being edited"
                disabled={!!pendingChange || ledgerEditReversed}
              />
            </label>
          )}
        </div>
        <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
          {!ledgerEditCancelled && (
            <button type="button" style={btnPrimary} disabled={loading || saving || !row || pendingChange || ledgerEditReversed} onClick={handleSave}>{saving ? 'Saving…' : (isSuperAdmin ? 'Save changes' : 'Submit for approval')}</button>
          )}
        </div>
      </div>
    </div>
  );
}


/** Single or bulk ledger cancel (soft-delete): staff submit to Team Approvals. Rows stay for audit. */
function LedgerDeleteModal({ title, items, onClose, onDeleted }) {
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [requestReason, setRequestReason] = useState('');
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const isPlural = items.length !== 1;
  const heading = title || (isPlural ? `Cancel ${items.length} ledger records` : 'Cancel ledger record');

  async function confirmDelete() {
    const reason = requestReason.trim();
    if (!reason) {
      setErr('Please enter a reason for this cancellation.');
      return;
    }
    setDeleting(true);
    setErr('');
    setInfo('');
    try {
      const raw = await bulkDeleteTxns(ids, { request_reason: reason });
      if (raw?.pendingLedgerChange) {
        setInfo(raw.queuedMessage || 'Cancellation submitted for Super Admin approval.');
        return;
      }
      const removed = Array.isArray(raw?.txn_ids) ? raw.txn_ids : ids;
      onDeleted(removed);
      onClose();
    } catch (e) {
      setErr(e.message || 'Cancellation failed.');
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
              <>
                Cancel <strong>{items.length}</strong> selected ledger posting(s). They will disappear from the active ledger but{' '}
                <strong>remain in the database for audit</strong> (RCP-/PAY- refs can be reused).
              </>
            ) : (
              <>
                Cancel <strong>{items[0]?.label || `#${items[0]?.id}`}</strong>? Removed from the active ledger; row retained for audit.
              </>
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
            Cancellation is submitted for Super Admin approval from Team Approvals (unless you are Super Admin).
          </p>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginTop: 8 }}>
            Reason for cancellation (required) *
            <textarea
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
              rows={3}
              placeholder="Explain why these ledger records should be cancelled"
              style={{ ...inputStyle, width: '100%', marginTop: 6, minHeight: 72, resize: 'vertical' }}
              disabled={deleting || !!info}
            />
          </label>
          {err && <div style={{ color: '#dc2626', fontSize: 13 }}>{err}</div>}
          {info && <div style={{ color: '#047857', fontSize: 13 }}>{info}</div>}
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
            disabled={deleting || !!info || !requestReason.trim()}
            onClick={confirmDelete}
            style={{ ...btnPrimary, background: deleting || info ? '#cbd5e1' : '#b91c1c', cursor: deleting || info ? 'default' : 'pointer' }}
          >
            {deleting ? 'Submitting…' : (info ? 'Submitted' : (isPlural ? `Submit cancel for approval (${items.length})` : 'Submit cancel for approval'))}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Reinstate a cancelled ledger posting (staff queue for Team Approvals). */
function LedgerReinstateModal({ title, items, onClose, onReinstated }) {
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestReason, setRequestReason] = useState('');
  const item = items[0];
  const heading = title || 'Reinstate ledger record';

  async function confirmReinstate() {
    const reason = requestReason.trim();
    if (!reason) {
      setErr('Please enter a reason for this reinstate.');
      return;
    }
    setSubmitting(true);
    setErr('');
    setInfo('');
    try {
      const raw = await reinstateTxn(item.id, { request_reason: reason });
      if (raw?.pendingLedgerChange) {
        setInfo(raw.queuedMessage || 'Reinstate submitted for Super Admin approval.');
        return;
      }
      onReinstated(item.id, raw);
      onClose();
    } catch (e) {
      setErr(e.message || 'Reinstate failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ ...overlayStyle, zIndex: 10100 }}>
      <div style={{ ...modalStyle, display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden', zIndex: 1 }}>
        <div style={modalHeaderStyle}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#15803d' }}>{heading}</span>
          <button type="button" onClick={() => !submitting && onClose()} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 13, color: '#334155', margin: 0 }}>
            Restore <strong>{item?.label || `#${item?.id}`}</strong> to <strong>active</strong> on the ledger.
            Receipts are restored as full unallocated advance; invoice/settlement links are not auto-restored.
          </p>
          <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
            Reinstate is submitted for Super Admin approval from Team Approvals (unless you are Super Admin).
          </p>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginTop: 8 }}>
            Reason for reinstate (required) *
            <textarea
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
              rows={3}
              placeholder="Explain why this cancelled posting should be active again"
              style={{ ...inputStyle, width: '100%', marginTop: 6, minHeight: 72, resize: 'vertical' }}
              disabled={submitting || !!info}
            />
          </label>
          {err && <div style={{ color: '#dc2626', fontSize: 13 }}>{err}</div>}
          {info && <div style={{ color: '#047857', fontSize: 13 }}>{info}</div>}
        </div>
        <div style={{ flexShrink: 0, padding: '12px 24px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#fff' }}>
          <button type="button" disabled={submitting} onClick={onClose} style={btnSecondary}>Cancel</button>
          <button
            type="button"
            disabled={submitting || !!info || !requestReason.trim()}
            onClick={confirmReinstate}
            style={{ ...btnPrimary, background: submitting || info ? '#cbd5e1' : '#15803d', cursor: submitting || info ? 'default' : 'pointer' }}
          >
            {submitting ? 'Submitting…' : (info ? 'Submitted' : 'Submit reinstate for approval')}
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
          if (f.firmBankAccountId && list.some((b) => String(b.id) === String(f.firmBankAccountId))) {
            return {
              ...f,
              method: coercePaymentMethodForFirmBankAccount(f.method, list, f.firmBankAccountId),
            };
          }
          const newBankId = list[0] ? String(list[0].id) : '';
          return {
            ...f,
            firmBankAccountId: newBankId,
            method: coercePaymentMethodForFirmBankAccount(f.method, list, newBankId),
          };
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
              <AmountInput style={inputStyle} placeholder="e.g. 5900" value={form.amount} onChange={e=>set('amount',e.target.value)} />
            </label>
            <label style={labelStyle}>
              Payment Date
              <DateInput style={inputStyle} value={form.paymentDate} onChange={e=>set('paymentDate',e.target.value)} />
            </label>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <label style={labelStyle}>
              Payment Method
              <select
                style={inputStyle}
                value={form.method}
                onChange={(e) => set('method', e.target.value)}
                disabled={paymentMethodOptionsForFirmBankAccount(banks, form.firmBankAccountId).length === 1}
              >
                {paymentMethodOptionsForFirmBankAccount(banks, form.firmBankAccountId).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
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
              onChange={(e) => {
                const bankId = e.target.value;
                setForm((f) => ({
                  ...f,
                  firmBankAccountId: bankId,
                  method: coercePaymentMethodForFirmBankAccount(f.method, banks, bankId),
                }));
              }}
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
    expensePurpose: PAYMENT_ON_BEHALF_DEFAULTS.expensePurpose,
    method: PAYMENT_ON_BEHALF_DEFAULTS.method,
    referenceNumber: '',
    billingProfileCode: PAYMENT_ON_BEHALF_DEFAULTS.billingProfileCode,
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
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => {
    setErr('');
    setForm((f) => ({ ...f, [k]: v }));
  };

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
          if (f.firmBankAccountId && list.some((b) => String(b.id) === String(f.firmBankAccountId))) {
            return {
              ...f,
              method: coercePaymentMethodForFirmBankAccount(f.method, list, f.firmBankAccountId),
            };
          }
          const newBankId = defaultFirmBankAccountId(list, PAYMENT_ON_BEHALF_DEFAULTS.firmBankAccountName);
          return {
            ...f,
            firmBankAccountId: newBankId,
            method: coercePaymentMethodForFirmBankAccount(f.method, list, newBankId),
          };
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
  const isParkedPayment = form.ledgerClass === 'parked';

  const handleSave = async () => {
    setErr('');
    if (!form.entityId) {
      setErr('Select a client (contact or organization).');
      return;
    }
    if (!form.amount?.trim()) {
      setErr('Enter a valid payment amount greater than zero.');
      return;
    }
    const total = parseFloat(form.amount);
    if (Number.isNaN(total) || total <= 0) {
      setErr('Enter a valid payment amount greater than zero.');
      return;
    }
    if (!form.txnDate) {
      setErr('Payment date is required.');
      return;
    }
    if (!form.description.trim()) {
      setErr('Description (shown on ledger) is required.');
      return;
    }
    if (!form.billingProfileCode) {
      setErr('Select a billing profile.');
      return;
    }
    if (!form.firmBankAccountId) {
      setErr('Select a bank / cash account.');
      return;
    }
    const lines = isParkedPayment
      ? [{ target_type: 'unallocated_advance', amount: total }]
      : settlementLines.map((l) => ({
        target_type: l.targetType,
        target_txn_id: l.targetType === 'receipt' ? (parseInt(l.targetTxnId, 10) || 0) : undefined,
        amount: parseFloat(l.amount) || 0,
      })).filter((l) => l.amount > 0);
    if (lines.length === 0) {
      setErr('Add at least one settlement line with a positive amount.');
      return;
    }
    const sum = lines.reduce((s, l) => s + l.amount, 0);
    if (Math.abs(sum - total) > 0.02) {
      setErr(`Allocation lines must sum to the payment amount (₹${total.toFixed(2)}); currently ₹${sum.toFixed(2)}.`);
      return;
    }
    for (const l of lines) {
      if (l.target_type === 'receipt' && (!l.target_txn_id || l.target_txn_id <= 0)) {
        setErr('Select a client receipt for each receipt line, or switch the line to Unallocated advance.');
        return;
      }
    }
    setSaving(true);
    try {
      await onSave({ ...form, settlementLines: lines });
      onClose();
    } catch (e) {
      setErr(e?.message || 'Could not save payment on behalf.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 580 }}>
        <div style={modalHeaderStyle}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>💳 Payment on behalf of client</span>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <div style={{ color: '#dc2626', fontSize: 13 }}>{err}</div>}
          <label style={labelStyle}>
            Client (contact or organization)
            <EntitySearchDropdown
              value={form.entityId}
              displayValue={form.entityName}
              entityType={form.entityType}
              onChange={(c) => {
                setErr('');
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
              <AmountInput style={inputStyle} placeholder="e.g. 2500" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
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
              <select
                style={inputStyle}
                value={form.method}
                onChange={(e) => set('method', e.target.value)}
                disabled={paymentMethodOptionsForFirmBankAccount(banks, form.firmBankAccountId).length === 1}
              >
                {paymentMethodOptionsForFirmBankAccount(banks, form.firmBankAccountId).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
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
                onChange={(e) => {
                  const bankId = e.target.value;
                  setErr('');
                  setForm((f) => ({
                    ...f,
                    firmBankAccountId: bankId,
                    method: coercePaymentMethodForFirmBankAccount(f.method, banks, bankId),
                  }));
                }}
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
            {isParkedPayment ? (
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>
                Parked payments are recorded as unallocated advance only. Assign to the final client from the Parked ledger when ready.
              </div>
            ) : (
            <>
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
                <AmountInput
                  style={inputStyle}
                  placeholder="₹"
                  value={line.amount}
                  onChange={(e) => setSettleLine(idx, { amount: e.target.value })}
                />
                <button type="button" onClick={() => removeSettleLine(idx)} style={{ ...iconBtn, alignSelf: 'start' }} title="Remove line">−</button>
              </div>
            ))}
            </>
            )}
          </div>
        </div>
        <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose} style={btnSecondary} disabled={saving}>Cancel</button>
          <button type="button" onClick={handleSave} style={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Save payment'}</button>
        </div>
      </div>
    </div>
  );
}

// ── PaymentClientCostModal (bundled-in-fee expenses; non-recoverable) ───────

function PaymentClientCostModal({ onClose, onSave }) {
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
    ledgerMovementKind: 'fees',
  });
  const [banks, setBanks] = useState([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => {
    setErr('');
    setForm((f) => ({ ...f, [k]: v }));
  };

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
          if (f.firmBankAccountId && list.some((b) => String(b.id) === String(f.firmBankAccountId))) {
            return {
              ...f,
              method: coercePaymentMethodForFirmBankAccount(f.method, list, f.firmBankAccountId),
            };
          }
          const newBankId = list[0] ? String(list[0].id) : '';
          return {
            ...f,
            firmBankAccountId: newBankId,
            method: coercePaymentMethodForFirmBankAccount(f.method, list, newBankId),
          };
        });
      })
      .catch(() => { if (!cancel) setBanks([]); })
      .finally(() => { if (!cancel) setBanksLoading(false); });
    return () => { cancel = true; };
  }, [form.billingProfileCode]);

  const handleSave = async () => {
    setErr('');
    if (!form.entityId) {
      setErr('Select a client (contact or organization).');
      return;
    }
    if (!form.amount?.trim()) {
      setErr('Enter a valid payment amount greater than zero.');
      return;
    }
    const total = parseFloat(form.amount);
    if (Number.isNaN(total) || total <= 0) {
      setErr('Enter a valid payment amount greater than zero.');
      return;
    }
    if (!form.txnDate) {
      setErr('Payment date is required.');
      return;
    }
    if (!form.description.trim()) {
      setErr('Description (shown in list) is required.');
      return;
    }
    if (!form.billingProfileCode) {
      setErr('Select a billing profile.');
      return;
    }
    if (!form.firmBankAccountId) {
      setErr('Select a bank / cash account.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...form });
      onClose();
    } catch (e) {
      setErr(e?.message || 'Could not save client cost payment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 580 }}>
        <div style={modalHeaderStyle}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>📋 Payment (client cost)</span>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <div style={{ color: '#dc2626', fontSize: 13 }}>{err}</div>}
          <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>
            Expenses included in your fees — not charged separately and not posted to the client receivable ledger or recovery list. Firm cash-out is recorded only.
          </p>
          <label style={labelStyle}>
            Client (contact or organization)
            <EntitySearchDropdown
              value={form.entityId}
              displayValue={form.entityName}
              entityType={form.entityType}
              onChange={(c) => {
                setErr('');
                setForm((f) => ({
                  ...f,
                  entityId: String(c.id),
                  entityName: c.displayName,
                  entityType: c.entityType,
                }));
              }}
              placeholder="Search contact or organization…"
              style={inputStyle}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={labelStyle}>
              Ledger type
              <input type="text" style={{ ...inputStyle, background: '#f8fafc' }} value="Client Costs" readOnly />
            </label>
            <label style={labelStyle}>
              Ledger view
              <select
                style={inputStyle}
                value={form.ledgerMovementKind}
                onChange={(e) => set('ledgerMovementKind', e.target.value)}
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
              <AmountInput style={inputStyle} placeholder="e.g. 2500" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
            </label>
            <label style={labelStyle}>
              Payment date
              <DateInput style={inputStyle} value={form.txnDate} onChange={(e) => set('txnDate', e.target.value)} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={labelStyle}>
              Purpose
              <select style={inputStyle} value={form.expensePurpose} onChange={(e) => set('expensePurpose', e.target.value)}>
                {EXPENSE_PURPOSE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Description (shown in list) *
              <input type="text" style={inputStyle} placeholder="What was paid and why" value={form.description} onChange={(e) => set('description', e.target.value)} aria-required />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={labelStyle}>
              Paid via
              <select
                style={inputStyle}
                value={form.method}
                onChange={(e) => set('method', e.target.value)}
                disabled={paymentMethodOptionsForFirmBankAccount(banks, form.firmBankAccountId).length === 1}
              >
                {paymentMethodOptionsForFirmBankAccount(banks, form.firmBankAccountId).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
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
              Bank / cash account *
              <select
                style={inputStyle}
                value={form.firmBankAccountId}
                onChange={(e) => {
                  const bankId = e.target.value;
                  setErr('');
                  setForm((f) => ({
                    ...f,
                    firmBankAccountId: bankId,
                    method: coercePaymentMethodForFirmBankAccount(f.method, banks, bankId),
                  }));
                }}
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
        </div>
        <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose} style={btnSecondary} disabled={saving}>Cancel</button>
          <button type="button" onClick={handleSave} style={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Save client cost'}</button>
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
          if (f.firmBankAccountId && list.some((b) => String(b.id) === String(f.firmBankAccountId))) {
            return {
              ...f,
              method: coercePaymentMethodForFirmBankAccount(f.method, list, f.firmBankAccountId),
            };
          }
          const newBankId = list[0] ? String(list[0].id) : '';
          return {
            ...f,
            firmBankAccountId: newBankId,
            method: coercePaymentMethodForFirmBankAccount(f.method, list, newBankId),
          };
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
    () => (openInvoices || []).filter((inv) => (inv.ledgerClass || 'regular') === form.ledgerClass && form.ledgerClass !== 'parked'),
    [openInvoices, form.ledgerClass],
  );
  const isParkedReceipt = form.ledgerClass === 'parked';

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
    const lines = isParkedReceipt
      ? [{ target_type: 'unallocated_advance', amount: total }]
      : allocLines.map((l) => ({
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
                  const lc = e.target.value;
                  setForm((f) => ({ ...f, ledgerClass: lc }));
                  receiptAmountMirrorRef.current = '';
                  if (lc === 'parked') {
                    setAllocLines([{ targetType: 'unallocated_advance', targetTxnId: '', amount: form.amount }]);
                  } else {
                    setAllocLines([{ targetType: 'invoice', targetTxnId: '', amount: '' }]);
                  }
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
              <AmountInput style={inputStyle} placeholder="e.g. 5900" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
            </label>
            <label style={labelStyle}>
              Receipt Date
              <DateInput style={inputStyle} value={form.txnDate} onChange={(e) => set('txnDate', e.target.value)} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={labelStyle}>
              Payment Method
              <select
                style={inputStyle}
                value={form.method}
                onChange={(e) => set('method', e.target.value)}
                disabled={paymentMethodOptionsForFirmBankAccount(banks, form.firmBankAccountId).length === 1}
              >
                {paymentMethodOptionsForFirmBankAccount(banks, form.firmBankAccountId).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
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
                onChange={(e) => {
                  const bankId = e.target.value;
                  setForm((f) => ({
                    ...f,
                    firmBankAccountId: bankId,
                    method: coercePaymentMethodForFirmBankAccount(f.method, banks, bankId),
                  }));
                }}
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
            {isParkedReceipt ? (
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>
                Parked receipts are recorded as full unallocated advance (no bill-by-bill). Assign to the final client from the Parked ledger when the firm name is confirmed.
              </div>
            ) : (
            <>
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
                <AmountInput
                  style={inputStyle}
                  placeholder="₹"
                  value={line.amount}
                  onChange={(e) => setLine(idx, { amount: e.target.value })}
                />
                <button type="button" onClick={() => removeAllocLine(idx)} style={{ ...iconBtn, alignSelf: 'start' }} title="Remove line">−</button>
              </div>
            ))}
            </>
            )}
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
              <AmountInput style={inputStyle} placeholder="e.g. 5000" value={form.amount} onChange={e=>set('amount',e.target.value)} />
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
              <AmountInput style={inputStyle} placeholder="e.g. 10" value={form.tdsRate} onChange={e=>set('tdsRate',e.target.value)} />
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
              <AmountInput style={inputStyle} placeholder="e.g. 1000" value={form.amount} onChange={e=>set('amount',e.target.value)} />
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
              <AmountInput style={inputStyle} placeholder="Partial or full amount" value={form.amount} onChange={e=>set('amount',e.target.value)} />
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
                {LEDGER_CLASS_OPTIONS.filter((o) => o.value !== 'parked').map((o) => (
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
              <AmountInput
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
              <AmountInput
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

const INVOICE_TABS = new Set(['invoices', 'receipts', 'payments', 'payment_costs', 'tds', 'rebate', 'credit_note', 'service_billing']);
const LEDGER_TABS  = new Set(['ledger', 'bill_settlement', 'recovery_list']);

const TXN_LIST_PER_PAGE = 50;

const DEFAULT_TXN_LIST_PAGE = {
  invoices: 1,
  receipts: 1,
  payments: 1,
  payment_costs: 1,
  tds: 1,
  rebate: 1,
  credit_note: 1,
};

const TXN_LIST_ENTITY_LABELS = {
  invoices: 'invoices',
  receipts: 'receipts',
  payments: 'payments',
  payment_costs: 'client cost payments',
  tds: 'TDS entries',
  rebate: 'rebates',
  credit_note: 'credit notes',
};

function normalizeTxnListPagination(pagination) {
  const total = Number(pagination?.total) || 0;
  const lastPage = Math.max(1, Number(pagination?.last_page) || 1);
  return { total, last_page: lastPage };
}

const DEFAULT_KPI_FY_DATES = getIndianFyDatesToToday();

function formatFinanceKpiBreakdown(fees, reimb, opening) {
  const f = (n) => (Number(n) || 0).toLocaleString('en-IN');
  return `Fees ₹${f(fees)} · Reimb ₹${f(reimb)} · Opening ₹${f(opening)}`;
}

function formatKpiPeriodLabel(from, to) {
  if (!from || !to) return '';
  const fmt = (ymd) => {
    const [y, m, d] = ymd.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
  };
  return `${fmt(from)} – ${fmt(to)}`;
}

export default function Invoices({ ledgerOnly = false }) {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEditInvoice = hasPermission('invoices.edit');
  const canDeleteInvoice = hasPermission('invoices.delete');
  const canCreateInvoice = hasPermission('invoices.create');
  const canBillingClosure = hasPermission('services.edit') || hasPermission('invoices.edit');
  const canViewServices = hasPermission('services.view');
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
    const allowedSet = ledgerOnly ? LEDGER_TABS : INVOICE_TABS;
    if (t && allowedSet.has(t)) return t;
    return ledgerOnly ? 'ledger' : 'invoices';
  });

  useEffect(() => {
    const t = searchParams.get('tab');
    if (!t) return;
    const allowedSet = ledgerOnly ? LEDGER_TABS : INVOICE_TABS;
    if (allowedSet.has(t)) setTab(t);
  }, [searchParams, ledgerOnly]);

  useEffect(() => {
    if (!ledgerOnly) return;
    if (searchParams.get('tab') === 'service_billing') {
      navigate('/invoices?tab=service_billing', { replace: true });
    }
  }, [ledgerOnly, searchParams, navigate]);

  useEffect(() => {
    const cur = searchParams.get('tab');
    const defaultTab = ledgerOnly ? 'ledger' : 'invoices';
    if (cur === tab || (cur == null && tab === defaultTab)) return undefined;
    const next = new URLSearchParams(searchParams);
    if (tab === defaultTab) next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
    return undefined;
  }, [tab, ledgerOnly, searchParams, setSearchParams]);

  // ── Finance KPI summary (period-aware, server-side) ─────────────────────────
  const [kpiPreset, setKpiPreset] = useState('indian_fy');
  const [kpiDateFrom, setKpiDateFrom] = useState(DEFAULT_KPI_FY_DATES.from);
  const [kpiDateTo, setKpiDateTo] = useState(DEFAULT_KPI_FY_DATES.to);
  const [financeSummary, setFinanceSummary] = useState(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiError, setKpiError] = useState('');
  const [kpiReloadSeq, setKpiReloadSeq] = useState(0);

  // ── Invoice tab state ───────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter]         = useState('all');
  const [showRaiseInvoice, setShowRaiseInvoice] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [selectedInvoice, setSelectedInvoice]   = useState(null);
  const [viewInvoiceTxn, setViewInvoiceTxn]     = useState(null);
  const [editInvoiceId, setEditInvoiceId]       = useState(null);
  const [editLedgerTxnId, setEditLedgerTxnId]   = useState(null);
  const [ledgerDeletePrompt, setLedgerDeletePrompt] = useState(null);
  const [ledgerReinstatePrompt, setLedgerReinstatePrompt] = useState(null);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const [invoices, setInvoices]                 = useState([]);
  const [invLoading, setInvLoading]             = useState(true);

  // ── Receipts tab state ──────────────────────────────────────────────────────
  const [receipts, setReceipts]         = useState([]);
  const [recLoading, setRecLoading]     = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedReceiptIds, setSelectedReceiptIds] = useState([]);
  const [receiptsFilterDateFrom, setReceiptsFilterDateFrom] = useState('');
  const [receiptsFilterDateTo, setReceiptsFilterDateTo] = useState('');
  const [receiptsLedgerView, setReceiptsLedgerView] = useState('fees');

  // ── Payments (on behalf) tab state ─────────────────────────────────────────
  const [paymentExpenses, setPaymentExpenses] = useState([]);
  const [payLoading, setPayLoading] = useState(false);
  const [paymentsFilterByLedger, setPaymentsFilterByLedger] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState([]);

  // ── Payments (costs) tab state ──────────────────────────────────────────────
  const [paymentClientCosts, setPaymentClientCosts] = useState([]);
  const [payCostLoading, setPayCostLoading] = useState(false);
  const [showPaymentCostModal, setShowPaymentCostModal] = useState(false);
  const [selectedPaymentCostIds, setSelectedPaymentCostIds] = useState([]);

  const paymentClientCostFetchParams = useMemo(
    () => ({ txnType: 'payment_client_cost' }),
    [],
  );

  const receiptFetchParams = useMemo(() => {
    const params = { txnType: 'receipt' };
    if (receiptsFilterDateFrom) params.dateFrom = receiptsFilterDateFrom;
    if (receiptsFilterDateTo) params.dateTo = receiptsFilterDateTo;
    if (receiptsLedgerView === 'fees') params.ledgerMovementKind = 'fees';
    else if (receiptsLedgerView === 'reimbursement') params.ledgerMovementKind = 'reimbursement';
    return params;
  }, [receiptsFilterDateFrom, receiptsFilterDateTo, receiptsLedgerView]);

  const receiptsFiltersActive = Boolean(
    receiptsFilterDateFrom
    || receiptsFilterDateTo
    || receiptsLedgerView !== 'fees'
  );

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
  const [showRebateModal, setShowRebateModal] = useState(false);
  const [selectedRebateIds, setSelectedRebateIds] = useState([]);

  // ── Credit Note tab state ───────────────────────────────────────────────────
  const [creditNotes, setCreditNotes]     = useState([]);
  const [cnLoading, setCnLoading]         = useState(false);
  const [showCnModal, setShowCnModal]     = useState(false);
  const [selectedCreditNoteIds, setSelectedCreditNoteIds] = useState([]);
  const [txnListSearchQuery, setTxnListSearchQuery] = useState('');
  const [txnListSearchDebounced, setTxnListSearchDebounced] = useState('');
  const [txnListPage, setTxnListPage] = useState(() => ({ ...DEFAULT_TXN_LIST_PAGE }));
  const [txnListPagination, setTxnListPagination] = useState({});
  const [txnListReloadSeq, setTxnListReloadSeq] = useState(0);
  const [txnListFetchError, setTxnListFetchError] = useState('');
  const prevTxnListSearchDebouncedRef = useRef('');
  const txnListFetchIdRef = useRef(0);
  const activeTxnListPage = txnListPage[tab] ?? 1;

  // ── Ledger tab state ────────────────────────────────────────────────────────
  const [ledgerScope, setLedgerScope]             = useState('entity');
  const [ledgerClientId, setLedgerClientId]       = useState('');
  const [ledgerGroupId, setLedgerGroupId]         = useState('');
  const [ledgerGroupName, setLedgerGroupName]     = useState('');
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

  const [recoveryReport, setRecoveryReport] = useState(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState(null);
  const [recoveryBucket, setRecoveryBucket] = useState('active');
  const [recoverySearch, setRecoverySearch] = useState('');
  const [recoverySearchMode, setRecoverySearchMode] = useState('group');

  const [npaModal, setNpaModal] = useState({ open: false, entityType: '', entityId: 0, displayName: '' });
  const [npaReason, setNpaReason] = useState('');
  const [npaSaving, setNpaSaving] = useState(false);

  const [badDebtModal, setBadDebtModal] = useState({ open: false, entityType: '', entityId: 0, displayName: '' });
  const [badDebtReason, setBadDebtReason] = useState('');
  const [badDebtSaving, setBadDebtSaving] = useState(false);

  const [ledgerRecoveryStatus, setLedgerRecoveryStatus] = useState(null);

  // ── Recovery Log modal state ─────────────────────────────────────────────────
  const [recoveryLogModal, setRecoveryLogModal] = useState({ open: false, entityType: '', entityId: 0, displayName: '' });
  const [recoveryLogEntries, setRecoveryLogEntries] = useState([]);
  const [recoveryLogLoading, setRecoveryLogLoading] = useState(false);
  const [recoveryLogSaving, setRecoveryLogSaving] = useState(false);
  const [recoveryLogForm, setRecoveryLogForm] = useState({
    log_date: '', followup_details: '', client_response: '',
    next_followup_date: '', next_followup_details: '', revised_due_date: '',
  });

  // ── Ledger "all classes" + limit state ───────────────────────────────────────
  const [ledgerLimit, setLedgerLimit] = useState(0);
  const [ledgerAllClasses, setLedgerAllClasses] = useState(null);

  const isGroupLedgerScope = ledgerScope === 'group';
  const ledgerScopeReady = isGroupLedgerScope ? !!ledgerGroupId : !!ledgerClientId;
  const ledgerScopeDisplayName = isGroupLedgerScope ? ledgerGroupName : ledgerClientName;

  function switchLedgerScope(nextScope) {
    setLedgerScope(nextScope);
    if (nextScope === 'entity') {
      setLedgerGroupId('');
      setLedgerGroupName('');
    } else {
      setLedgerClientId('');
      setLedgerClientName('');
      setLedgerEntityType('contact');
      setLedgerRecoveryStatus(null);
    }
    setLedger([]);
    setLedgerAllClasses(null);
    setLedgerLimit(0);
  }

  function ledgerTableHeaders(includeActions = false) {
    const headers = ['Date'];
    if (isGroupLedgerScope) headers.push('Entity');
    headers.push('Entry Type', 'Narration', 'Details', 'Billing Profile', 'Debit (Dr)', 'Credit (Cr)', 'Balance', 'Audit');
    if (includeActions) headers.push('Actions');
    return headers;
  }

  const paymentExpenseFetchParams = useMemo(() => {
    const params = { txnType: 'payment_expense' };
    if (paymentsFilterByLedger && ledgerClientId) {
      if (ledgerEntityType === 'organization') {
        params.organizationId = ledgerClientId;
      } else {
        params.clientId = ledgerClientId;
      }
      params.ledgerClass = normalizeLedgerClassForApi(ledgerLedgerClass);
      params.omitCancelledReversed = true;
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

  function openLedgerFromRecovery(ent) {
    setLedgerEntityType(ent.entityType === 'organization' ? 'organization' : 'contact');
    setLedgerClientId(String(ent.entityId));
    setLedgerClientName(ent.displayName || '');
    setLedgerLedgerClass('all');
    setLedgerLedgerView('consolidated');
    setLedgerLimit(50);
    setLedgerAllClasses(null);
    setTab('ledger');
  }

  function openRecoveryLogModal(ent) {
    const today = new Date().toISOString().slice(0, 10);
    setRecoveryLogForm({
      log_date: today, followup_details: '', client_response: '',
      next_followup_date: '', next_followup_details: '', revised_due_date: '',
    });
    setRecoveryLogEntries([]);
    setRecoveryLogModal({ open: true, entityType: ent.entityType, entityId: ent.entityId, displayName: ent.displayName || '' });
    setRecoveryLogLoading(true);
    getRecoveryLogs({ entityType: ent.entityType, entityId: ent.entityId })
      .then(setRecoveryLogEntries)
      .catch(() => {})
      .finally(() => setRecoveryLogLoading(false));
  }

  function closeRecoveryLogModal() {
    setRecoveryLogModal({ open: false, entityType: '', entityId: 0, displayName: '' });
  }

  function openNpaModal(ent) {
    setNpaReason('');
    setNpaModal({
      open: true,
      entityType: ent.entityType,
      entityId: ent.entityId,
      displayName: ent.displayName || '',
    });
  }

  function closeNpaModal() {
    setNpaModal({ open: false, entityType: '', entityId: 0, displayName: '' });
    setNpaReason('');
  }

  function openBadDebtModal(ent) {
    setBadDebtReason('');
    setBadDebtModal({
      open: true,
      entityType: ent.entityType,
      entityId: ent.entityId,
      displayName: ent.displayName || '',
    });
  }

  function closeBadDebtModal() {
    setBadDebtModal({ open: false, entityType: '', entityId: 0, displayName: '' });
    setBadDebtReason('');
  }

  function reloadRecoveryReport() {
    setRecoveryLoading(true);
    setRecoveryError(null);
    return getRecoveryByGroup({ bucket: recoveryBucket })
      .then((data) => {
        setRecoveryError(null);
        setRecoveryReport(data);
      })
      .catch((e) => {
        setRecoveryError(e?.message || 'Unknown error loading recovery list');
        setRecoveryReport(null);
      })
      .finally(() => setRecoveryLoading(false));
  }

  async function submitMarkNpa(e) {
    e.preventDefault();
    if (!npaReason.trim()) {
      alert('Please enter a reason for marking as NPA.');
      return;
    }
    setNpaSaving(true);
    try {
      await markNpa({
        entity_type: npaModal.entityType,
        entity_id: npaModal.entityId,
        reason: npaReason.trim(),
      });
      closeNpaModal();
      if (ledgerClientId && String(npaModal.entityId) === ledgerClientId
          && (ledgerEntityType === 'organization' ? 'organization' : 'client') === npaModal.entityType) {
        getRecoveryStatus({ entityType: npaModal.entityType, entityId: npaModal.entityId })
          .then(setLedgerRecoveryStatus)
          .catch(() => setLedgerRecoveryStatus(null));
      }
      await reloadRecoveryReport();
    } catch (err) {
      alert('Failed to mark as NPA: ' + (err?.message || 'Unknown error'));
    } finally {
      setNpaSaving(false);
    }
  }

  async function submitMarkBadDebt(e) {
    e.preventDefault();
    if (!badDebtReason.trim()) {
      alert('Please enter a reason for marking as bad debt.');
      return;
    }
    setBadDebtSaving(true);
    try {
      await markBadDebt({
        entity_type: badDebtModal.entityType,
        entity_id: badDebtModal.entityId,
        reason: badDebtReason.trim(),
      });
      closeBadDebtModal();
      if (ledgerClientId && String(badDebtModal.entityId) === ledgerClientId
          && (ledgerEntityType === 'organization' ? 'organization' : 'client') === badDebtModal.entityType) {
        getRecoveryStatus({ entityType: badDebtModal.entityType, entityId: badDebtModal.entityId })
          .then(setLedgerRecoveryStatus)
          .catch(() => setLedgerRecoveryStatus(null));
      }
      await reloadRecoveryReport();
    } catch (err) {
      alert('Failed to mark as bad debt: ' + (err?.message || 'Unknown error'));
    } finally {
      setBadDebtSaving(false);
    }
  }

  function formatRecoveryMarkedAt(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return '—';
    }
  }

  async function submitRecoveryLog(e) {
    e.preventDefault();
    setRecoveryLogSaving(true);
    try {
      const payload = {
        entity_type:           recoveryLogModal.entityType,
        entity_id:             recoveryLogModal.entityId,
        log_date:              recoveryLogForm.log_date || new Date().toISOString().slice(0, 10),
        followup_details:      recoveryLogForm.followup_details || null,
        client_response:       recoveryLogForm.client_response || null,
        next_followup_date:    recoveryLogForm.next_followup_date || null,
        next_followup_details: recoveryLogForm.next_followup_details || null,
        revised_due_date:      recoveryLogForm.revised_due_date || null,
      };
      const newLog = await createRecoveryLog(payload);
      setRecoveryLogEntries((prev) => [newLog, ...prev]);
      // Update the due date in the recovery report locally
      if (recoveryReport) {
        const entityKey = `${recoveryLogModal.entityType}:${recoveryLogModal.entityId}`;
        setRecoveryReport((prev) => {
          if (!prev) return prev;
          const groups = prev.groups.map((g) => ({
            ...g,
            entities: g.entities.map((ent) => {
              const ek = `${ent.entityType}:${ent.entityId}`;
              if (ek !== entityKey) return ent;
              return {
                ...ent,
                latestLog: {
                  id: newLog.id,
                  revised_due_date: newLog.revised_due_date,
                  next_followup_date: newLog.next_followup_date,
                  log_date: newLog.log_date,
                },
              };
            }),
          }));
          return { ...prev, groups };
        });
      }
      const today = new Date().toISOString().slice(0, 10);
      setRecoveryLogForm({
        log_date: today, followup_details: '', client_response: '',
        next_followup_date: '', next_followup_details: '', revised_due_date: '',
      });
    } catch (err) {
      alert('Failed to save: ' + (err?.message || 'Unknown error'));
    } finally {
      setRecoveryLogSaving(false);
    }
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
  const [billingDetailRow, setBillingDetailRow]         = useState(null);

  function buildTxnListParams(targetTab, page) {
    const search = txnListSearchDebounced.trim() || undefined;
    const base = { page, perPage: TXN_LIST_PER_PAGE, search };
    if (targetTab === 'invoices') {
      return {
        ...base,
        txnType: 'invoice',
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      };
    }
    if (targetTab === 'receipts') {
      return { ...base, ...receiptFetchParams };
    }
    if (targetTab === 'payments') {
      return { ...base, ...paymentExpenseFetchParams };
    }
    if (targetTab === 'payment_costs') {
      return { ...base, ...paymentClientCostFetchParams };
    }
    if (targetTab === 'tds') {
      return {
        ...base,
        txnType: 'tds',
        ...(tdsFilter !== 'all' ? { tdsStatus: tdsFilter } : {}),
      };
    }
    if (targetTab === 'rebate') {
      return { ...base, txnType: 'rebate' };
    }
    if (targetTab === 'credit_note') {
      return { ...base, txnType: 'credit_note' };
    }
    return null;
  }

  function reloadActiveTxnList({ page: pageOverride } = {}) {
    setKpiReloadSeq((s) => s + 1);
    if (pageOverride != null) {
      setTxnListPage((p) => ({ ...p, [tab]: pageOverride }));
    } else {
      setTxnListReloadSeq((s) => s + 1);
    }
  }

  function reloadTxnListTab(targetTab, { page: pageOverride } = {}) {
    const params = buildTxnListParams(targetTab, pageOverride ?? txnListPage[targetTab] ?? 1);
    if (!params) return Promise.resolve();
    return getTxns(params).then(({ txns, pagination }) => {
      const meta = normalizeTxnListPagination(pagination);
      setTxnListPagination((prev) => ({ ...prev, [targetTab]: meta }));
      if (targetTab === 'invoices') setInvoices(txns);
      else if (targetTab === 'receipts') setReceipts(txns);
      else if (targetTab === 'payments') setPaymentExpenses(txns);
      else if (targetTab === 'payment_costs') setPaymentClientCosts(txns);
      else if (targetTab === 'tds') setTdsEntries(txns);
      else if (targetTab === 'rebate') setRebates(txns);
      else if (targetTab === 'credit_note') setCreditNotes(txns);
    });
  }

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
          reloadActiveTxnList();
        },
        onFailure: (err) => window.alert(err.message || 'Payment failed'),
      });
    } catch (e) {
      window.alert(e.message || 'Could not start Razorpay checkout');
    }
  }

  useEffect(() => {
    setTxnListSearchQuery('');
    setTxnListSearchDebounced('');
    prevTxnListSearchDebouncedRef.current = '';
    setTxnListFetchError('');
    setRecoverySearch('');
  }, [tab]);

  useEffect(() => {
    const t = setTimeout(() => {
      setTxnListSearchDebounced(txnListSearchQuery.trim());
    }, 400);
    return () => clearTimeout(t);
  }, [txnListSearchQuery]);

  useEffect(() => {
    if (!TXN_LIST_SEARCH_TABS.has(tab)) return undefined;
    if (prevTxnListSearchDebouncedRef.current === txnListSearchDebounced) return undefined;
    prevTxnListSearchDebouncedRef.current = txnListSearchDebounced;
    setTxnListPage((p) => {
      const cur = p[tab] ?? 1;
      if (cur === 1) return p;
      return { ...p, [tab]: 1 };
    });
    return undefined;
  }, [txnListSearchDebounced, tab]);

  useEffect(() => {
    setTxnListPage((p) => (p.invoices === 1 ? p : { ...p, invoices: 1 }));
  }, [statusFilter]);

  useEffect(() => {
    setTxnListPage((p) => (p.tds === 1 ? p : { ...p, tds: 1 }));
  }, [tdsFilter]);

  useEffect(() => {
    setTxnListPage((p) => (p.payments === 1 ? p : { ...p, payments: 1 }));
  }, [paymentsFilterByLedger, ledgerClientId, ledgerEntityType, ledgerLedgerClass]);

  useEffect(() => {
    setTxnListPage((p) => (p.receipts === 1 ? p : { ...p, receipts: 1 }));
  }, [receiptsFilterDateFrom, receiptsFilterDateTo, receiptsLedgerView]);

  useEffect(() => {
    setRecoverySearch('');
  }, [recoveryBucket]);

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

  // ── Load paginated txn lists for Invoices & Ledger tabs ─────────────────────
  useEffect(() => {
    if (!TXN_LIST_SEARCH_TABS.has(tab)) return undefined;

    const fetchId = ++txnListFetchIdRef.current;
    const page = activeTxnListPage;
    const params = buildTxnListParams(tab, page);
    if (!params) return undefined;

    const setLoading = (v) => {
      if (tab === 'invoices') setInvLoading(v);
      else if (tab === 'receipts') setRecLoading(v);
      else if (tab === 'payments') setPayLoading(v);
      else if (tab === 'payment_costs') setPayCostLoading(v);
      else if (tab === 'tds') setTdsLoading(v);
      else if (tab === 'rebate') setRebLoading(v);
      else if (tab === 'credit_note') setCnLoading(v);
    };

    setLoading(true);
    setTxnListFetchError('');
    getTxns(params)
      .then(({ txns, pagination }) => {
        if (fetchId !== txnListFetchIdRef.current) return;
        const meta = normalizeTxnListPagination(pagination);
        setTxnListPagination((prev) => ({ ...prev, [tab]: meta }));
        if (tab === 'invoices') setInvoices(txns);
        else if (tab === 'receipts') setReceipts(txns);
        else if (tab === 'payments') setPaymentExpenses(txns);
        else if (tab === 'payment_costs') setPaymentClientCosts(txns);
        else if (tab === 'tds') setTdsEntries(txns);
        else if (tab === 'rebate') setRebates(txns);
        else if (tab === 'credit_note') setCreditNotes(txns);
      })
      .catch((err) => {
        if (fetchId !== txnListFetchIdRef.current) return;
        setTxnListFetchError(err?.message || 'Failed to load records.');
      })
      .finally(() => {
        if (fetchId === txnListFetchIdRef.current) setLoading(false);
      });

    return undefined;
  }, [
    tab,
    activeTxnListPage,
    txnListSearchDebounced,
    statusFilter,
    tdsFilter,
    paymentExpenseFetchParams,
    paymentClientCostFetchParams,
    receiptFetchParams,
    txnListReloadSeq,
  ]);

  // ── Ledger reload ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'ledger' && tab !== 'bill_settlement') return;
    if (tab === 'bill_settlement' && !ledgerClientId) return;
    if (tab === 'ledger' && !ledgerScopeReady) return;

    setLedgerLoading(true);
    setLedgerAllClasses(null);

    const isAll = ledgerLedgerClass === 'all';
    const limitOpt = ledgerLimit > 0 ? { limit: ledgerLimit } : {};

    const finishLedgerLoad = (entries, allClasses = null) => {
      if (allClasses) {
        setLedgerAllClasses(allClasses);
        setLedger(allClasses.regular || []);
        const allEntries = [
          ...(allClasses.regular || []),
          ...(allClasses.memorandum || []),
          ...(allClasses.optional || []),
          ...(allClasses.parked || []),
        ];
        setLedgerFyStartYear((prev) => {
          const fys = collectIndianFYStartYearsWithFallback(allEntries);
          if (prev != null && fys.includes(prev)) return prev;
          return fys[fys.length - 1];
        });
      } else {
        setLedger(entries);
        setLedgerFyStartYear((prev) => {
          const fys = collectIndianFYStartYearsWithFallback(entries);
          if (prev != null && fys.includes(prev)) return prev;
          return fys[fys.length - 1];
        });
      }
    };

    if (tab === 'ledger' && isGroupLedgerScope) {
      const groupBase = { groupId: ledgerGroupId, ledgerView: ledgerLedgerView, ...limitOpt };
      if (isAll) {
        const classes = ['regular', 'memorandum', 'optional', 'parked'];
        Promise.all(
          classes.map((lc) =>
            getLedgerByGroup({ ...groupBase, ledgerClass: lc }).catch(() => [])
          )
        ).then(([regular, memorandum, optional, parked]) => {
          setOpeningBalances([]);
          finishLedgerLoad(null, { regular, memorandum, optional, parked });
        }).finally(() => setLedgerLoading(false));
      } else {
        getLedgerByGroup({ ...groupBase, ledgerClass: ledgerLedgerClass })
          .catch(() => [])
          .then((entries) => {
            setOpeningBalances([]);
            finishLedgerLoad(entries);
          })
          .finally(() => setLedgerLoading(false));
      }
      return undefined;
    }

    const entityBase = ledgerEntityType === 'organization'
      ? { organizationId: ledgerClientId }
      : { clientId: ledgerClientId };

    const obPromise = getOpeningBalance(entityBase).catch(() => []);

    if (isAll) {
      const classes = ['regular', 'memorandum', 'optional', 'parked'];
      const fetches = classes.map((lc) =>
        getLedger({ ...entityBase, ledgerClass: lc, ledgerView: ledgerLedgerView, ...limitOpt }).catch(() => [])
      );
      Promise.all([Promise.all(fetches), obPromise]).then(([[regular, memorandum, optional, parked], obs]) => {
        setOpeningBalances(obs);
        finishLedgerLoad(null, { regular, memorandum, optional, parked });
      }).finally(() => setLedgerLoading(false));
    } else {
      Promise.all([
        getLedger({
          ...entityBase,
          ledgerClass: ledgerLedgerClass,
          ledgerView: ledgerLedgerView,
          ...limitOpt,
        }).catch(() => []),
        obPromise,
      ]).then(([entries, obs]) => {
        setOpeningBalances(obs);
        finishLedgerLoad(entries);
      }).finally(() => setLedgerLoading(false));
    }
    return undefined;
  }, [
    tab,
    ledgerClientId,
    ledgerEntityType,
    ledgerScope,
    ledgerGroupId,
    isGroupLedgerScope,
    ledgerScopeReady,
    ledgerLedgerClass,
    ledgerLedgerView,
    ledgerLimit,
  ]);

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
    if (tab !== 'recovery_list') return undefined;
    setRecoveryLoading(true);
    setRecoveryError(null);
    let cancelled = false;
    getRecoveryByGroup({ bucket: recoveryBucket })
      .then((data) => {
        if (!cancelled) {
          setRecoveryError(null);
          setRecoveryReport(data);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setRecoveryError(e?.message || 'Unknown error loading recovery list');
          setRecoveryReport(null);
        }
      })
      .finally(() => {
        if (!cancelled) setRecoveryLoading(false);
      });
    return () => { cancelled = true; };
  }, [tab, recoveryBucket]);

  useEffect(() => {
    if (!ledgerClientId || (tab !== 'ledger' && tab !== 'bill_settlement')) {
      setLedgerRecoveryStatus(null);
      return undefined;
    }
    const entityType = ledgerEntityType === 'organization' ? 'organization' : 'client';
    const entityId = parseInt(ledgerClientId, 10);
    if (!entityId) {
      setLedgerRecoveryStatus(null);
      return undefined;
    }
    let cancelled = false;
    getRecoveryStatus({ entityType, entityId })
      .then((status) => {
        if (!cancelled) setLedgerRecoveryStatus(status);
      })
      .catch(() => {
        if (!cancelled) setLedgerRecoveryStatus(null);
      });
    return () => { cancelled = true; };
  }, [ledgerClientId, ledgerEntityType, tab]);

  useEffect(() => {
    setLedgerFilterDateFrom('');
    setLedgerFilterDateTo('');
  }, [ledgerClientId, ledgerGroupId, ledgerScope, ledgerLedgerClass, ledgerLedgerView]);

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

  useEffect(() => {
    if (!kpiDateFrom || !kpiDateTo) return undefined;
    let cancelled = false;
    setKpiLoading(true);
    setKpiError('');
    getFinanceSummary({ dateFrom: kpiDateFrom, dateTo: kpiDateTo })
      .then((summary) => {
        if (!cancelled) setFinanceSummary(summary);
      })
      .catch((err) => {
        if (!cancelled) {
          setFinanceSummary(null);
          setKpiError(err?.message || 'Failed to load finance summary.');
        }
      })
      .finally(() => {
        if (!cancelled) setKpiLoading(false);
      });
    return () => { cancelled = true; };
  }, [kpiDateFrom, kpiDateTo, kpiReloadSeq]);

  const kpiConsolidated = financeSummary?.consolidated;
  const formatKpiAmount = (value) => (
    kpiLoading ? '—' : `₹${(Number(value) || 0).toLocaleString('en-IN')}`
  );
  const kpiPeriodLabel = formatKpiPeriodLabel(kpiDateFrom, kpiDateTo);

  const filteredRecoveryGroups = useMemo(
    () => filterRecoveryGroups(recoveryReport?.groups, recoverySearch, recoverySearchMode),
    [recoveryReport?.groups, recoverySearch, recoverySearchMode],
  );

  const recoveryDisplayTotals = useMemo(() => {
    if (!recoverySearch.trim()) return recoveryReport?.totals ?? null;
    return recoveryTotalsFromGroups(filteredRecoveryGroups);
  }, [recoveryReport?.totals, recoverySearch, filteredRecoveryGroups]);

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
        if (tab === 'invoices') reloadActiveTxnList({ page: 1 });
        else setInvoices((prev) => [newInv, ...prev]);
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
      .then(() => {
        reloadActiveTxnList({ page: 1 });
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
    if (Number.isNaN(idNum) || idNum <= 0) {
      return Promise.reject(new Error('Select a client (contact or organization).'));
    }
    const purposeLabel = expensePurposeLabel(data.expensePurpose);
    const narration = data.description.trim()
      ? `${purposeLabel} — ${data.description.trim()}`
      : purposeLabel;
    const lines = (data.settlementLines || []).map((l) => {
      const tt = l.target_type || l.targetType;
      return {
        target_type: tt,
        target_txn_id: tt === 'receipt' ? (parseInt(l.target_txn_id ?? l.targetTxnId, 10) || 0) : undefined,
        amount: parseFloat(l.amount) || 0,
      };
    }).filter((l) => l.amount > 0);
    const settlement_lines = lines.map((l) => (
      l.target_type === 'receipt'
        ? { target_type: 'receipt', target_txn_id: l.target_txn_id, amount: l.amount }
        : { target_type: 'unallocated_advance', amount: l.amount }
    ));
    const payload = {
      amount: parseFloat(data.amount),
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
    return createPaymentExpense(payload)
      .then(() => reloadTxnListTab('payments', { page: 1 }));
  }

  function handleSavePaymentClientCost(data) {
    const idNum = parseInt(data.entityId, 10);
    if (Number.isNaN(idNum) || idNum <= 0) {
      return Promise.reject(new Error('Select a client (contact or organization).'));
    }
    const purposeLabel = expensePurposeLabel(data.expensePurpose);
    const narration = data.description.trim()
      ? `${purposeLabel} — ${data.description.trim()}`
      : purposeLabel;
    const payload = {
      amount: parseFloat(data.amount),
      txn_date: data.txnDate,
      payment_method: data.method,
      reference_number: data.referenceNumber || null,
      billing_profile_code: data.billingProfileCode || null,
      firm_bank_account_id: parseInt(data.firmBankAccountId, 10),
      expense_purpose: data.expensePurpose || null,
      narration,
      notes: data.notes || null,
      ledger_movement_kind: data.ledgerMovementKind === 'reimbursement' ? 'reimbursement' : 'fees',
    };
    if (data.entityType === 'organization') {
      payload.organization_id = idNum;
    } else {
      payload.client_id = idNum;
    }
    return createPaymentClientCost(payload)
      .then(() => reloadTxnListTab('payment_costs', { page: 1 }));
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
      .then(() => reloadActiveTxnList({ page: 1 }))
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
      .then(() => reloadActiveTxnList({ page: 1 }))
      .catch(() => {});
  }

  async function handleFinalizeTds() {
    for (const id of selectedTds) {
      await finalizeTds(id).catch(() => {});
    }
    setSelectedTds([]);
    reloadActiveTxnList();
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
      .then(() => reloadActiveTxnList({ page: 1 }))
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
      .then(() => reloadActiveTxnList({ page: 1 }))
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

  function patchLedgerRowsInState(setter, ids, patchFn) {
    const idSet = new Set((ids || []).map((x) => String(x)));
    setter((prev) => prev.map((row) => (idSet.has(String(row.id)) ? patchFn(row) : row)));
  }

  function handleLedgerDeleted(deletedIds) {
    patchLedgerRowsInState(setInvoices, deletedIds, (row) => ({
      ...row,
      status: 'cancelled',
      invoiceStatus: row.invoiceStatus ? 'cancelled' : row.invoiceStatus,
    }));
    patchLedgerRowsInState(setReceipts, deletedIds, (row) => ({ ...row, status: 'cancelled' }));
    patchLedgerRowsInState(setPaymentExpenses, deletedIds, (row) => ({ ...row, status: 'cancelled' }));
    patchLedgerRowsInState(setPaymentClientCosts, deletedIds, (row) => ({ ...row, status: 'cancelled' }));
    patchLedgerRowsInState(setTdsEntries, deletedIds, (row) => ({ ...row, status: 'cancelled' }));
    patchLedgerRowsInState(setRebates, deletedIds, (row) => ({ ...row, status: 'cancelled' }));
    patchLedgerRowsInState(setCreditNotes, deletedIds, (row) => ({ ...row, status: 'cancelled' }));
    setSelectedInvoiceIds([]);
    setSelectedReceiptIds([]);
    setSelectedPaymentIds([]);
    setSelectedPaymentCostIds([]);
    setSelectedTds([]);
    setSelectedTdsDeleteIds([]);
    setSelectedRebateIds([]);
    setSelectedCreditNoteIds([]);
  }

  function handleLedgerReinstated(reinstatedId, updatedRow) {
    const ids = [reinstatedId];
    const patchActive = (row) => {
      if (updatedRow && String(updatedRow.id) === String(row.id)) {
        return { ...row, ...updatedRow, status: 'active' };
      }
      return {
        ...row,
        status: 'active',
        invoiceStatus: row.invoiceStatus === 'cancelled' ? 'sent' : row.invoiceStatus,
      };
    };
    patchLedgerRowsInState(setInvoices, ids, patchActive);
    patchLedgerRowsInState(setReceipts, ids, patchActive);
    patchLedgerRowsInState(setPaymentExpenses, ids, patchActive);
    patchLedgerRowsInState(setPaymentClientCosts, ids, patchActive);
    patchLedgerRowsInState(setTdsEntries, ids, patchActive);
    patchLedgerRowsInState(setRebates, ids, patchActive);
    patchLedgerRowsInState(setCreditNotes, ids, patchActive);
  }

  function openLedgerReinstatePrompt(txn, label) {
    setLedgerReinstatePrompt({
      title: 'Reinstate ledger record',
      items: [{ id: txn.id, label: label || `${txn.txnDate || '—'} — ${txn.clientName}` }],
    });
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

  function handleBillingMarkBuilt(row, { onSuccess } = {}) {
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
        onSuccess?.();
      })
      .catch((e) => window.alert(e?.message || 'Could not update.'));
  }

  function promptNonBillableReason() {
    while (true) {
      const input = window.prompt('Reason for marking non-billable (required):', '');
      if (input === null) return null;
      const trimmed = String(input).trim();
      if (trimmed !== '') return trimmed;
      window.alert('Please enter a reason before marking this service as non-billable.');
    }
  }

  function handleBillingNonBillable(row, { onSuccess } = {}) {
    if (!canBillingClosure) return;
    const reason = promptNonBillableReason();
    if (reason === null) return;
    patchBillingClosure(row.id, { closure: 'non_billable', reason })
      .then(() => {
        refreshBillingReport();
        onSuccess?.();
      })
      .catch((e) => window.alert(e?.message || 'Could not update.'));
  }

  const ALL_TABS = [
    { key:'invoices',       label:'🧾 Invoices' },
    { key:'receipts',       label:'💵 Receipts' },
    { key:'payments',       label:'💳 Payments (on behalf)' },
    { key:'payment_costs',  label:'📋 Payments (costs)' },
    { key:'tds',            label:'📋 TDS' },
    { key:'rebate',         label:'💸 Rebate/Discount' },
    { key:'credit_note',    label:'📝 Credit Notes' },
    { key:'service_billing',label:'📋 Service billing' },
    { key:'ledger',         label:'📒 Ledger' },
    { key:'bill_settlement',label:'📑 Bill by bill' },
    { key:'recovery_list',  label:'📊 Recovery list' },
  ];
  const visibleTabSet = ledgerOnly ? LEDGER_TABS : INVOICE_TABS;
  const TABS = ALL_TABS.filter((t) => visibleTabSet.has(t.key));

  function renderTxnListPagination(tabKey, loading, placement) {
    const meta = txnListPagination[tabKey] || { total: 0, last_page: 1 };
    const page = txnListPage[tabKey] ?? 1;
    return (
      <ListPaginationBar
        placement={placement}
        total={meta.total}
        page={page}
        totalPages={meta.last_page}
        perPage={TXN_LIST_PER_PAGE}
        loading={loading}
        setPage={(fn) => setTxnListPage((pages) => ({ ...pages, [tabKey]: fn(pages[tabKey] ?? 1) }))}
        entityPlural={TXN_LIST_ENTITY_LABELS[tabKey] || 'records'}
      />
    );
  }

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
      {billingDetailRow && (
        <ServiceBillingDetailModal
          row={billingDetailRow}
          closureFilter={billingClosureFilter}
          canCreateInvoice={canCreateInvoice}
          canBillingClosure={canBillingClosure}
          canViewServices={canViewServices}
          onClose={() => setBillingDetailRow(null)}
          onRaiseInvoice={(row) => {
            setRaiseInvoicePrefill(billingPrefillFromRow(row));
            setShowRaiseInvoice(true);
            setBillingDetailRow(null);
          }}
          onMarkBuilt={(row) => handleBillingMarkBuilt(row, { onSuccess: () => setBillingDetailRow(null) })}
          onNonBillable={(row) => handleBillingNonBillable(row, { onSuccess: () => setBillingDetailRow(null) })}
          onReturnToTeam={async (row, { reason }) => {
            try {
              await billingReturnServiceToTeam(row.id, { reason });
              refreshBillingReport();
              setBillingDetailRow(null);
            } catch (e) {
              window.alert(e?.message || 'Could not return service to team.');
              throw e;
            }
          }}
        />
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
              title: 'Cancel invoice',
              items: [{ id: t.id, label: `${t.invoiceNumber || `INV-${t.id}`} — ${t.clientName}` }],
            });
          }}
        />
      )}
      {editInvoiceId != null && (
        <EditInvoiceModal
          invoiceId={editInvoiceId}
          onClose={() => setEditInvoiceId(null)}
          onSaved={() => {
            reloadTxnListTab('invoices');
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
              reloadTxnListTab('receipts');
            } else if (tt === 'payment_expense' || tt === 'payment_expense_reversal') {
              reloadTxnListTab('payments');
            } else if (tt === 'payment_client_cost' || tt === 'payment_client_cost_reversal') {
              reloadTxnListTab('payment_costs');
            } else if (tt === 'tds_provisional' || tt === 'tds_final' || tt === 'tds_reversal') {
              reloadTxnListTab('tds');
            } else if (tt === 'rebate' || tt === 'rebate_reversal') {
              reloadTxnListTab('rebate');
            } else if (tt === 'credit_note') {
              reloadTxnListTab('credit_note');
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
      {ledgerReinstatePrompt && (
        <LedgerReinstateModal
          title={ledgerReinstatePrompt.title}
          items={ledgerReinstatePrompt.items}
          onClose={() => setLedgerReinstatePrompt(null)}
          onReinstated={handleLedgerReinstated}
        />
      )}
      {txnAuditModalTxn && (
        <TxnAuditLogModal key={txnAuditModalTxn.id} txn={txnAuditModalTxn} onClose={() => setTxnAuditModalTxn(null)} />
      )}

      {/* ── Recovery Log Modal ────────────────────────────────────────────────── */}
      {recoveryLogModal.open && (
        <div
          style={{ ...overlayStyle, zIndex: 1200, alignItems: 'flex-start', paddingTop: 40, paddingBottom: 40, overflowY: 'auto' }}
          role="presentation"
          onClick={closeRecoveryLogModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 680, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Recovery Log</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{recoveryLogModal.displayName} · {recoveryLogModal.entityType === 'organization' ? 'Organization' : 'Contact'}</div>
              </div>
              <button type="button" onClick={closeRecoveryLogModal} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b', lineHeight: 1 }}>×</button>
            </div>

            {/* New entry form */}
            <form onSubmit={submitRecoveryLog} style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#334155', marginBottom: 12 }}>Add follow-up entry</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569' }}>
                  Log date *
                  <input type="date" value={recoveryLogForm.log_date} onChange={(e) => setRecoveryLogForm((p) => ({ ...p, log_date: e.target.value }))} required style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569' }}>
                  Revised due date
                  <input type="date" value={recoveryLogForm.revised_due_date} onChange={(e) => setRecoveryLogForm((p) => ({ ...p, revised_due_date: e.target.value }))} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569' }}>
                  Next follow-up date
                  <input type="date" value={recoveryLogForm.next_followup_date} onChange={(e) => setRecoveryLogForm((p) => ({ ...p, next_followup_date: e.target.value }))} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }} />
                </label>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569' }}>
                  Follow-up details
                  <textarea rows={2} value={recoveryLogForm.followup_details} onChange={(e) => setRecoveryLogForm((p) => ({ ...p, followup_details: e.target.value }))} placeholder="What was discussed in this follow-up?" style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, resize: 'vertical' }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569' }}>
                  Client response
                  <textarea rows={2} value={recoveryLogForm.client_response} onChange={(e) => setRecoveryLogForm((p) => ({ ...p, client_response: e.target.value }))} placeholder="What did the client say?" style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, resize: 'vertical' }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569' }}>
                  Next follow-up details
                  <textarea rows={2} value={recoveryLogForm.next_followup_details} onChange={(e) => setRecoveryLogForm((p) => ({ ...p, next_followup_details: e.target.value }))} placeholder="What to do in the next follow-up?" style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, resize: 'vertical' }} />
                </label>
              </div>
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={closeRecoveryLogModal} style={{ padding: '7px 18px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button type="submit" disabled={recoveryLogSaving} style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: '#4f46e5', color: '#fff', cursor: recoveryLogSaving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13 }}>
                  {recoveryLogSaving ? 'Saving…' : 'Save entry'}
                </button>
              </div>
            </form>

            {/* History */}
            <div style={{ padding: '14px 20px', maxHeight: 340, overflowY: 'auto' }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#334155', marginBottom: 10 }}>History</div>
              {recoveryLogLoading ? (
                <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div>
              ) : recoveryLogEntries.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: 13 }}>No entries yet. Add the first one above.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {recoveryLogEntries.map((log) => (
                    <div key={log.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', background: '#f8fafc' }}>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 6, fontSize: 11, color: '#64748b' }}>
                        <span><strong style={{ color: '#0f172a' }}>Date:</strong> {log.log_date}</span>
                        {log.revised_due_date && <span><strong style={{ color: '#dc2626' }}>Due:</strong> {log.revised_due_date}</span>}
                        {log.next_followup_date && <span><strong style={{ color: '#0284c7' }}>Next follow-up:</strong> {log.next_followup_date}</span>}
                        {log.created_by_name && <span>by {log.created_by_name}</span>}
                      </div>
                      {log.followup_details && <div style={{ fontSize: 12, color: '#334155', marginBottom: 4 }}><strong>Follow-up:</strong> {log.followup_details}</div>}
                      {log.client_response && <div style={{ fontSize: 12, color: '#334155', marginBottom: 4 }}><strong>Client response:</strong> {log.client_response}</div>}
                      {log.next_followup_details && <div style={{ fontSize: 12, color: '#334155' }}><strong>Next action:</strong> {log.next_followup_details}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Mark NPA Modal ─────────────────────────────────────────────────────── */}
      {npaModal.open && (
        <div
          style={{ ...overlayStyle, zIndex: 1200, alignItems: 'flex-start', paddingTop: 80 }}
          role="presentation"
          onClick={closeNpaModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#fff7ed' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#9a3412' }}>Mark as NPA</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{npaModal.displayName}</div>
            </div>
            <form onSubmit={submitMarkNpa} style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
                Classification only — ledger balances will not change. Entity must have a positive receivable balance.
              </p>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569' }}>
                Reason *
                <textarea
                  rows={3}
                  value={npaReason}
                  onChange={(e) => setNpaReason(e.target.value)}
                  required
                  placeholder="Why is this entity being marked as NPA?"
                  style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, resize: 'vertical' }}
                />
              </label>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={closeNpaModal} style={{ padding: '7px 18px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button type="submit" disabled={npaSaving} style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: '#ea580c', color: '#fff', cursor: npaSaving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13 }}>
                  {npaSaving ? 'Saving…' : 'Mark as NPA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Mark Bad Debt Modal ────────────────────────────────────────────────── */}
      {badDebtModal.open && (
        <div
          style={{ ...overlayStyle, zIndex: 1200, alignItems: 'flex-start', paddingTop: 80 }}
          role="presentation"
          onClick={closeBadDebtModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#fef2f2' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#b91c1c' }}>Mark as bad debt</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{badDebtModal.displayName}</div>
            </div>
            <form onSubmit={submitMarkBadDebt} style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
                One-way transition from NPA to bad debt (terminal). Ledger balances will not change.
              </p>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569' }}>
                Reason *
                <textarea
                  rows={3}
                  value={badDebtReason}
                  onChange={(e) => setBadDebtReason(e.target.value)}
                  required
                  placeholder="Why is this being written off as bad debt?"
                  style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, resize: 'vertical' }}
                />
              </label>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={closeBadDebtModal} style={{ padding: '7px 18px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button type="submit" disabled={badDebtSaving} style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: '#dc2626', color: '#fff', cursor: badDebtSaving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13 }}>
                  {badDebtSaving ? 'Saving…' : 'Mark as bad debt'}
                </button>
              </div>
            </form>
          </div>
        </div>
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
          onSave={handleSavePaymentExpense}
        />
      )}
      {showPaymentCostModal && (
        <PaymentClientCostModal
          onClose={() => setShowPaymentCostModal(false)}
          onSave={handleSavePaymentClientCost}
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

      {/* ── KPI period + summary cards ─────────────────────────────────────── */}
      <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <DateRangeSelector
          preset={kpiPreset}
          onPresetChange={setKpiPreset}
          dateFrom={kpiDateFrom}
          onDateFromChange={setKpiDateFrom}
          dateTo={kpiDateTo}
          onDateToChange={setKpiDateTo}
        />
        {kpiPeriodLabel && (
          <span style={{ fontSize: 12, color: '#64748b', paddingBottom: 8 }}>
            Summary for {kpiPeriodLabel} · active receivables (excl. NPA/bad debt)
          </span>
        )}
      </div>
      {kpiError && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 13 }}>
          {kpiError}
        </div>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        {[
          {
            label: 'Total Billed',
            value: formatKpiAmount(kpiConsolidated?.billed),
            breakdown: kpiConsolidated && formatFinanceKpiBreakdown(
              kpiConsolidated.fees?.billed,
              kpiConsolidated.reimbursement?.billed,
              kpiConsolidated.opening,
            ),
            color: '#2563eb',
          },
          {
            label: 'Total Collected',
            value: formatKpiAmount(kpiConsolidated?.collected),
            breakdown: kpiConsolidated && formatFinanceKpiBreakdown(
              kpiConsolidated.fees?.collected,
              kpiConsolidated.reimbursement?.collected,
              kpiConsolidated.opening,
            ),
            color: '#16a34a',
          },
          {
            label: 'Outstanding',
            value: formatKpiAmount(kpiConsolidated?.outstanding),
            breakdown: kpiConsolidated && formatFinanceKpiBreakdown(
              kpiConsolidated.fees?.outstanding,
              kpiConsolidated.reimbursement?.outstanding,
              kpiConsolidated.opening,
            ),
            color: '#d97706',
            breakdownNote: 'Closing at period end',
          },
          {
            label: 'TDS Pending',
            value: formatKpiAmount(financeSummary?.tdsPending),
            breakdown: 'All active provisional TDS',
            color: '#7c3aed',
          },
        ].map((s) => (
          <div key={s.label} style={{ background:'#fff', borderRadius:10, padding:'16px 20px', boxShadow:'0 1px 3px rgba(0,0,0,.08)', borderLeft:`4px solid ${s.color}` }}>
            <div style={{ fontSize:22, fontWeight:700, color:'#1e293b' }}>{s.value}</div>
            <div style={{ fontSize:12, color:'#64748b', marginTop:4 }}>{s.label}</div>
            {s.breakdown && !kpiLoading && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, lineHeight: 1.4 }}>
                {s.breakdown}
                {s.breakdownNote ? ` · ${s.breakdownNote}` : ''}
              </div>
            )}
          </div>
        ))}
      </div>
      {tab === 'receipts' && (
        <p style={{ fontSize: 11, color: '#94a3b8', margin: '-12px 0 16px' }}>
          Receipt list filters below do not affect the summary cards above.
        </p>
      )}

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
        {tab==='payment_costs' && (
          <button onClick={() => setShowPaymentCostModal(true)} style={{ ...btnPrimary, marginLeft:'auto' }}>+ Payment</button>
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
            flexWrap: 'wrap',
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
                    : tab === 'payment_costs'
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
          {tab === 'receipts' && (
            <>
              <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                Period from
              </label>
              <DateInput
                style={{ ...inputStyle, width: 140, minWidth: 120 }}
                value={receiptsFilterDateFrom}
                onChange={(e) => setReceiptsFilterDateFrom(e.target.value)}
              />
              <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                to
              </label>
              <DateInput
                style={{ ...inputStyle, width: 140, minWidth: 120 }}
                value={receiptsFilterDateTo}
                onChange={(e) => setReceiptsFilterDateTo(e.target.value)}
              />
              <label htmlFor="receipts-ledger-view" style={{ fontSize: 12, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                Ledger view
              </label>
              <select
                id="receipts-ledger-view"
                style={{ ...inputStyle, width: 168, minWidth: 140 }}
                value={receiptsLedgerView}
                onChange={(e) => setReceiptsLedgerView(e.target.value)}
              >
                <option value="fees">Fees only</option>
                <option value="reimbursement">Reimbursement only</option>
                <option value="all">All (consolidated)</option>
              </select>
              {(receiptsFilterDateFrom || receiptsFilterDateTo) && (
                <button
                  type="button"
                  style={{ ...btnSecondary, fontSize: 12, padding: '6px 10px', whiteSpace: 'nowrap' }}
                  onClick={() => {
                    setReceiptsFilterDateFrom('');
                    setReceiptsFilterDateTo('');
                  }}
                >
                  Clear dates
                </button>
              )}
            </>
          )}
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

      {TXN_LIST_SEARCH_TABS.has(tab) && txnListFetchError && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca', fontSize: 13, color: '#991b1b' }}>
          {txnListFetchError}
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
                  title: 'Cancel invoices',
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
          {renderTxnListPagination('invoices', invLoading, 'top')}
          <table style={tableStyle}>
            <thead>
              <tr>
                {canDeleteInvoice && (
                  <th style={{ ...thStyle, width: 36 }}>
                    <input
                      type="checkbox"
                      title="Select all"
                      checked={invoices.length > 0 && invoices.every((i) => selectedInvoiceIds.some((x) => Number(x) === Number(i.id)))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedInvoiceIds(invoices.map((x) => x.id));
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
              ) : invoices.length === 0 && !txnListSearchDebounced ? (
                <tr><td colSpan={canDeleteInvoice ? 10 : 9} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No invoices yet. Raise one to begin.</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={canDeleteInvoice ? 10 : 9} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No invoices match your filters.</td></tr>
              ) : invoices.map(i=>(
                <tr
                  key={i.id}
                  id={`txn-row-${i.id}`}
                  style={{ ...ledgerRowStyle({ ...trStyle, cursor: 'pointer' }, i) }}
                  onClick={() => setViewInvoiceTxn(i)}
                >
                  {canDeleteInvoice && (
                    <td style={{ ...tdStyle, width: 36 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        disabled={isLedgerInactive(i)}
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
                    <TxnAuditEyeButton txnId={i.id} onOpenAudit={setTxnAuditModalTxn} />
                    <button type="button" style={iconBtn} onClick={() => setViewInvoiceTxn(i)}>👁 View</button>
                    {isLedgerCancelled(i) && canDeleteInvoice && (
                      <button
                        type="button"
                        style={{ ...iconBtn, color: '#15803d' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openLedgerReinstatePrompt(i, `${i.invoiceNumber || `INV-${i.id}`} — ${i.clientName}`);
                        }}
                      >
                        ↩ Reinstate
                      </button>
                    )}
                    {!isLedgerInactive(i) && canEditInvoice && (
                      <button type="button" style={iconBtn} onClick={() => setEditInvoiceId(i.id)}>✏️ Edit</button>
                    )}
                    {!isLedgerInactive(i) && (
                      <button type="button" style={iconBtn} onClick={() => { setSelectedInvoice(i); setShowRecordPayment(true); }}>💳 Pay</button>
                    )}
                    {!isLedgerInactive(i) && canCreateInvoice && ['sent', 'partially_paid', 'overdue'].includes(String(i.invoiceStatus || i.status || '')) && (
                      <button type="button" style={iconBtn} onClick={(e) => { e.stopPropagation(); handleRazorpayCollect(i); }} title="Collect with Razorpay">₹ Razorpay</button>
                    )}
                    {!isLedgerInactive(i) && canDeleteInvoice && (
                      <button
                        type="button"
                        style={iconBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setLedgerDeletePrompt({
                            title: 'Cancel invoice',
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
          {renderTxnListPagination('invoices', invLoading, 'bottom')}
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
                  title: 'Cancel receipts',
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
          {renderTxnListPagination('receipts', recLoading, 'top')}
          <table style={tableStyle}>
            <thead>
              <tr>
                {canDeleteInvoice && (
                  <th style={{ ...thStyle, width: 36 }}>
                    <input
                      type="checkbox"
                      title="Select all"
                      checked={receipts.length > 0 && receipts.every((r) => selectedReceiptIds.some((x) => Number(x) === Number(r.id)))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedReceiptIds(receipts.map((x) => x.id));
                        } else {
                          setSelectedReceiptIds([]);
                        }
                      }}
                    />
                  </th>
                )}
                {['Date','Ref','Status','Client','Amount','Method','Reference No.','Billing Profile','Linked Invoice','Notes','Last updated by','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {recLoading ? (
                <tr><td colSpan={canDeleteInvoice ? 13 : 12} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Loading receipts…</td></tr>
              ) : txnListFetchError ? (
                <tr><td colSpan={canDeleteInvoice ? 13 : 12} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Could not load receipts.</td></tr>
              ) : receipts.length === 0 && !txnListSearchDebounced && !receiptsFiltersActive ? (
                <tr><td colSpan={canDeleteInvoice ? 13 : 12} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No fees receipts found. Click "+ Receipt" to record one.</td></tr>
              ) : receipts.length === 0 ? (
                <tr><td colSpan={canDeleteInvoice ? 13 : 12} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No receipts match your search or filters.</td></tr>
              ) : receipts.map(r=>(
                <tr key={r.id} style={ledgerRowStyle(trStyle, r)}>
                  {canDeleteInvoice && (
                    <td style={{ ...tdStyle, width: 36 }}>
                      <input
                        type="checkbox"
                        disabled={isLedgerInactive(r)}
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
                  <td style={tdStyle}><LedgerStatusBadge txn={r} /></td>
                  <td style={tdStyle}>{r.clientName}</td>
                  <td style={{ ...tdStyle, fontWeight:600, color: isLedgerInactive(r) ? '#64748b' : '#16a34a' }}>{formatSignedInrAmount(r.txnType, r.amount || r.credit || 0)}</td>
                  <td style={tdStyle}>{r.paymentMethod || '—'}</td>
                  <td style={{ ...tdStyle, fontFamily:'monospace', fontSize:12 }}>{r.referenceNumber || '—'}</td>
                  <td style={tdStyle}><BillingProfileBadge code={r.billingProfileCode} /></td>
                  <td style={tdStyle}>{r.linkedTxnId ? `#${r.linkedTxnId}` : '—'}</td>
                  <td style={tdStyle}>{r.notes || '—'}</td>
                  <LastUpdatedByCell txn={r} onOpenAudit={setTxnAuditModalTxn} tdStyle={tdStyle} />
                  <td style={tdStyle}>
                    <LedgerRowActions
                      txn={r}
                      canEdit={canEditInvoice}
                      canDelete={canDeleteInvoice}
                      extraBefore={<TxnAuditEyeButton txnId={r.id} onOpenAudit={setTxnAuditModalTxn} />}
                      onEdit={(txn) => setEditLedgerTxnId(txn.id)}
                      onCancelPrompt={(txn) => setLedgerDeletePrompt({
                        title: 'Cancel receipt',
                        items: [{
                          id: txn.id,
                          label: `${txn.txnDate || '—'} — ${txn.clientName} — ${formatSignedInrAmount(txn.txnType, txn.amount || txn.credit || 0)}`,
                        }],
                      })}
                      onReinstatePrompt={(txn) => openLedgerReinstatePrompt(
                        txn,
                        `${txn.txnDate || '—'} — ${txn.clientName} — ${formatSignedInrAmount(txn.txnType, txn.amount || txn.credit || 0)}`,
                      )}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {renderTxnListPagination('receipts', recLoading, 'bottom')}
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
                  title: 'Cancel payments (on behalf)',
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
          {renderTxnListPagination('payments', payLoading, 'top')}
          <div style={{ overflowX: 'auto' }}>
            <div style={{ padding: '8px 14px', fontSize: 11, color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>
              Scroll right for narration, notes, and actions.
            </div>
            <table style={{ ...tableStyle, minWidth: 1600 }}>
            <thead>
              <tr>
                {canDeleteInvoice && (
                  <th style={{ ...thStyle, width: 36 }}>
                    <input
                      type="checkbox"
                      title="Select all"
                      checked={paymentExpenses.length > 0 && paymentExpenses.every((p) => selectedPaymentIds.some((x) => Number(x) === Number(p.id)))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPaymentIds(paymentExpenses.map((x) => x.id));
                        } else {
                          setSelectedPaymentIds([]);
                        }
                      }}
                    />
                  </th>
                )}
                {PAYMENT_LIST_COLUMNS.map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
                <th style={stickyActionsThStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payLoading ? (
                <tr><td colSpan={canDeleteInvoice ? 18 : 17} style={{ ...tdStyle, textAlign: 'center', padding: 24, color: '#94a3b8' }}>Loading payments…</td></tr>
              ) : paymentExpenses.length === 0 && !txnListSearchDebounced ? (
                <tr><td colSpan={canDeleteInvoice ? 18 : 17} style={{ ...tdStyle, textAlign: 'center', padding: 24, color: '#94a3b8' }}>No payments on behalf found. Click &quot;+ Payment&quot; to record one.</td></tr>
              ) : paymentExpenses.length === 0 ? (
                <tr><td colSpan={canDeleteInvoice ? 18 : 17} style={{ ...tdStyle, textAlign: 'center', padding: 24, color: '#94a3b8' }}>No payments match your search.</td></tr>
              ) : paymentExpenses.map((p) => {
                const ledgerMismatch = ledgerClientId && !paymentsFilterByLedger && (
                  !paymentExpenseMatchesLedgerSelection(p, ledgerClientId, ledgerEntityType)
                  || normalizeLedgerClassForApi(p.ledgerClass) !== normalizeLedgerClassForApi(ledgerLedgerClass)
                );
                const rowBg = ledgerMismatch ? '#fffbeb' : '#fff';
                return (
                <tr
                  key={p.id}
                  style={{
                    ...ledgerRowStyle(trStyle, p),
                    ...(ledgerMismatch ? { background: '#fffbeb', textDecoration: isLedgerInactive(p) ? 'line-through' : undefined } : {}),
                    ...(canEditInvoice && isLedgerEditable(p) ? { cursor: 'pointer' } : {}),
                  }}
                  onClick={canEditInvoice && isLedgerEditable(p) ? () => setEditLedgerTxnId(p.id) : undefined}
                >
                  {canDeleteInvoice && (
                    <td style={{ ...tdStyle, width: 36 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        disabled={isLedgerInactive(p)}
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
                  <td style={tdStyle}><LedgerStatusBadge txn={p} /></td>
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
                  <td style={stickyActionsTdStyle(rowBg)} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      style={iconBtn}
                      title="Open Ledger tab with this entity and ledger filters"
                      onClick={(e) => { e.stopPropagation(); openLedgerFromPaymentExpense(p); }}
                    >
                      Ledger
                    </button>
                    <LedgerRowActions
                      txn={p}
                      canEdit={canEditInvoice}
                      canDelete={canDeleteInvoice}
                      extraBefore={<TxnAuditEyeButton txnId={p.id} onOpenAudit={setTxnAuditModalTxn} />}
                      onEdit={(txn) => setEditLedgerTxnId(txn.id)}
                      onCancelPrompt={(txn) => setLedgerDeletePrompt({
                        title: 'Cancel payment (on behalf)',
                        items: [{
                          id: txn.id,
                          label: `${txn.txnDate || '—'} — ${txn.clientName} — ${formatSignedInrAmount(txn.txnType, txn.amount || 0)}`,
                        }],
                      })}
                      onReinstatePrompt={(txn) => openLedgerReinstatePrompt(
                        txn,
                        `${txn.txnDate || '—'} — ${txn.clientName} — ${formatSignedInrAmount(txn.txnType, txn.amount || 0)}`,
                      )}
                    />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          {renderTxnListPagination('payments', payLoading, 'bottom')}
        </div>
      )}

      {/* ── Tab: Payments (costs) ─────────────────────────────────────────── */}
      {tab === 'payment_costs' && (
        <div style={cardStyle}>
          <div style={{
            padding: '10px 14px',
            background: '#f5f3ff',
            borderBottom: '1px solid #ddd6fe',
            fontSize: 12,
            color: '#5b21b6',
          }}
          >
            Client costs are bundled in your fees — not recoverable. They do not appear on the client Ledger tab or Recovery list; only firm cash-out is recorded.
          </div>
          {canDeleteInvoice && selectedPaymentCostIds.length > 0 && (
            <div style={{ padding: '10px 16px', background: '#fef2f2', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#991b1b', fontWeight: 600 }}>{selectedPaymentCostIds.length} selected</span>
              <button
                type="button"
                style={{ ...btnPrimary, background: '#b91c1c', fontSize: 12, padding: '6px 12px' }}
                onClick={() => setLedgerDeletePrompt({
                  title: 'Cancel client cost payments',
                  items: selectedPaymentCostIds.map((id) => {
                    const p = paymentClientCosts.find((x) => Number(x.id) === Number(id));
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
              <button type="button" style={{ ...btnSecondary, fontSize: 12, padding: '6px 12px' }} onClick={() => setSelectedPaymentCostIds([])}>Clear selection</button>
            </div>
          )}
          {renderTxnListPagination('payment_costs', payCostLoading, 'top')}
          <div style={{ overflowX: 'auto' }}>
            <div style={{ padding: '8px 14px', fontSize: 11, color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>
              Scroll right for narration, notes, and actions.
            </div>
            <table style={{ ...tableStyle, minWidth: 1600 }}>
            <thead>
              <tr>
                {canDeleteInvoice && (
                  <th style={{ ...thStyle, width: 36 }}>
                    <input
                      type="checkbox"
                      title="Select all"
                      checked={paymentClientCosts.length > 0 && paymentClientCosts.every((p) => selectedPaymentCostIds.some((x) => Number(x) === Number(p.id)))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPaymentCostIds(paymentClientCosts.map((x) => x.id));
                        } else {
                          setSelectedPaymentCostIds([]);
                        }
                      }}
                    />
                  </th>
                )}
                {PAYMENT_LIST_COLUMNS.map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
                <th style={stickyActionsThStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payCostLoading ? (
                <tr><td colSpan={canDeleteInvoice ? 18 : 17} style={{ ...tdStyle, textAlign: 'center', padding: 24, color: '#94a3b8' }}>Loading client cost payments…</td></tr>
              ) : paymentClientCosts.length === 0 && !txnListSearchDebounced ? (
                <tr><td colSpan={canDeleteInvoice ? 18 : 17} style={{ ...tdStyle, textAlign: 'center', padding: 24, color: '#94a3b8' }}>No client cost payments found. Click &quot;+ Payment&quot; to record one.</td></tr>
              ) : paymentClientCosts.length === 0 ? (
                <tr><td colSpan={canDeleteInvoice ? 18 : 17} style={{ ...tdStyle, textAlign: 'center', padding: 24, color: '#94a3b8' }}>No payments match your search.</td></tr>
              ) : paymentClientCosts.map((p) => (
                <tr
                  key={p.id}
                  style={{ ...ledgerRowStyle(trStyle, p), ...(canEditInvoice && isLedgerEditable(p) ? { cursor: 'pointer' } : {}) }}
                  onClick={canEditInvoice && isLedgerEditable(p) ? () => setEditLedgerTxnId(p.id) : undefined}
                >
                  {canDeleteInvoice && (
                    <td style={{ ...tdStyle, width: 36 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        disabled={isLedgerInactive(p)}
                        checked={selectedPaymentCostIds.some((x) => Number(x) === Number(p.id))}
                        onChange={() => setSelectedPaymentCostIds((prev) => {
                          const has = prev.some((x) => Number(x) === Number(p.id));
                          return has ? prev.filter((x) => Number(x) !== Number(p.id)) : [...prev, p.id];
                        })}
                      />
                    </td>
                  )}
                  <td style={tdStyle}>{p.txnDate}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{p.publicRef || '—'}</td>
                  <td style={tdStyle}>{p.clientName}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{paymentExpenseBookedOnLabel(p) || '—'}</td>
                  <td style={tdStyle}>Client Costs</td>
                  <td style={tdStyle}><LedgerStatusBadge txn={p} /></td>
                  <td style={tdStyle}>
                    {p.ledgerMovementKind === 'reimbursement'
                      ? 'Reimbursement'
                      : p.ledgerMovementKind === 'fees'
                        ? 'Fees'
                        : '—'}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: '#5b21b6' }} title="Firm cash out (non-recoverable)">{formatSignedInrAmount(p.txnType, p.amount || 0)}</td>
                  <td style={tdStyle}>{expensePurposeLabel(p.expensePurpose)}</td>
                  <td style={tdStyle}>{p.paymentMethod || '—'}</td>
                  <td style={{ ...tdStyle, maxWidth: 140, whiteSpace: 'normal' }}>{p.paidFrom || '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{p.referenceNumber || '—'}</td>
                  <td style={{ ...tdStyle, maxWidth: 200, whiteSpace: 'normal' }}>{p.narration || '—'}</td>
                  <td style={tdStyle}><BillingProfileBadge code={p.billingProfileCode} /></td>
                  <td style={{ ...tdStyle, maxWidth: 160, whiteSpace: 'normal' }}>{p.notes || '—'}</td>
                  <LastUpdatedByCell txn={p} onOpenAudit={setTxnAuditModalTxn} tdStyle={tdStyle} />
                  <td style={stickyActionsTdStyle('#fff')} onClick={(e) => e.stopPropagation()}>
                    <LedgerRowActions
                      txn={p}
                      canEdit={canEditInvoice}
                      canDelete={canDeleteInvoice}
                      extraBefore={<TxnAuditEyeButton txnId={p.id} onOpenAudit={setTxnAuditModalTxn} />}
                      onEdit={(txn) => setEditLedgerTxnId(txn.id)}
                      onCancelPrompt={(txn) => setLedgerDeletePrompt({
                        title: 'Cancel client cost payment',
                        items: [{
                          id: txn.id,
                          label: `${txn.txnDate || '—'} — ${txn.clientName} — ${formatSignedInrAmount(txn.txnType, txn.amount || 0)}`,
                        }],
                      })}
                      onReinstatePrompt={(txn) => openLedgerReinstatePrompt(
                        txn,
                        `${txn.txnDate || '—'} — ${txn.clientName} — ${formatSignedInrAmount(txn.txnType, txn.amount || 0)}`,
                      )}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {renderTxnListPagination('payment_costs', payCostLoading, 'bottom')}
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
                  title: 'Cancel TDS entries',
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
          {renderTxnListPagination('tds', tdsLoading, 'top')}
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 44, fontSize: 11 }} title="Mark provisional as final">Final</th>
                {canDeleteInvoice && <th style={{ ...thStyle, width: 36, fontSize: 11 }}>Del</th>}
                {['Date','Client','Amount','Section','Rate','TDS type','Ledger status','Billing Profile','Last updated by'].map(h=><th key={h} style={thStyle}>{h}</th>)}
                {(canEditInvoice || canDeleteInvoice) && <th style={thStyle}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {tdsLoading ? (
                <tr><td colSpan={10 + (canDeleteInvoice ? 1 : 0) + ((canEditInvoice || canDeleteInvoice) ? 1 : 0)} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Loading TDS entries…</td></tr>
              ) : txnListFetchError ? (
                <tr><td colSpan={10 + (canDeleteInvoice ? 1 : 0) + ((canEditInvoice || canDeleteInvoice) ? 1 : 0)} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Could not load TDS entries.</td></tr>
              ) : tdsEntries.length === 0 && !txnListSearchDebounced ? (
                <tr><td colSpan={10 + (canDeleteInvoice ? 1 : 0) + ((canEditInvoice || canDeleteInvoice) ? 1 : 0)} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No TDS entries found. Click "+ Book TDS" to add one.</td></tr>
              ) : tdsEntries.length === 0 ? (
                <tr><td colSpan={10 + (canDeleteInvoice ? 1 : 0) + ((canEditInvoice || canDeleteInvoice) ? 1 : 0)} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No TDS entries match your search.</td></tr>
              ) : tdsEntries.map(t=>(
                <tr key={t.id} style={ledgerRowStyle(trStyle, t)}>
                  <td style={{ ...tdStyle, width:44 }}>
                    {t.tdsStatus === 'provisional' && !isLedgerInactive(t) && (
                      <input type="checkbox" checked={selectedTds.includes(t.id)} onChange={()=>toggleTdsSelect(t.id)} />
                    )}
                  </td>
                  {canDeleteInvoice && (
                    <td style={{ ...tdStyle, width:36 }}>
                      <input
                        type="checkbox"
                        disabled={isLedgerInactive(t)}
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
                  <td style={tdStyle}><LedgerStatusBadge txn={t} /></td>
                  <td style={tdStyle}><BillingProfileBadge code={t.billingProfileCode} /></td>
                  <LastUpdatedByCell txn={t} onOpenAudit={setTxnAuditModalTxn} tdStyle={tdStyle} />
                  {(canEditInvoice || canDeleteInvoice) && (
                    <td style={tdStyle}>
                      <LedgerRowActions
                        txn={t}
                        canEdit={canEditInvoice}
                        canDelete={canDeleteInvoice}
                        extraBefore={<TxnAuditEyeButton txnId={t.id} onOpenAudit={setTxnAuditModalTxn} />}
                        onEdit={(txn) => setEditLedgerTxnId(txn.id)}
                        onCancelPrompt={(txn) => setLedgerDeletePrompt({
                          title: 'Cancel TDS entry',
                          items: [{
                            id: txn.id,
                            label: `${txn.txnDate || '—'} — ${txn.clientName} — ${formatSignedInrAmount(txn.txnType, txn.amount || 0)} (${txn.txnType || ''})`,
                          }],
                        })}
                        onReinstatePrompt={(txn) => openLedgerReinstatePrompt(
                          txn,
                          `${txn.txnDate || '—'} — ${txn.clientName} — ${formatSignedInrAmount(txn.txnType, txn.amount || 0)} (${txn.txnType || ''})`,
                        )}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {renderTxnListPagination('tds', tdsLoading, 'bottom')}
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
                  title: 'Cancel rebate / discount',
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
          {renderTxnListPagination('rebate', rebLoading, 'top')}
          <table style={tableStyle}>
            <thead>
              <tr>
                {canDeleteInvoice && (
                  <th style={{ ...thStyle, width: 36 }}>
                    <input
                      type="checkbox"
                      title="Select all"
                      checked={rebates.length > 0 && rebates.every((r) => selectedRebateIds.some((x) => Number(x) === Number(r.id)))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRebateIds(rebates.map((x) => x.id));
                        } else {
                          setSelectedRebateIds([]);
                        }
                      }}
                    />
                  </th>
                )}
                {['Date','Client','Amount','Status','Narration','Billing Profile','Notes','Last updated by','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rebLoading ? (
                <tr><td colSpan={canDeleteInvoice ? 10 : 9} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Loading rebate entries…</td></tr>
              ) : txnListFetchError ? (
                <tr><td colSpan={canDeleteInvoice ? 10 : 9} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Could not load rebate entries.</td></tr>
              ) : rebates.length === 0 && !txnListSearchDebounced ? (
                <tr><td colSpan={canDeleteInvoice ? 10 : 9} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No rebate/discount entries found. Click "+ Rebate/Discount" to add one.</td></tr>
              ) : rebates.length === 0 ? (
                <tr><td colSpan={canDeleteInvoice ? 10 : 9} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No entries match your search.</td></tr>
              ) : rebates.map(r=>(
                <tr key={r.id} style={ledgerRowStyle(trStyle, r)}>
                  {canDeleteInvoice && (
                    <td style={{ ...tdStyle, width: 36 }}>
                      <input
                        type="checkbox"
                        disabled={isLedgerInactive(r)}
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
                  <td style={{ ...tdStyle, fontWeight:600, color: isLedgerInactive(r) ? '#64748b' : '#be123c' }}>₹{r.amount.toLocaleString('en-IN')}</td>
                  <td style={tdStyle}><LedgerStatusBadge txn={r} /></td>
                  <td style={tdStyle}>{r.narration || '—'}</td>
                  <td style={tdStyle}><BillingProfileBadge code={r.billingProfileCode} /></td>
                  <td style={tdStyle}>{r.notes || '—'}</td>
                  <LastUpdatedByCell txn={r} onOpenAudit={setTxnAuditModalTxn} tdStyle={tdStyle} />
                  <td style={tdStyle}>
                    <LedgerRowActions
                      txn={r}
                      canEdit={false}
                      canDelete={canDeleteInvoice}
                      extraBefore={<TxnAuditEyeButton txnId={r.id} onOpenAudit={setTxnAuditModalTxn} />}
                      onEdit={() => {}}
                      onCancelPrompt={(txn) => setLedgerDeletePrompt({
                        title: 'Cancel rebate / discount',
                        items: [{
                          id: txn.id,
                          label: `${txn.txnDate || '—'} — ${txn.clientName} — ₹${(txn.amount || 0).toLocaleString('en-IN')}`,
                        }],
                      })}
                      onReinstatePrompt={(txn) => openLedgerReinstatePrompt(
                        txn,
                        `${txn.txnDate || '—'} — ${txn.clientName} — ₹${(txn.amount || 0).toLocaleString('en-IN')}`,
                      )}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {renderTxnListPagination('rebate', rebLoading, 'bottom')}
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
                  title: 'Cancel credit notes',
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
          {renderTxnListPagination('credit_note', cnLoading, 'top')}
          <table style={tableStyle}>
            <thead>
              <tr>
                {canDeleteInvoice && (
                  <th style={{ ...thStyle, width: 36 }}>
                    <input
                      type="checkbox"
                      title="Select all"
                      checked={creditNotes.length > 0 && creditNotes.every((c) => selectedCreditNoteIds.some((x) => Number(x) === Number(c.id)))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCreditNoteIds(creditNotes.map((x) => x.id));
                        } else {
                          setSelectedCreditNoteIds([]);
                        }
                      }}
                    />
                  </th>
                )}
                {['Date','Client','Amount','Status','Linked Invoice','Narration','Billing Profile','Last updated by','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {cnLoading ? (
                <tr><td colSpan={canDeleteInvoice ? 10 : 9} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Loading credit notes…</td></tr>
              ) : txnListFetchError ? (
                <tr><td colSpan={canDeleteInvoice ? 10 : 9} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Could not load credit notes.</td></tr>
              ) : creditNotes.length === 0 && !txnListSearchDebounced ? (
                <tr><td colSpan={canDeleteInvoice ? 10 : 9} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No credit notes found. Click "+ Credit Note" to add one.</td></tr>
              ) : creditNotes.length === 0 ? (
                <tr><td colSpan={canDeleteInvoice ? 10 : 9} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>No credit notes match your search.</td></tr>
              ) : creditNotes.map(c=>(
                <tr key={c.id} style={ledgerRowStyle(trStyle, c)}>
                  {canDeleteInvoice && (
                    <td style={{ ...tdStyle, width: 36 }}>
                      <input
                        type="checkbox"
                        disabled={isLedgerInactive(c)}
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
                  <td style={{ ...tdStyle, fontWeight:600, color: isLedgerInactive(c) ? '#64748b' : '#854d0e' }}>₹{c.amount.toLocaleString('en-IN')}</td>
                  <td style={tdStyle}><LedgerStatusBadge txn={c} /></td>
                  <td style={tdStyle}>{c.linkedTxnId ? `#${c.linkedTxnId}` : '—'}</td>
                  <td style={tdStyle}>{c.narration || '—'}</td>
                  <td style={tdStyle}><BillingProfileBadge code={c.billingProfileCode} /></td>
                  <LastUpdatedByCell txn={c} onOpenAudit={setTxnAuditModalTxn} tdStyle={tdStyle} />
                  <td style={tdStyle}>
                    <LedgerRowActions
                      txn={c}
                      canEdit={false}
                      canDelete={canDeleteInvoice}
                      extraBefore={<TxnAuditEyeButton txnId={c.id} onOpenAudit={setTxnAuditModalTxn} />}
                      onEdit={() => {}}
                      onCancelPrompt={(txn) => setLedgerDeletePrompt({
                        title: 'Cancel credit note',
                        items: [{
                          id: txn.id,
                          label: `${txn.txnDate || '—'} — ${txn.clientName} — ₹${(txn.amount || 0).toLocaleString('en-IN')}${txn.linkedTxnId ? ` (inv #${txn.linkedTxnId})` : ''}`,
                        }],
                      })}
                      onReinstatePrompt={(txn) => openLedgerReinstatePrompt(
                        txn,
                        `${txn.txnDate || '—'} — ${txn.clientName} — ₹${(txn.amount || 0).toLocaleString('en-IN')}${txn.linkedTxnId ? ` (inv #${txn.linkedTxnId})` : ''}`,
                      )}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {renderTxnListPagination('credit_note', cnLoading, 'bottom')}
        </div>
      )}

      {/* ── Tab: Ledger ───────────────────────────────────────────────────── */}
      {tab==='ledger' && (
        <div style={cardStyle}>
          <div style={ledgerToolbarBarStyle}>
            <div style={ledgerToolbarGroupStyle}>
              <span style={ledgerToolbarLabelStyle}>Scope:</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[
                  { key: 'entity', label: 'Client' },
                  { key: 'group', label: 'Group' },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => switchLedgerScope(opt.key)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: ledgerScope === opt.key ? '1px solid #6366f1' : '1px solid #cbd5e1',
                      background: ledgerScope === opt.key ? '#eef2ff' : '#fff',
                      color: ledgerScope === opt.key ? '#4338ca' : '#475569',
                      fontWeight: ledgerScope === opt.key ? 600 : 500,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={ledgerToolbarGroupStyle}>
              <span style={ledgerToolbarLabelStyle}>{isGroupLedgerScope ? 'Group:' : 'Client:'}</span>
              <div style={{ flex: '0 0 clamp(200px, 26vw, 300px)', minWidth: 0 }}>
                {isGroupLedgerScope ? (
                  <GroupSearchDropdown
                    value={ledgerGroupId}
                    displayValue={ledgerGroupName}
                    onChange={(g) => {
                      setLedgerGroupId(String(g.id));
                      setLedgerGroupName(g.displayName);
                    }}
                    placeholder="Search client group…"
                  />
                ) : (
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
                )}
              </div>
            </div>
            {!isGroupLedgerScope && ledgerClientId && ledgerRecoveryStatus?.status && (
              <div style={ledgerToolbarGroupStyle}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '4px 10px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    background: ledgerRecoveryStatus.status === 'bad_debt' ? '#fef2f2' : '#fff7ed',
                    color: ledgerRecoveryStatus.status === 'bad_debt' ? '#b91c1c' : '#c2410c',
                    border: `1px solid ${ledgerRecoveryStatus.status === 'bad_debt' ? '#fecaca' : '#fed7aa'}`,
                  }}
                  title={
                    ledgerRecoveryStatus.status === 'bad_debt'
                      ? (ledgerRecoveryStatus.badDebtReason || 'Marked as bad debt')
                      : (ledgerRecoveryStatus.npaReason || 'Marked as NPA')
                  }
                >
                  {ledgerRecoveryStatus.status === 'bad_debt' ? 'Bad debt' : 'NPA'}
                </span>
              </div>
            )}
            <div style={ledgerToolbarScrollTailStyle}>
            {ledgerScopeReady && (
              <>
                <div style={ledgerToolbarGroupStyle}>
                  <span style={ledgerToolbarLabelStyle}>Ledger type:</span>
                  <select
                    style={{ ...ledgerToolbarSelectStyle, minWidth: 130 }}
                    value={ledgerLedgerClass}
                    onChange={(e) => { setLedgerLedgerClass(e.target.value); setLedgerLimit(0); }}
                  >
                    {LEDGER_CLASS_OPTIONS_WITH_ALL.map((o) => (
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
            {ledgerScopeReady && !ledgerLoading && (
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
            {ledgerScopeReady && !ledgerLoading && ledgerDisplayRows.length > 0 && (
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
                      clientName: ledgerScopeDisplayName,
                      fyLabel: fy,
                      dateFrom: ledgerFilterDateFrom,
                      dateTo: ledgerFilterDateTo,
                      includeEntityColumn: isGroupLedgerScope,
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
                      clientName: ledgerScopeDisplayName,
                      fyLabel: fy,
                      dateFrom: ledgerFilterDateFrom,
                      dateTo: ledgerFilterDateTo,
                      logoSrc: ledgerLogoUrl,
                      includeEntityColumn: isGroupLedgerScope,
                    }).catch(() => {});
                  }}
                >
                  ⬇ PDF
                </button>
              </div>
            )}
            {!isGroupLedgerScope && ledgerClientId && (
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
                {ledgerClientId && (
                  <button
                    type="button"
                    style={{ ...btnSecondary, fontSize:12, padding:'6px 12px', whiteSpace:'nowrap', borderColor: '#6366f1', color: '#4338ca' }}
                    onClick={() => openRecoveryLogModal({
                      entityType: ledgerEntityType === 'organization' ? 'organization' : 'client',
                      entityId: parseInt(ledgerClientId, 10),
                      displayName: ledgerClientName,
                    })}
                  >
                    Recovery Log
                  </button>
                )}
              </div>
            )}
            </div>
          </div>
          {ledgerScopeReady && (
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
              {isGroupLedgerScope && (
                <span>
                  Consolidated ledger for group <strong>{ledgerGroupName}</strong>. Opening balances from all members are merged into one row.
                </span>
              )}
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
          {ledgerScopeReady && ledgerLimit > 0 && (
            <div style={{ padding: '6px 16px', background: '#fffbeb', borderBottom: '1px solid #fde68a', fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 12 }}>
              Showing last {ledgerLimit} transactions.
              <button type="button" onClick={() => setLedgerLimit(0)} style={{ fontSize: 11, padding: '2px 10px', borderRadius: 5, border: '1px solid #b45309', background: 'none', color: '#b45309', cursor: 'pointer' }}>
                View all
              </button>
            </div>
          )}
          {!ledgerScopeReady ? (
            <div style={{ padding:32, textAlign:'center', color:'#94a3b8', fontSize:13 }}>
              {isGroupLedgerScope
                ? 'Search for a client group above to view the consolidated group ledger.'
                : 'Search for a client above to view their ledger.'}
            </div>
          ) : ledgerLedgerClass === 'all' ? (
            // ── All-classes consolidated view ──────────────────────────────────
            <div>
              {ledgerLoading ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading ledger…</div>
              ) : (['regular', 'memorandum', 'optional', 'parked'].map((cls) => {
                const clsRows = ledgerAllClasses?.[cls] || [];
                return (
                  <div key={cls}>
                    <div style={{ padding: '8px 16px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 13, color: '#334155', display: 'flex', alignItems: 'center', gap: 10 }}>
                      {cls.charAt(0).toUpperCase() + cls.slice(1)} Ledger
                      <span style={{ fontWeight: 400, fontSize: 11, color: '#64748b' }}>({clsRows.length} entries)</span>
                    </div>
                    {clsRows.length === 0 ? (
                      <div style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 12 }}>No entries in this ledger class.</div>
                    ) : (
                      <table style={{ ...tableStyle, marginBottom: 0 }}>
                        <thead>
                          <tr>
                            {ledgerTableHeaders(cls === 'parked' && canEditInvoice && !isGroupLedgerScope).map(h=>(
                              <th key={h} style={thStyle}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {clsRows.map((e, i) => (
                            <tr
                              key={e.synthetic ? e.id : `${e.id ?? 'row'}-${i}`}
                              style={{
                                ...trStyle,
                                ...(e.txnType === 'opening_balance' ? { background: '#fffbeb' } : {}),
                                ...(e.txnType === 'brought_forward' ? { background: '#f1f5f9' } : {}),
                              }}
                            >
                              <td style={tdStyle}>{e.txnDate || e.date || '—'}</td>
                              {isGroupLedgerScope && (
                                <td style={tdStyle}>{e.entityName || '—'}</td>
                              )}
                              <td style={tdStyle}><TxnTypeBadge type={e.txnType} /></td>
                              <td style={{ ...tdStyle, fontStyle: e.txnType === 'opening_balance' || e.txnType === 'brought_forward' ? 'italic' : 'normal' }}>{e.narration || '—'}</td>
                              <td style={{ ...tdStyle, whiteSpace: 'normal', maxWidth: 280, fontSize: 12, color: '#64748b' }}>{buildLedgerDetailLine(e) || '—'}</td>
                              <td style={tdStyle}><BillingProfileBadge code={e.billingProfileCode} /></td>
                              <td style={{ ...tdStyle, color:'#dc2626', fontWeight: e.debit?600:400 }}>{e.debit ? `₹${parseFloat(e.debit).toLocaleString('en-IN')}` : '—'}</td>
                              <td style={{ ...tdStyle, color:'#16a34a', fontWeight: e.credit?600:400 }}>{e.credit ? `₹${parseFloat(e.credit).toLocaleString('en-IN')}` : '—'}</td>
                              <td style={{ ...tdStyle, fontWeight:700 }}>₹{parseFloat(e.balance || 0).toLocaleString('en-IN')}</td>
                              <td style={tdStyle}>
                                {resolveAuditTxnId(e) ? (
                                  <TxnAuditEyeButton txnId={resolveAuditTxnId(e)} onOpenAudit={setTxnAuditModalTxn} />
                                ) : '—'}
                              </td>
                              {cls === 'parked' && canEditInvoice && !isGroupLedgerScope && (
                                <td style={tdStyle}>
                                  {isParkedLedgerEntryUnparkable(e) ? (
                                    <button
                                      type="button"
                                      style={iconBtn}
                                      title="Move to final client ledger"
                                      onClick={() => setEditLedgerTxnId(e.id)}
                                    >
                                      Unpark
                                    </button>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              }))}
            </div>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  {ledgerTableHeaders(ledgerLedgerClass === 'parked' && canEditInvoice && !isGroupLedgerScope).map(h=>(
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledgerLoading ? (
                  <tr><td colSpan={ledgerTableHeaders(ledgerLedgerClass === 'parked' && canEditInvoice && !isGroupLedgerScope).length} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>Loading ledger…</td></tr>
                ) : ledger.length === 0 ? (
                  <tr><td colSpan={ledgerTableHeaders(ledgerLedgerClass === 'parked' && canEditInvoice && !isGroupLedgerScope).length} style={{ ...tdStyle, textAlign:'center', padding:24, color:'#94a3b8' }}>{isGroupLedgerScope ? 'No ledger entries for this group.' : 'No ledger entries for this client.'}</td></tr>
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
                    {isGroupLedgerScope && (
                      <td style={tdStyle}>{e.entityName || '—'}</td>
                    )}
                    <td style={tdStyle}><TxnTypeBadge type={e.txnType} /></td>
                    <td style={{ ...tdStyle, fontStyle: e.txnType === 'opening_balance' || e.txnType === 'brought_forward' ? 'italic' : 'normal' }}>{e.narration || '—'}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'normal', maxWidth: 280, fontSize: 12, color: '#64748b' }}>{buildLedgerDetailLine(e) || '—'}</td>
                    <td style={tdStyle}><BillingProfileBadge code={e.billingProfileCode} /></td>
                    <td style={{ ...tdStyle, color:'#dc2626', fontWeight: e.debit?600:400 }}>{e.debit ? `₹${parseFloat(e.debit).toLocaleString('en-IN')}` : '—'}</td>
                    <td style={{ ...tdStyle, color:'#16a34a', fontWeight: e.credit?600:400 }}>{e.credit ? `₹${parseFloat(e.credit).toLocaleString('en-IN')}` : '—'}</td>
                    <td style={{ ...tdStyle, fontWeight:700 }}>₹{parseFloat(e.balance || 0).toLocaleString('en-IN')}</td>
                    <td style={tdStyle}>
                      {resolveAuditTxnId(e) ? (
                        <TxnAuditEyeButton txnId={resolveAuditTxnId(e)} onOpenAudit={setTxnAuditModalTxn} />
                      ) : '—'}
                    </td>
                    {ledgerLedgerClass === 'parked' && canEditInvoice && !isGroupLedgerScope && (
                      <td style={tdStyle}>
                        {isParkedLedgerEntryUnparkable(e) ? (
                          <button
                            type="button"
                            style={iconBtn}
                            title="Move to final client ledger"
                            onClick={() => setEditLedgerTxnId(e.id)}
                          >
                            Unpark
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'recovery_list' && (
        <div style={{ ...cardStyle, overflowX: 'auto' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Recovery list</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { key: 'active', label: 'Active' },
                  { key: 'npa', label: 'NPA' },
                  { key: 'bad_debt', label: 'Bad debt' },
                ].map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setRecoveryBucket(b.key)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 7,
                      border: recoveryBucket === b.key ? '1px solid #6366f1' : '1px solid #cbd5e1',
                      background: recoveryBucket === b.key ? '#eef2ff' : '#fff',
                      color: recoveryBucket === b.key ? '#4338ca' : '#475569',
                      fontWeight: recoveryBucket === b.key ? 700 : 500,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, maxWidth: 860 }}>
              {recoveryBucket === 'active' && 'Active receivables by client group. NPA and bad-debt entities are excluded from this list and the dashboard KPI.'}
              {recoveryBucket === 'npa' && 'Entities marked as Non-Performing Asset (NPA). Ledger balances are unchanged — classification only.'}
              {recoveryBucket === 'bad_debt' && 'Entities written off as bad debt (terminal). Read-only; ledger balances unchanged.'}
            </div>
            {recoveryBucket === 'active' && recoveryReport && typeof recoveryReport.kpiTotalReceivable === 'number'
              && typeof recoveryReport.totals?.grand === 'number'
              && !recoverySearch.trim()
              && Math.abs(recoveryReport.totals.grand - recoveryReport.kpiTotalReceivable) > 0.02 && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#b45309' }}>
                Note: Report grand total (₹{recoveryReport.totals.grand.toLocaleString('en-IN')}) differs slightly from KPI receivable
                (₹{recoveryReport.kpiTotalReceivable.toLocaleString('en-IN')}) — usually rounding on split allocations.
              </div>
            )}
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <label htmlFor="recovery-list-search" style={{ fontSize: 12, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                Search
              </label>
              <input
                id="recovery-list-search"
                type="search"
                value={recoverySearch}
                onChange={(e) => setRecoverySearch(e.target.value)}
                placeholder={
                  recoverySearchMode === 'group'
                    ? 'Client group name…'
                    : 'Contact, organization, or entity #…'
                }
                style={{ ...inputStyle, flex: '1 1 180px', minWidth: 160, maxWidth: 360 }}
                autoComplete="off"
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>Filter by</span>
                {[
                  { key: 'group', label: 'Group' },
                  { key: 'ledger', label: 'Ledger' },
                ].map((m) => (
                  <label
                    key={m.key}
                    style={{
                      fontSize: 12,
                      color: recoverySearchMode === m.key ? '#4338ca' : '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      cursor: 'pointer',
                      fontWeight: recoverySearchMode === m.key ? 600 : 500,
                    }}
                  >
                    <input
                      type="radio"
                      name="recovery-search-mode"
                      checked={recoverySearchMode === m.key}
                      onChange={() => setRecoverySearchMode(m.key)}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
              {recoverySearch.trim() && (
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  {filteredRecoveryGroups.length} group{filteredRecoveryGroups.length === 1 ? '' : 's'}
                  {recoverySearchMode === 'ledger'
                    ? ` · ${filteredRecoveryGroups.reduce((n, g) => n + (g.entities?.length || 0), 0)} ledger${filteredRecoveryGroups.reduce((n, g) => n + (g.entities?.length || 0), 0) === 1 ? '' : 's'}`
                    : ''}
                </span>
              )}
            </div>
          </div>
          <table style={{ ...tableStyle, minWidth: 1400 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={thStyle}>Entity</th>
                <th colSpan={3} style={{ ...thStyle, textAlign: 'center', borderLeft: '1px solid #e2e8f0' }}>Regular</th>
                <th colSpan={3} style={{ ...thStyle, textAlign: 'center', borderLeft: '1px solid #e2e8f0' }}>Memorandum</th>
                <th colSpan={3} style={{ ...thStyle, textAlign: 'center', borderLeft: '1px solid #e2e8f0' }}>Optional</th>
                <th colSpan={3} style={{ ...thStyle, textAlign: 'center', borderLeft: '1px solid #e2e8f0' }}>Parked</th>
                <th rowSpan={2} style={{ ...thStyle, textAlign: 'right', borderLeft: '1px solid #e2e8f0' }}>Total</th>
                {recoveryBucket === 'active' && (
                  <th rowSpan={2} style={{ ...thStyle, textAlign: 'center', borderLeft: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Due Date</th>
                )}
                {recoveryBucket === 'npa' && (
                  <>
                    <th rowSpan={2} style={{ ...thStyle, textAlign: 'center', borderLeft: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>NPA marked</th>
                    <th rowSpan={2} style={{ ...thStyle, textAlign: 'center', borderLeft: '1px solid #e2e8f0' }}>NPA reason</th>
                  </>
                )}
                {recoveryBucket === 'bad_debt' && (
                  <>
                    <th rowSpan={2} style={{ ...thStyle, textAlign: 'center', borderLeft: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Bad debt marked</th>
                    <th rowSpan={2} style={{ ...thStyle, textAlign: 'center', borderLeft: '1px solid #e2e8f0' }}>Bad debt reason</th>
                  </>
                )}
                {recoveryBucket !== 'bad_debt' && (
                  <th rowSpan={2} style={{ ...thStyle, textAlign: 'center', borderLeft: '1px solid #e2e8f0' }}>Actions</th>
                )}
              </tr>
              <tr>
                {['regular', 'memorandum', 'optional', 'parked'].flatMap((k) => (
                  ['Fees', 'Taxes', 'Reimb.'].map((h) => (
                    <th key={`${k}-${h}`} style={{ ...thStyle, textAlign: 'right', fontSize: 11, borderLeft: '1px solid #e2e8f0' }}>{h}</th>
                  ))
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const recoveryColSpan = recoveryBucket === 'npa' ? 17 : 16;
                return (
                  <>
              {recoveryLoading && (
                <tr>
                  <td colSpan={recoveryColSpan} style={{ ...tdStyle, textAlign: 'center', padding: 28, color: '#94a3b8' }}>
                    Loading recovery list…
                  </td>
                </tr>
              )}
              {!recoveryLoading && recoveryError && (
                <tr>
                  <td colSpan={recoveryColSpan} style={{ ...tdStyle, textAlign: 'center', padding: 28, color: '#dc2626', background: '#fef2f2' }}>
                    ⚠ Failed to load recovery list: {recoveryError}
                  </td>
                </tr>
              )}
              {!recoveryLoading && !recoveryError && (!recoveryReport?.groups || recoveryReport.groups.length === 0) && recoveryBucket === 'active' && (recoveryReport?.kpiTotalReceivable ?? 0) > 0.01 && (
                <tr>
                  <td colSpan={recoveryColSpan} style={{ ...tdStyle, textAlign: 'center', padding: 28, color: '#92400e', background: '#fffbeb' }}>
                    Dashboard KPI shows ₹{(recoveryReport.kpiTotalReceivable).toLocaleString('en-IN', { minimumFractionDigits: 2 })} receivable but no records are displaying — please contact support or reload.
                  </td>
                </tr>
              )}
              {!recoveryLoading && !recoveryError && recoveryReport?.groups?.length > 0 && filteredRecoveryGroups.length === 0 && recoverySearch.trim() && (
                <tr>
                  <td colSpan={recoveryColSpan} style={{ ...tdStyle, textAlign: 'center', padding: 28, color: '#94a3b8' }}>
                    No {recoverySearchMode === 'group' ? 'groups' : 'ledgers'} match &ldquo;{recoverySearch.trim()}&rdquo;.
                  </td>
                </tr>
              )}
              {!recoveryLoading && !recoveryError && (!recoveryReport?.groups || recoveryReport.groups.length === 0) && (recoveryBucket !== 'active' || (recoveryReport?.kpiTotalReceivable ?? 0) <= 0.01) && (
                <tr>
                  <td colSpan={recoveryColSpan} style={{ ...tdStyle, textAlign: 'center', padding: 28, color: '#94a3b8' }}>
                    {recoveryBucket === 'active' && 'No receivable balances to show (or no client / org ledger data yet).'}
                    {recoveryBucket === 'npa' && 'No entities marked as NPA.'}
                    {recoveryBucket === 'bad_debt' && 'No entities marked as bad debt.'}
                  </td>
                </tr>
              )}
              {!recoveryLoading && filteredRecoveryGroups.map((g) => {
                const sr = recoverySumSlot(g.entities, 'regular');
                const sm = recoverySumSlot(g.entities, 'memorandum');
                const so = recoverySumSlot(g.entities, 'optional');
                const sp = recoverySumSlot(g.entities, 'parked');
                return (
                  <Fragment key={g.groupKey}>
                    <tr style={{ background: '#eef2ff' }}>
                      <td colSpan={recoveryColSpan} style={{ ...tdStyle, fontWeight: 700, color: '#312e81' }}>
                        {g.groupLabel}
                        <span style={{ fontWeight: 500, color: '#6366f1', marginLeft: 8 }}>
                          — Group total ₹{g.groupTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                    </tr>
                    {g.entities.map((ent) => (
                      <tr
                        key={`${ent.entityType}-${ent.entityId}`}
                        style={{ ...trStyle, cursor: 'pointer' }}
                        onClick={() => openLedgerFromRecovery(ent)}
                      >
                        <td style={{ ...tdStyle, whiteSpace: 'normal', maxWidth: 220 }}>
                          <div style={{ fontWeight: 600 }}>{ent.displayName || '—'}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                            {ent.entityType === 'organization' ? 'Organization' : 'Contact'}
                          </div>
                        </td>
                        {(['regular', 'memorandum', 'optional', 'parked']).map((slot) => (
                          <Fragment key={slot}>
                            <td
                              style={{ ...tdStyle, textAlign: 'right' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setLedgerEntityType(ent.entityType === 'organization' ? 'organization' : 'contact');
                                setLedgerClientId(String(ent.entityId));
                                setLedgerClientName(ent.displayName || '');
                                setLedgerLedgerClass(slot);
                                setLedgerLedgerView('consolidated');
                                setLedgerLimit(0);
                                setLedgerAllClasses(null);
                                setTab('ledger');
                              }}
                              title={`Open ${slot} ledger`}
                            >
                              {recoveryMoney(ent[slot]?.fees)}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{recoveryMoney(ent[slot]?.taxes)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{recoveryMoney(ent[slot]?.reimbursement)}</td>
                          </Fragment>
                        ))}
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
                          {recoveryMoney(ent.rowTotal)}
                        </td>
                        {recoveryBucket === 'active' && (
                          <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap', color: ent.latestLog?.revised_due_date ? '#0f172a' : '#94a3b8', fontSize: 12 }}>
                            {ent.latestLog?.revised_due_date
                              ? new Date(ent.latestLog.revised_due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                              : '—'}
                          </td>
                        )}
                        {recoveryBucket === 'npa' && (
                          <>
                            <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap', fontSize: 12 }}>
                              {formatRecoveryMarkedAt(ent.recoveryStatus?.npaMarkedAt)}
                            </td>
                            <td style={{ ...tdStyle, fontSize: 12, maxWidth: 180, whiteSpace: 'normal' }}>
                              {ent.recoveryStatus?.npaReason || '—'}
                            </td>
                          </>
                        )}
                        {recoveryBucket === 'bad_debt' && (
                          <>
                            <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap', fontSize: 12 }}>
                              {formatRecoveryMarkedAt(ent.recoveryStatus?.badDebtMarkedAt)}
                            </td>
                            <td style={{ ...tdStyle, fontSize: 12, maxWidth: 180, whiteSpace: 'normal' }}>
                              {ent.recoveryStatus?.badDebtReason || '—'}
                            </td>
                          </>
                        )}
                        {recoveryBucket !== 'bad_debt' && (
                        <td
                          style={{ ...tdStyle, textAlign: 'center' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => openRecoveryLogModal(ent)}
                              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid #6366f1', background: '#eef2ff', color: '#4338ca', cursor: 'pointer', fontWeight: 600 }}
                            >
                              Log
                            </button>
                            {recoveryBucket === 'active' && canEditInvoice && (
                              <button
                                type="button"
                                onClick={() => openNpaModal(ent)}
                                style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid #ea580c', background: '#fff7ed', color: '#c2410c', cursor: 'pointer', fontWeight: 600 }}
                              >
                                Mark NPA
                              </button>
                            )}
                            {recoveryBucket === 'npa' && canEditInvoice && (
                              <button
                                type="button"
                                onClick={() => openBadDebtModal(ent)}
                                style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid #dc2626', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer', fontWeight: 600 }}
                              >
                                Bad debt
                              </button>
                            )}
                          </div>
                        </td>
                        )}
                      </tr>
                    ))}
                    <tr style={{ background: '#f8fafc', fontWeight: 600 }}>
                      <td style={{ ...tdStyle, fontStyle: 'italic', color: '#475569' }}>Subtotal — {g.groupLabel}</td>
                      {[sr, sm, so, sp].map((s, i) => (
                        <Fragment key={i}>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{recoveryMoney(s.fees)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{recoveryMoney(s.taxes)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{recoveryMoney(s.reimbursement)}</td>
                        </Fragment>
                      ))}
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {recoveryMoney(g.groupTotal)}
                      </td>
                      {recoveryBucket === 'bad_debt' ? (
                        <td colSpan={2} style={tdStyle} />
                      ) : (
                        <td colSpan={recoveryBucket === 'npa' ? 3 : 2} style={tdStyle} />
                      )}
                    </tr>
                  </Fragment>
                );
              })}
              {!recoveryLoading && recoveryDisplayTotals && filteredRecoveryGroups.length > 0 && (
                <tr style={{ background: '#fef2f2', fontWeight: 700 }}>
                  <td style={tdStyle}>
                    {recoverySearch.trim() ? 'Filtered total' : 'Grand total'}
                  </td>
                  {(['regular', 'memorandum', 'optional', 'parked']).map((slot) => {
                    const t = recoveryDisplayTotals[slot] || {};
                    return (
                      <Fragment key={slot}>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{recoveryMoney(t.fees)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{recoveryMoney(t.taxes)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{recoveryMoney(t.reimbursement)}</td>
                      </Fragment>
                    );
                  })}
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#dc2626' }}>
                    {recoveryMoney(recoveryDisplayTotals.grand)}
                  </td>
                  {recoveryBucket === 'bad_debt' ? (
                    <td colSpan={2} style={tdStyle} />
                  ) : (
                    <td colSpan={recoveryBucket === 'npa' ? 3 : 2} style={tdStyle} />
                  )}
                </tr>
              )}
                  </>
                );
              })()}
            </tbody>
          </table>
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
            {ledgerScopeReady && !ledgerLoading && (
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
                {['#', 'Client', 'Engagement', 'Period', 'Badges', 'Billed (₹)', 'Invoices', 'Status', 'Actions'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {billingLoading ? (
                <tr>
                  <td colSpan={9} style={{ ...tdStyle, textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                    Loading service billing…
                  </td>
                </tr>
              ) : billingRows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ ...tdStyle, textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                    No rows for this filter. Completed engagements or all tasks done enter the queue when billing is open.
                  </td>
                </tr>
              ) : (
                billingRows.map((row) => (
                  <tr
                    key={row.id}
                    style={{ ...trStyle, cursor: 'pointer' }}
                    title="Click row for service details and team activity"
                    onClick={() => setBillingDetailRow(row)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                  >
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{row.id}</td>
                    <td style={{ ...tdStyle, maxWidth: 200, whiteSpace: 'normal' }}>{row.clientName}</td>
                    <td style={{ ...tdStyle, maxWidth: 220, whiteSpace: 'normal' }}>
                      {row.serviceType || '—'}
                      {row.isMasterService && row.linkedServicesSummary && row.linkedServicesSummary.total > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>
                            Linked: {row.linkedServicesSummary.completed}/{row.linkedServicesSummary.total} completed
                          </div>
                          <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden', maxWidth: 120 }}>
                            <div style={{
                              height: '100%',
                              borderRadius: 2,
                              background: row.linkedServicesSummary.completed === row.linkedServicesSummary.total ? '#16a34a' : 'var(--portal-primary)',
                              width: `${Math.round((row.linkedServicesSummary.completed / row.linkedServicesSummary.total) * 100)}%`,
                            }} />
                          </div>
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                      {row.relevantPeriodLabel || row.financialYear || '—'}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11 }}>
                      {row.isMasterService && (
                        <span style={{ background: 'var(--portal-primary)', color: '#fff', padding: '2px 6px', borderRadius: 4, marginRight: 4, fontWeight: 700, letterSpacing: '0.03em' }}>Master</span>
                      )}
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
                    <td style={{ ...tdStyle, whiteSpace: 'normal' }} onClick={(e) => e.stopPropagation()}>
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

function recoveryMoney(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) < 0.005) return '—';
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function recoverySumSlot(entities, slotKey) {
  return entities.reduce(
    (acc, e) => {
      const s = e[slotKey] || {};
      acc.fees += Number(s.fees) || 0;
      acc.taxes += Number(s.taxes) || 0;
      acc.reimbursement += Number(s.reimbursement) || 0;
      return acc;
    },
    { fees: 0, taxes: 0, reimbursement: 0 },
  );
}

const cardStyle = { background:'#fff', borderRadius:10, boxShadow:'0 1px 3px rgba(0,0,0,.08)', overflow:'auto' };
const tableStyle = { width:'100%', borderCollapse:'collapse', fontSize:13 };
const thStyle = { textAlign:'left', padding:'10px 12px', color:'#64748b', fontWeight:600, fontSize:12, borderBottom:'2px solid #f1f5f9', background:'#f8fafc', whiteSpace:'nowrap' };
const tdStyle = { padding:'10px 12px', color:'#334155', verticalAlign:'middle', whiteSpace:'nowrap' };
const stickyActionsThStyle = {
  ...thStyle,
  position: 'sticky',
  right: 0,
  zIndex: 2,
  background: '#f8fafc',
  boxShadow: '-4px 0 8px rgba(15,23,42,0.06)',
};
const stickyActionsTdStyle = (rowBg = '#fff') => ({
  ...tdStyle,
  position: 'sticky',
  right: 0,
  zIndex: 1,
  background: rowBg,
  boxShadow: '-4px 0 8px rgba(15,23,42,0.06)',
});
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

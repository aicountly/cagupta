import { useState, useEffect, useCallback } from 'react';
import StatusBadge from '../components/common/StatusBadge';
import DateInput from '../components/common/DateInput';
import { getRegisterTypes } from '../constants/registerTypes';
import { REGISTER_CONFIG, DEFAULT_REGISTER_CONFIG } from '../constants/registerConfig';
import { expensePurposeLabel } from '../constants/expensePurposes';
import RegisterSubFilters from '../components/common/RegisterSubFilters';
import RegisterEntryModal from '../components/registers/RegisterEntryModal';
import { getTxns } from '../services/txnService';
import { getRegisters, getRegisterCounts } from '../services/registerService';

// Compliance tabs that pull from the registers API
const COMPLIANCE_TABS = new Set(['gst', 'tds', 'roc', 'it', 'pf']);

const TODAY = new Date().toISOString().slice(0, 10);

function isOverdue(row) {
  return (
    (row.status === 'pending' || row.status === 'late') &&
    row.due_date &&
    row.due_date < TODAY
  );
}

function getEffectiveStatus(row) {
  if (isOverdue(row)) return 'overdue';
  return row.status;
}

// ── Status summary pills ──────────────────────────────────────────────────────

function StatusSummary({ rows, selectedStatus, onSelect }) {
  const counts = { all: rows.length, pending: 0, overdue: 0, filed: 0, na: 0 };
  for (const r of rows) {
    const eff = getEffectiveStatus(r);
    if (eff === 'filed') counts.filed++;
    else if (eff === 'overdue') counts.overdue++;
    else if (eff === 'pending') counts.pending++;
    else if (eff === 'na') counts.na++;
  }

  const pills = [
    { key: '',        label: 'All',     count: counts.all,     color: '#6366f1', bg: '#eef2ff' },
    { key: 'pending', label: 'Pending', count: counts.pending, color: '#d97706', bg: '#fffbeb' },
    { key: 'overdue', label: 'Overdue', count: counts.overdue, color: '#dc2626', bg: '#fef2f2' },
    { key: 'filed',   label: 'Filed',   count: counts.filed,   color: '#16a34a', bg: '#f0fdf4' },
  ];

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
      {pills.map(p => (
        <button
          key={p.key}
          type="button"
          onClick={() => onSelect(p.key)}
          style={{
            padding: '5px 14px', borderRadius: 20,
            border: selectedStatus === p.key ? `2px solid ${p.color}` : '2px solid transparent',
            background: selectedStatus === p.key ? p.bg : '#f8fafc',
            color: selectedStatus === p.key ? p.color : '#64748b',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          {p.label}
          <span style={{
            background: selectedStatus === p.key ? p.color : '#e2e8f0',
            color: selectedStatus === p.key ? '#fff' : '#475569',
            borderRadius: 10, padding: '1px 7px', fontSize: 11,
          }}>{p.count}</span>
        </button>
      ))}
    </div>
  );
}

// ── Compliance register table (live data) ─────────────────────────────────────

function ComplianceTable({ tabKey, rows, onEdit }) {
  if (!rows || rows.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
        No records found for this register.
      </div>
    );
  }

  const config = REGISTER_CONFIG[tabKey] || DEFAULT_REGISTER_CONFIG;

  // Common identifier column per tab
  const idField = {
    gst: row => row.org_gstin || row.client_gstin || '—',
    tds: row => row.reference_number || '—',
    roc: row => row.org_cin || '—',
    it:  row => row.client_pan || '—',
    pf:  row => row.reference_number || '—',
  }[tabKey] || (() => '—');

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>Client</th>
          <th style={thStyle}>ID / No.</th>
          <th style={thStyle}>Return Type</th>
          <th style={thStyle}>Period</th>
          <th style={thStyle}>Due Date</th>
          <th style={thStyle}>Filed Date</th>
          <th style={thStyle}>Status</th>
          <th style={thStyle}>Filed by</th>
          <th style={thStyle}>Ack No.</th>
          <th style={thStyle}>Error No.</th>
          <th style={thStyle}>Late Fee</th>
          <th style={thStyle}>Notes</th>
          <th style={thStyle}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const overdue = isOverdue(r);
          const rowBg   = overdue ? '#fff9f9' : undefined;
          return (
            <tr key={r.id} style={{ ...trStyle, background: rowBg }}>
              <td style={{ ...tdStyle, fontWeight: 600 }}>{r.client_name || '—'}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>{idField(r)}</td>
              <td style={tdStyle}>{r.return_type || r.engagement_type_name || '—'}</td>
              <td style={tdStyle}>{r.period_label || '—'}</td>
              <td style={{
                ...tdStyle,
                color: overdue ? '#dc2626' : undefined,
                fontWeight: overdue ? 700 : undefined,
              }}>
                {r.due_date || '—'}
              </td>
              <td style={tdStyle}>{r.filed_date || '—'}</td>
              <td style={tdStyle}>
                <StatusBadge status={getEffectiveStatus(r)} />
              </td>
              <td style={{ ...tdStyle, fontSize: 12 }}>{r.filed_by_name || '—'}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.acknowledgment_number || '—'}
              </td>
              <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>
                {r.error_number || (
                  <span style={{ color: '#16a34a', fontSize: 11 }}>None</span>
                )}
              </td>
              <td style={{ ...tdStyle, color: r.late_fee && Number(r.late_fee) > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                {r.late_fee && Number(r.late_fee) > 0 ? `₹${Number(r.late_fee).toLocaleString('en-IN')}` : 'Nil'}
              </td>
              <td style={{ ...tdStyle, maxWidth: 160, whiteSpace: 'normal', color: '#64748b', fontSize: 12 }}>
                {r.notes || '—'}
              </td>
              <td style={{ ...tdStyle, width: 60 }}>
                <button
                  type="button"
                  onClick={() => onEdit(r)}
                  style={editBtnStyle}
                  title="Edit filing details"
                >
                  ✏️ Edit
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Payments table (unchanged from existing implementation) ───────────────────

function PaymentsTable({ rows }) {
  if (!rows || rows.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
        No records found for this register.
      </div>
    );
  }
  const config = REGISTER_CONFIG.payments;
  return (
    <table style={tableStyle}>
      <thead>
        <tr>{config.columns.map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} style={trStyle}>
            <td style={tdStyle}>{r.date || '—'}</td>
            <td style={{ ...tdStyle, fontWeight: 600 }}>{r.client}</td>
            <td style={{ ...tdStyle, fontWeight: 600, color: '#0369a1' }}>₹{Number(r.amount || 0).toLocaleString('en-IN')}</td>
            <td style={tdStyle}>{r.purposeLabel || expensePurposeLabel(r.expense_purpose)}</td>
            <td style={tdStyle}>{r.payment_method || '—'}</td>
            <td style={{ ...tdStyle, maxWidth: 160, whiteSpace: 'normal' }}>{r.paid_from || '—'}</td>
            <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{r.reference_number || '—'}</td>
            <td style={{ ...tdStyle, maxWidth: 220, whiteSpace: 'normal' }}>{r.narration || '—'}</td>
            <td style={{ ...tdStyle, maxWidth: 200, whiteSpace: 'normal' }}>{r.notes || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const dateInputStyle = { padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, color: '#334155' };

export default function Registers() {
  const [registerTypes]   = useState(() => getRegisterTypes());
  const [tab, setTab]     = useState(() => getRegisterTypes()[0]?.key || 'gst');
  const [subFilters, setSubFilters] = useState({});

  // Status quick-filter pill (applies on top of subFilters)
  const [statusFilter, setStatusFilter] = useState('');

  // Compliance tab state
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage]       = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);

  // Edit modal
  const [editRow, setEditRow] = useState(null);

  // Payment tab state (kept from original implementation)
  const [paymentRows, setPaymentRows]   = useState([]);
  const [payRegLoading, setPayRegLoading] = useState(false);
  const [payRegPage, setPayRegPage]     = useState(1);
  const [payRegLastPage, setPayRegLastPage] = useState(1);
  const [payDateFrom, setPayDateFrom]   = useState('');
  const [payDateTo, setPayDateTo]       = useState('');

  // ── Load compliance tab data ────────────────────────────────────────────────

  const loadComplianceData = useCallback(async (tabKey, pg, sf, statusF) => {
    if (!COMPLIANCE_TABS.has(tabKey)) return;
    setLoading(true);
    try {
      const params = {
        register_category: tabKey,
        page:     pg,
        per_page: 100,
      };
      // Map subfilters to API params
      if (sf.returnType && sf.returnType !== '__all__') params.search = sf.returnType;
      if (sf.status && sf.status !== '__all__') {
        params.status = sf.status === 'late' ? 'overdue' : sf.status;
      }
      // Override with the quick status pill
      if (statusF && statusF !== '') {
        params.status = statusF;
      }
      if (sf.period && sf.period !== '__all__')  params.period_label = sf.period;
      if (sf.quarter && sf.quarter !== '__all__') params.period_label = sf.quarter;
      if (sf.fy && sf.fy !== '__all__')           params.period_label = sf.fy;
      if (sf.ay && sf.ay !== '__all__')           params.period_label = sf.ay;

      const { rows: newRows, pagination } = await getRegisters(params);
      setRows(prev => pg === 1 ? newRows : [...prev, ...newRows]);
      setLastPage(pagination.last_page || 1);
      setTotalRows(pagination.total || 0);
    } catch {
      if (pg === 1) setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!COMPLIANCE_TABS.has(tab)) return;
    setPage(1);
    setRows([]);
    loadComplianceData(tab, 1, subFilters[tab] || {}, statusFilter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, subFilters, statusFilter]);

  useEffect(() => {
    if (!COMPLIANCE_TABS.has(tab) || page === 1) return;
    loadComplianceData(tab, page, subFilters[tab] || {}, statusFilter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ── Load payment tab data ───────────────────────────────────────────────────

  useEffect(() => {
    if (tab !== 'payments') return;
    let cancelled = false;
    setPayRegLoading(true);
    const f = subFilters.payments || {};
    const expensePurpose = f.expense_purpose && f.expense_purpose !== '__all__' ? f.expense_purpose : undefined;
    const paymentMethod  = f.payment_method  && f.payment_method  !== '__all__' ? f.payment_method  : undefined;
    const paidFrom       = f.paid_from       && f.paid_from       !== '__all__' ? f.paid_from       : undefined;
    getTxns({
      txnType: 'payment_expense',
      perPage: 100,
      page:    payRegPage,
      dateFrom: payDateFrom || undefined,
      dateTo:   payDateTo   || undefined,
      expensePurpose,
      paymentMethod,
      paidFrom,
    })
      .then(({ txns, pagination }) => {
        if (cancelled) return;
        const mapped = txns.map(t => ({
          id:              t.id,
          date:            t.txnDate        || '',
          client:          t.clientName     || '—',
          amount:          t.amount,
          expense_purpose: t.expensePurpose || '',
          purposeLabel:    expensePurposeLabel(t.expensePurpose),
          payment_method:  t.paymentMethod  || '',
          paid_from:       t.paidFrom       || '',
          reference_number:t.referenceNumber|| '',
          narration:       t.narration      || '',
          notes:           t.notes          || '',
        }));
        setPaymentRows(prev => payRegPage === 1 ? mapped : [...prev, ...mapped]);
        setPayRegLastPage(pagination.last_page || 1);
      })
      .catch(() => { if (!cancelled) setPaymentRows([]); })
      .finally(() => { if (!cancelled) setPayRegLoading(false); });
    return () => { cancelled = true; };
  }, [tab, payRegPage, payDateFrom, payDateTo, subFilters.payments]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleTabChange(key) {
    setTab(key);
    setStatusFilter('');
    setPage(1);
    setRows([]);
    if (key === 'payments') {
      setPayRegPage(1);
      setPaymentRows([]);
    }
  }

  function handleSubFilterChange(tabKey, filterKey, value) {
    setSubFilters(prev => ({
      ...prev,
      [tabKey]: { ...(prev[tabKey] || {}), [filterKey]: value },
    }));
    if (tabKey === tab) {
      setPage(1);
      setRows([]);
      if (tabKey === 'payments') { setPayRegPage(1); setPaymentRows([]); }
    }
  }

  function handleEditSaved(updated) {
    setEditRow(null);
    // Patch the row in place
    setRows(prev => prev.map(r => r.id === updated?.id ? { ...r, ...updated } : r));
  }

  // Client-side status filter for compliance tabs (used only as a fallback when
  // all rows are loaded — the primary filter is sent to the server above)
  const displayRows = rows;

  const config = REGISTER_CONFIG[tab] || DEFAULT_REGISTER_CONFIG;

  return (
    <div style={{ padding: 24 }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e2e8f0', flexWrap: 'wrap' }}>
        {registerTypes.map(rt => (
          <button
            key={rt.key}
            type="button"
            onClick={() => handleTabChange(rt.key)}
            style={{
              padding: '8px 20px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
              color: tab === rt.key ? '#2563eb' : '#64748b',
              borderBottom: tab === rt.key ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {rt.icon} {rt.label}
          </button>
        ))}
      </div>

      {/* Payment date range */}
      {tab === 'payments' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Date from:</span>
          <DateInput
            style={dateInputStyle}
            value={payDateFrom}
            onChange={e => { setPayDateFrom(e.target.value); setPayRegPage(1); setPaymentRows([]); }}
          />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>to</span>
          <DateInput
            style={dateInputStyle}
            value={payDateTo}
            onChange={e => { setPayDateTo(e.target.value); setPayRegPage(1); setPaymentRows([]); }}
          />
          {(payDateFrom || payDateTo) && (
            <button
              type="button"
              onClick={() => { setPayDateFrom(''); setPayDateTo(''); setPayRegPage(1); setPaymentRows([]); }}
              style={{ padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer' }}
            >
              Clear dates
            </button>
          )}
        </div>
      )}

      {/* Status summary pills — compliance tabs only */}
      {COMPLIANCE_TABS.has(tab) && (
        <StatusSummary
          rows={displayRows}
          selectedStatus={statusFilter}
          onSelect={v => { setStatusFilter(v); setPage(1); setRows([]); }}
        />
      )}

      {/* Sub-filters */}
      <RegisterSubFilters
        subFilters={config.subFilters}
        filters={subFilters[tab] || {}}
        onChange={(key, value) => handleSubFilterChange(tab, key, value)}
        data={tab === 'payments' ? paymentRows : displayRows}
      />

      {/* Table card */}
      <div style={cardStyle}>
        {/* Compliance tabs */}
        {COMPLIANCE_TABS.has(tab) && (
          <>
            {loading && rows.length === 0 ? (
              <LoadingState label={tab} />
            ) : (
              <ComplianceTable tabKey={tab} rows={displayRows} onEdit={setEditRow} />
            )}
            {page < lastPage && (
              <div style={{ padding: 16, textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setPage(p => p + 1)}
                  style={loadMoreBtnStyle(loading)}
                >
                  {loading ? 'Loading…' : `Load more (${rows.length} of ${totalRows})`}
                </button>
              </div>
            )}
            {!loading && rows.length === 0 && (
              <EmptyState tab={tab} />
            )}
          </>
        )}

        {/* Payments tab */}
        {tab === 'payments' && (
          <>
            {payRegLoading && paymentRows.length === 0 ? (
              <LoadingState label="payment" />
            ) : (
              <PaymentsTable rows={paymentRows} />
            )}
            {payRegPage < payRegLastPage && (
              <div style={{ padding: 16, textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  disabled={payRegLoading}
                  onClick={() => setPayRegPage(p => p + 1)}
                  style={loadMoreBtnStyle(payRegLoading)}
                >
                  {payRegLoading ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Register entry edit modal */}
      <RegisterEntryModal
        row={editRow}
        onClose={() => setEditRow(null)}
        onSaved={handleEditSaved}
      />
    </div>
  );
}

function LoadingState({ label }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
      Loading {label} register…
    </div>
  );
}

function EmptyState({ tab }) {
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
        No register entries yet
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', maxWidth: 340, margin: '0 auto' }}>
        Entries are created automatically when services are marked as completed, or you can
        generate them from the <strong>Recurring Services</strong> page by setting up a compliance schedule.
      </div>
    </div>
  );
}

const cardStyle = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,.08)', overflow: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = { textAlign: 'left', padding: '10px 12px', color: '#64748b', fontWeight: 600, fontSize: 12, borderBottom: '2px solid #f1f5f9', background: '#f8fafc', whiteSpace: 'nowrap' };
const tdStyle = { padding: '10px 12px', color: '#334155', verticalAlign: 'middle', whiteSpace: 'nowrap' };
const trStyle = { borderBottom: '1px solid #f8fafc' };
const editBtnStyle = { padding: '3px 10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 11, fontWeight: 600, color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' };
const loadMoreBtnStyle = disabled => ({
  padding: '8px 20px', background: disabled ? '#93c5fd' : '#2563eb',
  color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
  cursor: disabled ? 'wait' : 'pointer',
});

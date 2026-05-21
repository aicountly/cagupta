import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ServiceLogPanel from '../services/ServiceLogPanel';
import { postInvoiceCostAnalysisPreview } from '../../modules/finance/services/txnService';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,23,42,0.35)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const modalStyle = {
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  minWidth: 480,
  maxWidth: 720,
  width: '100%',
  maxHeight: '85vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const modalHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  padding: '16px 24px',
  borderBottom: '1px solid #f1f5f9',
  flexShrink: 0,
};

const closeBtnStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 16,
  color: '#64748b',
  padding: '2px 6px',
  borderRadius: 4,
  flexShrink: 0,
};

const btnPrimary = {
  padding: '8px 16px',
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};

const btnSecondary = {
  padding: '8px 16px',
  background: '#f8fafc',
  color: '#475569',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
};

const btnWarning = {
  padding: '8px 16px',
  background: '#fff7ed',
  color: '#c2410c',
  border: '1px solid #fed7aa',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function showDescription(row) {
  const notes = String(row.notes || '').trim();
  const desc = String(row.description || '').trim();
  return desc !== '' && desc !== notes;
}

function canReturnToTeam(row) {
  return row.status === 'completed' || Boolean(row.completionFlags?.engagementCompleted);
}

function formatMoneyDetailed(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Cost benchmarks panel (same data as Raise Invoice modal). */
function BillingCostBenchmarks({ analysis, loading, amountBilled, feeAgreed }) {
  if (loading) {
    return (
      <div style={benchmarksBox}>
        <div style={sectionLabel}>Billing benchmarks</div>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading benchmarks…</div>
      </div>
    );
  }
  if (!analysis) return null;

  const threshold = analysis.threshold != null ? Number(analysis.threshold) : null;
  const billed = Number(amountBilled) || 0;
  const remainingBenchmark = threshold != null ? Math.max(0, threshold - billed) : null;
  const agreed = feeAgreed != null && Number.isFinite(Number(feeAgreed)) ? Number(feeAgreed) : null;
  const remainingAgreed = agreed != null ? Math.max(0, agreed - billed) : null;
  const calcHours = Number(analysis.calculated_hours_fees ?? 0)
    || (Number(analysis.billed_hours_fees || 0) + Number(analysis.unbilled_hours_fees || 0));

  return (
    <div style={benchmarksBox}>
      <div style={sectionLabel}>Billing benchmarks</div>
      <div style={benchmarksInner}>
        <div>
          Standard fees (catalog / override):{' '}
          {analysis.standard_fees != null
            ? formatMoneyDetailed(analysis.standard_fees)
            : '— not set'}
        </div>
        <div>
          Billed hours value (planned ₹/hr × billable time):{' '}
          {formatMoneyDetailed(analysis.billed_hours_fees || 0)}
        </div>
        <div>
          Unbilled hours value (planned ₹/hr × non-billable time):{' '}
          {formatMoneyDetailed(analysis.unbilled_hours_fees || 0)}
        </div>
        {calcHours > 0 && (
          <div>
            Total hours-based value: {formatMoneyDetailed(calcHours)}
          </div>
        )}
        {Number(analysis.linked_services_count) > 0 && (
          <div style={{ color: '#64748b', fontSize: 11 }}>
            Includes time from {analysis.linked_services_count} linked service(s) under this master.
          </div>
        )}
        <div style={{ marginTop: 8, fontWeight: 700, color: '#0f172a' }}>
          Suggested amount (max of standard and hours-based):{' '}
          {threshold != null ? formatMoneyDetailed(threshold) : '—'}
        </div>
        {threshold != null && (
          <div style={{ marginTop: 4, color: '#0369a1', fontWeight: 600 }}>
            Remaining vs benchmark (after ₹{billed.toLocaleString('en-IN')} already billed):{' '}
            {formatMoneyDetailed(remainingBenchmark)}
          </div>
        )}
        {agreed != null && (
          <div style={{ marginTop: 4, color: '#64748b' }}>
            Remaining vs agreed fee: {formatMoneyDetailed(remainingAgreed)}
          </div>
        )}
        <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
          Use these figures when entering the invoice amount in Raise invoice.
        </div>
      </div>
    </div>
  );
}

/**
 * Service billing detail modal — notes, description, team activity, billing actions.
 */
export default function ServiceBillingDetailModal({
  row,
  closureFilter = 'pending',
  canCreateInvoice = false,
  canBillingClosure = false,
  canViewServices = true,
  onClose,
  onRaiseInvoice,
  onMarkBuilt,
  onNonBillable,
  onReturnToTeam,
}) {
  const [financeRemarks, setFinanceRemarks] = useState('');
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState('');
  const [costPreview, setCostPreview] = useState(null);
  const [costLoading, setCostLoading] = useState(false);

  useEffect(() => {
    if (!row?.id || !canCreateInvoice) {
      setCostPreview(null);
      setCostLoading(false);
      return undefined;
    }
    let cancelled = false;
    setCostLoading(true);
    postInvoiceCostAnalysisPreview({ service_id: row.id, line_items: [] })
      .then((data) => {
        if (!cancelled) setCostPreview(data?.analysis || null);
      })
      .catch(() => {
        if (!cancelled) setCostPreview(null);
      })
      .finally(() => {
        if (!cancelled) setCostLoading(false);
      });
    return () => { cancelled = true; };
  }, [row?.id, canCreateInvoice]);

  if (!row) return null;

  const period = row.relevantPeriodLabel || row.financialYear || '—';
  const notesText = String(row.notes || '').trim();
  const descriptionText = String(row.description || '').trim();
  const showPendingActions = closureFilter === 'pending';
  const returnAllowed = canReturnToTeam(row);
  const assigneeLabel = String(row.assigneeNames || '').trim() || '—';
  const remarksTrimmed = financeRemarks.trim();

  async function handleReturnToTeam() {
    if (!returnAllowed || !remarksTrimmed || returning) return;
    if (!window.confirm(
      'Return this engagement to the assigned team? It will be reopened and assignees will be notified with your remarks.',
    )) {
      return;
    }
    setReturning(true);
    setReturnError('');
    try {
      await onReturnToTeam?.(row, { reason: remarksTrimmed });
    } catch (e) {
      setReturnError(e?.message || 'Could not return service to team.');
    } finally {
      setReturning(false);
    }
  }

  return (
    <div style={overlayStyle} role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-billing-detail-title"
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={modalHeaderStyle}>
          <div style={{ minWidth: 0 }}>
            <div id="service-billing-detail-title" style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', lineHeight: 1.35 }}>
              {row.clientName || 'Unknown client'}
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
              {row.serviceType || '—'} · Service #{row.id}
            </div>
          </div>
          <button type="button" onClick={onClose} style={closeBtnStyle} aria-label="Close">✕</button>
        </div>

        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
          <div style={summaryStrip}>
            <SummaryItem label="Period" value={period} />
            <SummaryItem label="Agreed fee" value={row.feeAgreed != null ? formatMoney(row.feeAgreed) : '—'} />
            <SummaryItem label="Amount billed" value={formatMoney(row.amountBilled)} />
            <SummaryItem label="Invoices" value={String(row.invoiceCount ?? 0)} />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {row.isMasterService && (
              <span style={badge('#F37920', '#fff')}>Master</span>
            )}
            {row.completionFlags?.engagementCompleted && (
              <span style={badge('#e0f2fe', '#0369a1')}>Engagement completed</span>
            )}
            {row.completionFlags?.allTasksDone && (
              <span style={badge('#f0fdf4', '#15803d')}>All tasks done</span>
            )}
            {row.isMasterService && row.linkedServicesSummary?.total > 0 && (
              <span style={badge('#f1f5f9', '#475569')}>
                Linked: {row.linkedServicesSummary.completed}/{row.linkedServicesSummary.total} completed
              </span>
            )}
          </div>

          <BillingCostBenchmarks
            analysis={costPreview}
            loading={costLoading && canCreateInvoice}
            amountBilled={row.amountBilled}
            feeAgreed={row.feeAgreed}
          />

          <div style={{ marginBottom: 16 }}>
            <div style={sectionLabel}>Notes</div>
            {notesText ? (
              <div style={notesBox}>{notesText}</div>
            ) : (
              <div style={emptyBox}>No notes on this engagement.</div>
            )}
          </div>

          {showDescription(row) && (
            <div style={{ marginBottom: 16 }}>
              <div style={sectionLabel}>Description</div>
              <div style={descBox}>{descriptionText}</div>
            </div>
          )}

          {canBillingClosure && showPendingActions && (
            <div style={{ marginBottom: 16 }}>
              <div style={sectionLabel}>Finance remarks</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                Assigned team: <strong style={{ color: '#334155' }}>{assigneeLabel}</strong>
              </div>
              <textarea
                value={financeRemarks}
                onChange={(e) => setFinanceRemarks(e.target.value)}
                placeholder="Explain what action is missing before billing can proceed…"
                rows={4}
                style={remarksInput}
              />
              {!returnAllowed && (
                <div style={helperText}>
                  Return to team is available only when the engagement is marked Completed. Open the full engagement to request changes from ops.
                </div>
              )}
              {returnError ? (
                <div style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>{returnError}</div>
              ) : null}
            </div>
          )}

          <div>
            <div style={sectionLabel}>Team activity</div>
            {canViewServices ? (
              <ServiceLogPanel serviceId={row.id} canEdit={false} />
            ) : (
              <div style={emptyBox}>You don&apos;t have permission to view service activity.</div>
            )}
          </div>
        </div>

        <div style={footerStyle}>
          <Link to={`/services/${row.id}`} style={btnSecondary} onClick={onClose}>
            Open full engagement
          </Link>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginLeft: 'auto' }}>
            {canBillingClosure && showPendingActions && returnAllowed && (
              <button
                type="button"
                style={{ ...btnWarning, opacity: !remarksTrimmed || returning ? 0.6 : 1 }}
                disabled={!remarksTrimmed || returning}
                onClick={handleReturnToTeam}
              >
                {returning ? 'Returning…' : 'Return to team'}
              </button>
            )}
            {canBillingClosure && showPendingActions && (
              <>
                <button type="button" style={btnSecondary} onClick={() => onNonBillable?.(row)}>
                  Non-billable
                </button>
                <button type="button" style={btnSecondary} onClick={() => onMarkBuilt?.(row)}>
                  Mark as billed
                </button>
              </>
            )}
            {canCreateInvoice && showPendingActions && (
              <button type="button" style={btnPrimary} onClick={() => onRaiseInvoice?.(row)}>
                Raise invoice
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div style={summaryItem}>
      <div style={summaryLabel}>{label}</div>
      <div style={summaryValue}>{value}</div>
    </div>
  );
}

function badge(bg, color) {
  return {
    background: bg,
    color,
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
  };
}

const summaryStrip = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 12,
  marginBottom: 14,
  padding: '12px 14px',
  background: '#f8fafc',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
};

const summaryItem = { minWidth: 0 };
const summaryLabel = { fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' };
const summaryValue = { fontSize: 14, fontWeight: 700, color: '#0f172a' };

const benchmarksBox = {
  marginBottom: 16,
};

const benchmarksInner = {
  padding: '12px 14px',
  background: '#f8fafc',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  fontSize: 12,
  color: '#334155',
  lineHeight: 1.55,
};

const sectionLabel = {
  fontSize: 12,
  fontWeight: 700,
  color: '#475569',
  marginBottom: 8,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const notesBox = {
  padding: '10px 12px',
  background: '#FFFBF5',
  border: '1px solid #FDE8D0',
  borderRadius: 8,
  fontSize: 13,
  color: '#334155',
  whiteSpace: 'pre-wrap',
  lineHeight: 1.5,
};

const descBox = {
  padding: '10px 12px',
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 13,
  color: '#334155',
  whiteSpace: 'pre-wrap',
  lineHeight: 1.5,
};

const emptyBox = {
  padding: '12px 14px',
  background: '#f8fafc',
  border: '1px dashed #e2e8f0',
  borderRadius: 8,
  fontSize: 13,
  color: '#94a3b8',
};

const remarksInput = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 13,
  color: '#334155',
  lineHeight: 1.5,
  resize: 'vertical',
  minHeight: 88,
  fontFamily: 'inherit',
};

const helperText = {
  marginTop: 8,
  fontSize: 12,
  color: '#64748b',
  lineHeight: 1.5,
};

const footerStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
  padding: '14px 24px',
  borderTop: '1px solid #f1f5f9',
  background: '#fff',
  flexShrink: 0,
};

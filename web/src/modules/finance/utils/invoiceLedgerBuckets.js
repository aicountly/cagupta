/**
 * Fee vs reimbursement invoice splits — mirrors server-php LedgerPresentation::bucketTotals
 * and LedgerDimensions::invoiceLineSubtotalsByKind.
 */

export function invoiceLineSubtotalsByKind(lineItems) {
  let fee = 0;
  let reim = 0;
  for (const ln of lineItems || []) {
    if (!ln || typeof ln !== 'object') continue;
    const amt = Math.round((Number(ln.amount) || 0) * 100) / 100;
    if (amt <= 0) continue;
    const kind =
      ln.lineKind === 'cost_recovery' || ln.line_kind === 'cost_recovery'
        ? 'cost_recovery'
        : 'professional_fee';
    if (kind === 'cost_recovery') reim += amt;
    else fee += amt;
  }
  return {
    feeSub:             Math.round(fee * 100) / 100,
    reimbursementSub:  Math.round(reim * 100) / 100,
  };
}

export function bucketTotals(totals, subtotal, tax) {
  const feeSub  = totals.feeSub;
  const reimSub = totals.reimbursementSub;
  const taxNum  = Number(tax) || 0;
  const subNum  = Number(subtotal) || 0;
  const taxFee  = subNum > 0.00001
    ? Math.round(taxNum * (feeSub / subNum) * 100) / 100
    : 0;
  const taxReim = Math.round((taxNum - taxFee) * 100) / 100;
  return {
    feeTotal:  Math.round((feeSub + taxFee) * 100) / 100,
    reimTotal: Math.round((reimSub + taxReim) * 100) / 100,
  };
}

/** @param {object} txn normalized invoice txn (lineItems, subtotal, taxAmount, amount) */
export function invoiceBucketParts(txn) {
  const lines = txn.lineItems ?? [];
  const totals = invoiceLineSubtotalsByKind(lines);
  let subtotal = Number(txn.subtotal) || 0;
  if (subtotal <= 0.00001) {
    subtotal = totals.feeSub + totals.reimbursementSub;
  }
  const tax = Number(txn.taxAmount) || 0;
  const parts = bucketTotals(totals, subtotal, tax);
  const invTotal = Math.round((Number(txn.amount) || 0) * 100) / 100;
  return {
    feeTotal:  parts.feeTotal,
    reimTotal: parts.reimTotal,
    invTotal,
  };
}

/**
 * Reference totals from raised invoices for the ledger entity (opening balance reconciliation).
 */
export function aggregateInvoicesForOpeningRecon(invoices, { entityType, entityId }) {
  const idStr = entityId != null ? String(entityId) : '';
  let totalBilling = 0;
  let feesBucket = 0;
  let reimBucket = 0;
  let invoiceCount = 0;

  for (const inv of invoices || []) {
    if (!inv) continue;
    const t = String(inv.txnType || '').toLowerCase();
    if (t !== 'invoice') continue;
    if (String(inv.status || '') === 'cancelled') continue;

    if (entityType === 'organization') {
      if (inv.organizationId == null || String(inv.organizationId) !== idStr) continue;
    } else {
      if (inv.clientId == null || String(inv.clientId) !== idStr) continue;
    }

    const { feeTotal, reimTotal, invTotal } = invoiceBucketParts(inv);
    feesBucket += feeTotal;
    reimBucket += reimTotal;
    totalBilling += invTotal;
    invoiceCount += 1;
  }

  return {
    invoiceCount,
    totalBilling: Math.round(totalBilling * 100) / 100,
    feesBucket:   Math.round(feesBucket * 100) / 100,
    reimBucket:   Math.round(reimBucket * 100) / 100,
  };
}

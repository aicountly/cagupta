import { expensePurposeLabel } from '../constants/expensePurposes';

/**
 * Extra detail line for ledger / exports (payment_expense, receipt, etc.).
 */
export function buildLedgerDetailLine(e) {
  if (!e) return '';
  const parts = [];
  if (e.expensePurpose || e.expense_purpose) {
    parts.push(`Purpose: ${expensePurposeLabel(e.expensePurpose || e.expense_purpose)}`);
  }
  if (e.paymentMethod || e.payment_method) {
    parts.push(`Via: ${e.paymentMethod || e.payment_method}`);
  }
  if (e.paidFrom || e.paid_from) {
    parts.push(`From: ${e.paidFrom || e.paid_from}`);
  }
  if (e.referenceNumber || e.reference_number) {
    parts.push(`Ref: ${e.referenceNumber || e.reference_number}`);
  }
  const notes = e.notes || '';
  if (notes) parts.push(notes);
  return parts.join(' · ');
}

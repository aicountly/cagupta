const ONE_LAKH = 100_000;

/**
 * Format a rupee amount for dense KPI widgets: above `abbreviateFrom` (default ₹1 lakh),
 * show abbreviated lakhs (e.g. ₹17.08 L) while `full` keeps the precise en-IN string for tooltips / a11y.
 *
 * @param {unknown} amount
 * @param {{ abbreviateFrom?: number }} [options]
 * @returns {{ short: string, full: string, abbreviated: boolean }}
 */
export function formatRupeeKpiLakhAbbrev(amount, { abbreviateFrom = ONE_LAKH } = {}) {
  const n = Number(amount);
  if (!Number.isFinite(n)) {
    const s = amount == null ? '' : String(amount);
    return { short: s, full: s, abbreviated: false };
  }

  /** @param {number} x */
  const fullRupees = (x) =>
    `₹${x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const full =
    Math.abs(n) >= abbreviateFrom
      ? fullRupees(n)
      : `₹${n.toLocaleString('en-IN')}`;

  if (Math.abs(n) < abbreviateFrom) {
    return { short: full, full, abbreviated: false };
  }

  const sign = n < 0 ? '−' : '';
  const lakhs = Math.abs(n) / ONE_LAKH;
  const short = `${sign}₹${lakhs.toFixed(2)} L`;

  return { short, full, abbreviated: true };
}

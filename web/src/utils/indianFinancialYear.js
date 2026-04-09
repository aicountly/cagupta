/**
 * Indian financial year: 1 Apr (startYear) → 31 Mar (startYear + 1).
 * Example: dates in Apr 2025–Mar 2026 belong to FY 2025-26 (startYear 2025).
 */

export function indianFYStartYearFromDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const y = parseInt(dateStr.slice(0, 4), 10);
  const m = parseInt(dateStr.slice(5, 7), 10);
  if (Number.isNaN(y) || Number.isNaN(m)) return null;
  return m >= 4 ? y : y - 1;
}

export function indianFYLabel(startYear) {
  return `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
}

export function indianFYBounds(startYear) {
  return {
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
  };
}

/**
 * Distinct FY start years present in the ledger, ascending.
 */
export function collectIndianFYStartYears(entries, getDate = (e) => e.txnDate || e.date || '') {
  const years = new Set();
  for (const e of entries) {
    const sy = indianFYStartYearFromDate(getDate(e));
    if (sy != null) years.add(sy);
  }
  return [...years].sort((a, b) => a - b);
}

function clampDateToFY(dateStr, fyStart, fyEnd) {
  if (!dateStr) return null;
  if (dateStr < fyStart) return fyStart;
  if (dateStr > fyEnd) return fyEnd;
  return dateStr;
}

/**
 * Ledger rows for a selected Indian FY with optional in-FY date range.
 * Prior closing (all txns strictly before the visible window) is shown as balance b/f.
 */
export function buildLedgerRowsForIndianFY(
  fullEntries,
  fyStartYear,
  dateFrom,
  dateTo,
  getDate = (e) => e.txnDate || e.date || ''
) {
  const { start: fyStart, end: fyEnd } = indianFYBounds(fyStartYear);

  let visibleStart = fyStart;
  let visibleEnd = fyEnd;

  const fromClamped = clampDateToFY(dateFrom, fyStart, fyEnd);
  const toClamped = clampDateToFY(dateTo, fyStart, fyEnd);
  if (fromClamped) visibleStart = fromClamped;
  if (toClamped) visibleEnd = toClamped;
  if (visibleStart > visibleEnd) {
    const t = visibleStart;
    visibleStart = visibleEnd;
    visibleEnd = t;
  }

  const sorted = [...fullEntries].sort((a, b) => {
    const da = getDate(a);
    const db = getDate(b);
    if (da !== db) return (da || '').localeCompare(db || '');
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });

  let broughtForward = 0;
  for (const e of sorted) {
    const d = getDate(e);
    if (!d) continue;
    if (d < visibleStart) {
      broughtForward += (Number(e.debit) || 0) - (Number(e.credit) || 0);
    } else {
      break;
    }
  }

  const inRange = sorted.filter((e) => {
    const d = getDate(e);
    return d && d >= visibleStart && d <= visibleEnd;
  });

  const bfDebit = broughtForward > 0 ? broughtForward : 0;
  const bfCredit = broughtForward < 0 ? -broughtForward : 0;

  const rows = [
    {
      id: `bf-${fyStartYear}-${visibleStart}`,
      synthetic: true,
      txnType: 'brought_forward',
      txnDate: visibleStart,
      narration: 'Balance b/f',
      debit: bfDebit,
      credit: bfCredit,
      balance: broughtForward,
      billingProfileCode: '',
    },
  ];

  let balance = broughtForward;
  for (const e of inRange) {
    balance += (Number(e.debit) || 0) - (Number(e.credit) || 0);
    rows.push({ ...e, balance });
  }

  return rows;
}

/**
 * Indian financial year: 1 Apr (startYear) → 31 Mar (startYear + 1).
 * Example: dates in Apr 2025–Mar 2026 belong to FY 2025-26 (startYear 2025).
 */

/** Extract YYYY-MM-DD from ISO timestamps and similar (ledger/API may return full ISO). */
export function toYmdDateKey(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const m = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

export function indianFYStartYearFromDate(dateStr) {
  const ymd = toYmdDateKey(dateStr);
  if (!ymd) return null;
  const y = parseInt(ymd.slice(0, 4), 10);
  const mo = parseInt(ymd.slice(5, 7), 10);
  if (Number.isNaN(y) || Number.isNaN(mo)) return null;
  return mo >= 4 ? y : y - 1;
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
export function ledgerEntryDate(e) {
  return toYmdDateKey(e.txnDate || e.date || '');
}

export function collectIndianFYStartYears(entries, getDate = ledgerEntryDate) {
  const years = new Set();
  for (const e of entries) {
    const sy = indianFYStartYearFromDate(getDate(e));
    if (sy != null) years.add(sy);
  }
  return [...years].sort((a, b) => a - b);
}

/** Current Indian FY start year (based on local calendar date). */
export function defaultIndianFYStartYearFromToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 4 ? y : y - 1;
}

/**
 * FY list from entry dates; if there are entries but no parseable dates, fall back to current FY
 * so the UI can still show controls.
 */
export function collectIndianFYStartYearsWithFallback(entries, getDate = ledgerEntryDate) {
  const fys = collectIndianFYStartYears(entries, getDate);
  if (fys.length > 0) return fys;
  // No parseable dates (or empty ledger): still offer current FY so filters are always visible after client pick
  return [defaultIndianFYStartYearFromToday()];
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
  getDate = ledgerEntryDate
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

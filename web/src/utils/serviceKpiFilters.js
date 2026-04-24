/**
 * Engagement-level KPI rules for Services & Tasks (same logic as the dashboard counters).
 */

export const KPI_SLUGS = {
  DUE_WEEK: 'due-week',
  OVERDUE: 'overdue',
  PENDING_INFO: 'pending-info',
  COMPLETED: 'completed',
};

const SLUG_SET = new Set(Object.values(KPI_SLUGS));

const KPI_LABELS = {
  [KPI_SLUGS.DUE_WEEK]: 'Due This Week',
  [KPI_SLUGS.OVERDUE]: 'Overdue',
  [KPI_SLUGS.PENDING_INFO]: 'Pending Info',
  [KPI_SLUGS.COMPLETED]: 'Completed',
};

export function isValidKpiSlug(slug) {
  return SLUG_SET.has(String(slug));
}

/** @param {string} slug */
export function kpiLabelFromSlug(slug) {
  return KPI_LABELS[String(slug)] || 'Services list';
}

export function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** @param {string} due */
export function engagementDueDateKey(due) {
  if (due == null || due === '') return null;
  const m = String(due).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function isOpenForDueKpis(s) {
  return s.status !== 'completed' && s.status !== 'cancelled';
}

/** Open engagement with a parseable due date; due before local today. */
export function isEngagementOverdue(s) {
  if (!isOpenForDueKpis(s)) return false;
  const key = engagementDueDateKey(s.dueDate);
  if (!key) return false;
  return key < localDateKey(new Date());
}

/** Open engagement, due date in the next 7 days inclusive (same window as main KPIs). */
export function isDueThisWeekKpi(s) {
  if (!isOpenForDueKpis(s)) return false;
  const key = engagementDueDateKey(s.dueDate);
  if (!key) return false;
  const today = new Date();
  const todayKey = localDateKey(today);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndKey = localDateKey(weekEnd);
  return key >= todayKey && key <= weekEndKey;
}

/**
 * @param {object[]} services
 * @param {string} slug
 * @returns {object[]}
 */
export function filterEngagementsBySlug(services, slug) {
  const s = String(slug);
  if (!isValidKpiSlug(s)) return [];
  if (s === KPI_SLUGS.DUE_WEEK) return services.filter((x) => isDueThisWeekKpi(x));
  if (s === KPI_SLUGS.OVERDUE) return services.filter((x) => isEngagementOverdue(x));
  if (s === KPI_SLUGS.PENDING_INFO) return services.filter((x) => x.status === 'pending_info');
  if (s === KPI_SLUGS.COMPLETED) return services.filter((x) => x.status === 'completed');
  return [];
}

const toYmd = (d) => d.toISOString().slice(0, 10);

export const DATE_PRESETS = [
  { value: 'this_week',     label: 'This Week' },
  { value: 'yesterday',     label: 'Yesterday' },
  { value: 'last_week',     label: 'Last Week' },
  { value: 'last_7_days',   label: 'Last 7 Days' },
  { value: 'last_30_days',  label: 'Last 30 Days' },
  { value: 'last_month',    label: 'Last Month' },
  { value: 'current_month', label: 'Current Month' },
  { value: 'this_year',     label: 'This Year' },
  { value: 'last_year',     label: 'Last Year' },
  { value: 'custom',        label: 'Custom' },
];

/** Returns { from, to } as YYYY-MM-DD strings for a given preset value. */
export function getPresetDates(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'yesterday': {
      const d = new Date(today);
      d.setDate(today.getDate() - 1);
      return { from: toYmd(d), to: toYmd(d) };
    }

    case 'this_week': {
      const day = today.getDay();
      const mondayDelta = day === 0 ? -6 : 1 - day;
      const monday = new Date(today);
      monday.setDate(today.getDate() + mondayDelta);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: toYmd(monday), to: toYmd(sunday) };
    }

    case 'last_week': {
      const day = today.getDay();
      const mondayDelta = day === 0 ? -6 : 1 - day;
      const thisMonday = new Date(today);
      thisMonday.setDate(today.getDate() + mondayDelta);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return { from: toYmd(lastMonday), to: toYmd(lastSunday) };
    }

    case 'last_7_days': {
      const from = new Date(today);
      from.setDate(today.getDate() - 6);
      return { from: toYmd(from), to: toYmd(today) };
    }

    case 'last_30_days': {
      const from = new Date(today);
      from.setDate(today.getDate() - 29);
      return { from: toYmd(from), to: toYmd(today) };
    }

    case 'last_month': {
      const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastOfLastMonth = new Date(firstOfThisMonth);
      lastOfLastMonth.setDate(0);
      const firstOfLastMonth = new Date(lastOfLastMonth.getFullYear(), lastOfLastMonth.getMonth(), 1);
      return { from: toYmd(firstOfLastMonth), to: toYmd(lastOfLastMonth) };
    }

    case 'current_month': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toYmd(first), to: toYmd(today) };
    }

    case 'this_year': {
      const first = new Date(today.getFullYear(), 0, 1);
      return { from: toYmd(first), to: toYmd(today) };
    }

    case 'last_year': {
      const first = new Date(today.getFullYear() - 1, 0, 1);
      const last = new Date(today.getFullYear() - 1, 11, 31);
      return { from: toYmd(first), to: toYmd(last) };
    }

    default:
      return null;
  }
}

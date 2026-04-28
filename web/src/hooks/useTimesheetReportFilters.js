import { useMemo, useState } from 'react';

function defaultDateBounds() {
  const now = new Date();
  const day = now.getDay();
  const mondayDelta = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayDelta);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const toYmd = (d) => d.toISOString().slice(0, 10);
  return { from: toYmd(monday), to: toYmd(sunday) };
}

export function useTimesheetReportFilters() {
  const bounds = useMemo(() => defaultDateBounds(), []);
  const [filters, setFilters] = useState({
    dateFrom: bounds.from,
    dateTo: bounds.to,
    bucket: 'weekly',
    billableType: 'all',
    userId: '',
    clientId: '',
    organizationId: '',
    serviceId: '',
    groupId: '',
  });

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      dateFrom: bounds.from,
      dateTo: bounds.to,
      bucket: 'weekly',
      billableType: 'all',
      userId: '',
      clientId: '',
      organizationId: '',
      serviceId: '',
      groupId: '',
    });
  };

  return { filters, updateFilter, resetFilters };
}

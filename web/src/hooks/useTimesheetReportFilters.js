import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPresetDates } from '../utils/datePresets';

const DEFAULT_PRESET = 'this_week';

function buildInitialFilters(searchParams) {
  const urlPreset   = searchParams.get('preset')   || '';
  const urlDateFrom = searchParams.get('dateFrom')  || '';
  const urlDateTo   = searchParams.get('dateTo')    || '';
  const urlUserId   = searchParams.get('userId')    || '';

  if (urlPreset && urlDateFrom && urlDateTo) {
    return {
      preset:         urlPreset,
      dateFrom:       urlDateFrom,
      dateTo:         urlDateTo,
      bucket:         'weekly',
      billableType:   'all',
      userId:         urlUserId,
      clientId:       '',
      organizationId: '',
      serviceId:      '',
      groupId:        '',
    };
  }

  const preset = DEFAULT_PRESET;
  const { from, to } = getPresetDates(preset);
  return {
    preset,
    dateFrom:       from,
    dateTo:         to,
    bucket:         'weekly',
    billableType:   'all',
    userId:         urlUserId,
    clientId:       '',
    organizationId: '',
    serviceId:      '',
    groupId:        '',
  };
}

export function useTimesheetReportFilters() {
  const [searchParams] = useSearchParams();
  const initialFilters = useMemo(() => buildInitialFilters(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [filters, setFilters] = useState(initialFilters);

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const setPreset = (preset) => {
    if (preset === 'custom') {
      setFilters((prev) => ({ ...prev, preset }));
    } else {
      const dates = getPresetDates(preset);
      setFilters((prev) => ({
        ...prev,
        preset,
        ...(dates ? { dateFrom: dates.from, dateTo: dates.to } : {}),
      }));
    }
  };

  const resetFilters = () => {
    const { from, to } = getPresetDates(DEFAULT_PRESET);
    setFilters({
      preset:         DEFAULT_PRESET,
      dateFrom:       from,
      dateTo:         to,
      bucket:         'weekly',
      billableType:   'all',
      userId:         '',
      clientId:       '',
      organizationId: '',
      serviceId:      '',
      groupId:        '',
    });
  };

  return { filters, updateFilter, setPreset, resetFilters };
}

import { useCallback, useEffect, useState } from 'react';
import { getActiveTimer, startTimer, stopTimer, updateTimeEntry } from '../services/timeEntryService';

export function useServiceTimer() {
  const [activeTimer, setActiveTimer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshActiveTimer = useCallback(async () => {
    setLoading(true);
    try {
      const timer = await getActiveTimer();
      setActiveTimer(timer);
      return timer;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshActiveTimer().catch(() => {});
  }, [refreshActiveTimer]);

  const startForService = useCallback(async (serviceId, payload = {}) => {
    setBusy(true);
    try {
      const row = await startTimer(serviceId, payload);
      setActiveTimer(row);
      return row;
    } finally {
      setBusy(false);
    }
  }, []);

  const stopForService = useCallback(async (serviceId, entryId, payload = {}) => {
    setBusy(true);
    try {
      const row = await stopTimer(serviceId, entryId, payload);
      setActiveTimer(null);
      return row;
    } finally {
      setBusy(false);
    }
  }, []);

  const saveStoppedEntry = useCallback(async (serviceId, entryId, payload) => {
    setBusy(true);
    try {
      return await updateTimeEntry(serviceId, entryId, payload);
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    activeTimer,
    loading,
    busy,
    refreshActiveTimer,
    startForService,
    stopForService,
    saveStoppedEntry,
  };
}

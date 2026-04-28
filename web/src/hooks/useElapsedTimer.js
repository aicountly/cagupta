import { useEffect, useMemo, useState } from 'react';

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatElapsedSeconds(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

export function useElapsedTimer(startedAt, isRunning = true) {
  const [nowTs, setNowTs] = useState(Date.now());

  useEffect(() => {
    if (!startedAt || !isRunning) return undefined;
    setNowTs(Date.now());
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt, isRunning]);

  return useMemo(() => {
    if (!startedAt) return { seconds: 0, label: '00:00:00' };
    const startTs = Date.parse(startedAt);
    if (Number.isNaN(startTs)) return { seconds: 0, label: '00:00:00' };
    const seconds = Math.max(0, Math.floor((nowTs - startTs) / 1000));
    return { seconds, label: formatElapsedSeconds(seconds) };
  }, [startedAt, nowTs]);
}

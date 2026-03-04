// ─── Engagement store ────────────────────────────────────────────────────────
// Persists engagements to localStorage so they survive page refresh.
// Seed with mockServices so the Services table is pre-populated on first load.

import { mockServices } from './mockData';

const STORAGE_KEY = 'engagements';

/** Read engagements from localStorage, falling back to mock seed. */
export function getEngagements() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return mockServices;
}

/** Persist the full engagements array. */
function saveEngagements(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore quota errors
  }
}

/** Append one engagement and persist. Returns updated list. */
export function addEngagement(engagement) {
  const list = getEngagements();
  const updated = [...list, engagement];
  saveEngagements(updated);
  return updated;
}

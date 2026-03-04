// ─── Organization store ───────────────────────────────────────────────────────
// Persists organizations to localStorage so they survive page refresh.
// Seeds from mockOrganizations on first load.

import { mockOrganizations } from './mockData';

const STORAGE_KEY = 'organizations';

/** Read organizations from localStorage, falling back to mock seed. */
export function getOrganizations() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return mockOrganizations;
}

/** Persist the full organizations array. */
function saveOrganizations(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore quota errors
  }
}

/** Append one organization and persist. Returns updated list. */
export function addOrganization(org) {
  const list = getOrganizations();
  const updated = [...list, org];
  saveOrganizations(updated);
  return updated;
}

/**
 * Generate the next ORG code by reading existing orgs and incrementing the max.
 * Format: ORG-0001
 */
export function generateOrgCode() {
  const list = getOrganizations();
  let max = 0;
  for (const org of list) {
    const match = org.clientCode?.match(/^ORG-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return `ORG-${String(max + 1).padStart(4, '0')}`;
}

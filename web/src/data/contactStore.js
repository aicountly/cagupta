// ─── Contact store ────────────────────────────────────────────────────────────
// Persists contacts to localStorage so they survive page refresh.
// Seed with mockContacts so the Contacts table is pre-populated on first load.

import { mockContacts } from './mockData';

const STORAGE_KEY = 'contacts';

/** Read contacts from localStorage, falling back to mock seed. */
export function getContacts() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return mockContacts;
}

/** Persist the full contacts array. */
function saveContacts(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore quota errors
  }
}

/** Append one contact and persist. Returns updated list. */
export function addContact(contact) {
  const list = getContacts();
  const updated = [...list, contact];
  saveContacts(updated);
  return updated;
}

/** Generate the next available client code (e.g. CLT-0006 → CLT-0007). */
export function generateContactCode() {
  const contacts = getContacts();
  let max = 0;
  for (const c of contacts) {
    const match = c.clientCode?.match(/^CLT-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return 'CLT-' + String(max + 1).padStart(4, '0');
}

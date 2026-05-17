/**
 * publicLeadService.js
 *
 * Unauthenticated API helpers for the public lead submission endpoint.
 * Used by the BlogCTA component on public blog pages.
 */

import { API_BASE_URL } from '../constants/config';

/**
 * Submit a lead from the public blog CTA form.
 *
 * @param {{ name: string, email?: string, phone?: string, message?: string }} payload
 * @returns {Promise<{ id: number }>}
 */
export async function submitPublicLead(payload) {
  const res = await fetch(`${API_BASE_URL}/public/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || `Request failed (${res.status})`);
  }
  return json.data ?? json;
}

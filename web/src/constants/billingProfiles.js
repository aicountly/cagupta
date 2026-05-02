/**
 * Billing profiles — server-backed (billing_firms) with seed/local fallback.
 */
import { listBillingFirms } from '../services/billingFirmService';

const STORAGE_KEY = 'billing_profiles_config_v1';

export const BILLING_PROFILE_SEED = [
  { id: 'RBGC-CHD', code: 'RBGC-CHD', name: 'RAHUL B GUPTA & CO. CHD', gstRegistered: false, gstin: '', stateCode: '', defaultGstRate: 18 },
  { id: 'RBGC-JAL', code: 'RBGC-JAL', name: 'RAHUL B GUPTA & CO. JAL', gstRegistered: false, gstin: '', stateCode: '', defaultGstRate: 18 },
  { id: 'PROFS', code: 'PROFS', name: 'PROFSINDIA VIRTUAL SERVICES LLP', gstRegistered: false, gstin: '', stateCode: '', defaultGstRate: 18 },
  { id: 'TEFL', code: 'TEFL', name: 'TRADE ERA FILINGS LLP', gstRegistered: false, gstin: '', stateCode: '', defaultGstRate: 18 },
];

/** @type {typeof BILLING_PROFILE_SEED | null} */
let apiCache = null;

function normalizeProfile(p) {
  if (!p || typeof p !== 'object') return null;
  const code = String(p.code || '').trim();
  if (!code) return null;
  return {
    id: String(p.id || code),
    code,
    name: String(p.name || '').trim() || code,
    gstRegistered: Boolean(p.gstRegistered ?? p.gst_registered),
    gstin: String(p.gstin || '').replace(/\s/g, '').toUpperCase(),
    stateCode: String(p.stateCode || p.state_code || '').replace(/\s/g, '').slice(0, 2),
    defaultGstRate: Math.min(40, Math.max(0, parseFloat(p.defaultGstRate ?? p.default_gst_rate, 10) || 18)),
  };
}

function loadLocalStorageMerged() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return BILLING_PROFILE_SEED.map((x) => ({ ...x }));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return BILLING_PROFILE_SEED.map((x) => ({ ...x }));
    const byCode = new Map(BILLING_PROFILE_SEED.map((d) => [d.code, { ...d }]));
    for (const row of parsed) {
      const n = normalizeProfile(row);
      if (n) byCode.set(n.code, { ...byCode.get(n.code), ...n });
    }
    return Array.from(byCode.values());
  } catch {
    return BILLING_PROFILE_SEED.map((x) => ({ ...x }));
  }
}

/** Sync list from API; safe to call when unauthenticated (no-op on failure). */
export async function fetchBillingProfilesFromApi() {
  try {
    if (!localStorage.getItem('auth_token')) return loadBillingProfiles();
    const rows = await listBillingFirms();
    if (!Array.isArray(rows) || rows.length === 0) {
      return loadBillingProfiles();
    }
    const normalized = rows.map(normalizeProfile).filter(Boolean);
    apiCache = normalized;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch { /* ignore */ }
    return apiCache;
  } catch {
    return loadBillingProfiles();
  }
}

/** @returns {typeof BILLING_PROFILE_SEED} */
export function loadBillingProfiles() {
  if (apiCache && apiCache.length > 0) {
    return apiCache.map((x) => ({ ...x }));
  }
  return loadLocalStorageMerged();
}

/** @param {typeof BILLING_PROFILE_SEED} list */
export function saveBillingProfiles(list) {
  const cleaned = (list || []).map(normalizeProfile).filter(Boolean);
  apiCache = cleaned;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
}

/** @deprecated Use loadBillingProfiles — kept for older imports */
export const BILLING_PROFILES = BILLING_PROFILE_SEED;

export function getBillingProfiles() {
  return loadBillingProfiles();
}

export function getBillingProfileByCode(code) {
  if (!code) return null;
  return loadBillingProfiles().find((p) => p.code === code) || null;
}

export function getBillingProfileName(code) {
  const profile = getBillingProfileByCode(code);
  return profile ? profile.name : null;
}

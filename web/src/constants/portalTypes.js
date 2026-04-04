// Default portal types for the Credentials Vault
const DEFAULT_PORTAL_TYPES = [
  'Income Tax e-Filing Portal',
  'TRACES',
  'GST Portal',
  'MCA21',
  'EPFO (PF Portal)',
  'ESIC Portal',
  'TAN Registration Portal',
  'DGFT Portal',
  'RBI Compounding Portal',
  'ICAI SSP Portal',
];

const STORAGE_KEY = 'portalTypes';

export function getPortalTypes() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return [...DEFAULT_PORTAL_TYPES];
}

export function savePortalTypes(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

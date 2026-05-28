// Default portal types for the Credentials Vault
// Shape: { id: string|number, name: string, url: string }
const DEFAULT_PORTAL_TYPES = [
  { id: 'default-1',  name: 'Income Tax e-Filing Portal', url: 'https://www.incometax.gov.in' },
  { id: 'default-2',  name: 'TRACES',                     url: 'https://www.tdscpc.gov.in' },
  { id: 'default-3',  name: 'GST Portal',                 url: 'https://www.gst.gov.in' },
  { id: 'default-4',  name: 'MCA21',                      url: 'https://www.mca.gov.in' },
  { id: 'default-5',  name: 'EPFO (PF Portal)',           url: 'https://unifiedportal-mem.epfindia.gov.in' },
  { id: 'default-6',  name: 'ESIC Portal',                url: 'https://www.esic.in' },
  { id: 'default-7',  name: 'TAN Registration Portal',    url: 'https://www.tin-nsdl.com' },
  { id: 'default-8',  name: 'DGFT Portal',                url: 'https://www.dgft.gov.in' },
  { id: 'default-9',  name: 'RBI Compounding Portal',     url: 'https://rbi.org.in' },
  { id: 'default-10', name: 'ICAI SSP Portal',            url: 'https://ssp.icai.org' },
];

const STORAGE_KEY = 'portalTypes';

/**
 * Normalise a stored entry — handles both the old string format and the new
 * { id, name, url } object format so existing localStorage data keeps working.
 */
function normalise(entry) {
  if (typeof entry === 'string') {
    return { id: entry, name: entry, url: '' };
  }
  return { id: entry.id ?? entry.name, name: entry.name ?? '', url: entry.url ?? '' };
}

export function getPortalTypes() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(normalise);
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_PORTAL_TYPES.map(p => ({ ...p }));
}

export function savePortalTypes(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

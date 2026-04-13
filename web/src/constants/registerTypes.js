// Default register types — key is used for config lookup, label shown on tab
const DEFAULT_REGISTER_TYPES = [
  { key: 'gst', label: 'GST Register',    icon: '📊' },
  { key: 'tds', label: 'TDS Register',    icon: '📋' },
  { key: 'roc', label: 'ROC Register',    icon: '🏢' },
  { key: 'it',  label: 'IT Register',     icon: '💼' },
  { key: 'pf',  label: 'PF/ESI Register', icon: '👥' },
  { key: 'payments', label: 'Payment Register', icon: '💳' },
];

const STORAGE_KEY = 'registerTypes';

export function getRegisterTypes() {
  const defaults = [...DEFAULT_REGISTER_TYPES];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const byKey = new Map(parsed.map((r) => [r.key, r]));
        let needsSave = false;
        for (const d of defaults) {
          if (!byKey.has(d.key)) {
            parsed.push({ ...d });
            byKey.set(d.key, d);
            needsSave = true;
          }
        }
        if (needsSave) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
          } catch { /* ignore */ }
        }
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return defaults;
}

export function saveRegisterTypes(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

export { DEFAULT_REGISTER_TYPES };

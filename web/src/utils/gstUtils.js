/**
 * First two digits of a valid Indian GSTIN are the state / UT code.
 * @param {string} gstin
 * @returns {string} Two-digit code or '' if unknown
 */
export function stateCodeFromGstin(gstin) {
  const g = String(gstin || '').replace(/\s/g, '').toUpperCase();
  if (g.length < 2) return '';
  const code = g.slice(0, 2);
  if (!/^\d{2}$/.test(code)) return '';
  const n = parseInt(code, 10);
  if (n < 1 || n > 99) return '';
  return code;
}

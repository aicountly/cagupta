/**
 * Content filter for invoice line preset labels (`Service (category)` strings).
 * Splits query on whitespace; every token must match as a case-insensitive substring.
 */
export function matchesLineItemContentFilter(description, rawQuery) {
  const hay = String(description || '').toLowerCase();
  const tokens = String(rawQuery || '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((t) => hay.includes(t));
}

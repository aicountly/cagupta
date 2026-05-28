const LEDGER_CLASSES = ['regular', 'memorandum', 'optional', 'parked'];

export function normalizeLedgerClassForApi(lc: unknown): string {
  const s = String(lc || '').trim();
  return LEDGER_CLASSES.includes(s) ? s : 'regular';
}

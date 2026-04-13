/** Controlled vocabulary for client payment expenses (on behalf). Value = API expense_purpose. */
export const EXPENSE_PURPOSE_OPTIONS = [
  { value: 'challan', label: 'Challan' },
  { value: 'stamp_paper', label: 'Stamp paper / duty' },
  { value: 'notary', label: 'Notary' },
  { value: 'statutory_fee', label: 'Statutory / government fee' },
  { value: 'misc', label: 'Miscellaneous' },
  { value: 'other', label: 'Other' },
];

export function expensePurposeLabel(value) {
  if (!value) return '—';
  const o = EXPENSE_PURPOSE_OPTIONS.find((x) => x.value === value);
  return o ? o.label : value;
}

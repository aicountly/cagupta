/** Display unsigned amount with Dr/Cr (Dr = funds in account). */
export function formatBankOpeningBalance(amount, type = 'debit') {
  const a = Math.abs(Number(amount) || 0);
  if (a < 0.00001) return '₹0';
  const side = type === 'credit' ? 'Cr' : 'Dr';
  return `₹${a.toLocaleString('en-IN')} ${side}`;
}

export const EXPENSE_CATS = [
  { value: 'salary', label: 'Salary' },
  { value: 'drawings', label: 'Drawings' },
  { value: 'rent', label: 'Rent' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'other', label: 'Other' },
];

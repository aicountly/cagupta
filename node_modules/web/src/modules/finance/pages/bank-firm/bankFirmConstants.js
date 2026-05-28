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
  { value: 'bank_charges', label: 'Bank charges' },
  { value: 'subscription_expenses', label: 'Subscription Expenses' },
  { value: 'repair_maintenance', label: 'Repair & Maintenance' },
  { value: 'other', label: 'Other' },
];

export const INFLOW_CATS = [
  { value: 'fund_infusion', label: 'Fund infusion' },
];

export const REPORT_KINDS = [
  { value: 'all', label: 'All' },
  { value: 'intra_transfer', label: 'Intra transfers' },
  { value: 'inter_transfer', label: 'Inter transfers' },
  { value: 'expense', label: 'Expenses' },
  { value: 'inflow', label: 'Inflows' },
];

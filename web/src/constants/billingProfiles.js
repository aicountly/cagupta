// Single source of truth for Billing Profiles
export const BILLING_PROFILES = [
  { id: 'RBGC-CHD', code: 'RBGC-CHD', name: 'RAHUL B GUPTA & CO. CHD' },
  { id: 'RBGC-JAL', code: 'RBGC-JAL', name: 'RAHUL B GUPTA & CO. JAL' },
  { id: 'PROFS',    code: 'PROFS',    name: 'PROFSINDIA VIRTUAL SERVICES LLP' },
  { id: 'TEFL',     code: 'TEFL',     name: 'TRADE ERA FILINGS LLP' },
];

export function getBillingProfileByCode(code) {
  return BILLING_PROFILES.find(p => p.code === code) || null;
}

export function getBillingProfileName(code) {
  const profile = getBillingProfileByCode(code);
  return profile ? profile.name : null;
}

// Service catalogue shown on Home (compact cards) and /services (detailed list).
// TODO: confirm copy / pricing notes / scope with the firm before launch.

export const SERVICES = [
  {
    slug: 'income-tax',
    icon: 'FileText',
    title: 'Income Tax & ITR Filing',
    short: 'Accurate ITR filing, tax planning, refunds, and notice handling for individuals and businesses.',
    bullets: [
      'ITR filing for salaried, business, capital gains, and NRI cases',
      'Advance tax and TDS planning',
      'Income-tax notices, scrutiny, and appeals',
      'Tax audit u/s 44AB and presumptive taxation',
    ],
  },
  {
    slug: 'gst',
    icon: 'Receipt',
    title: 'GST Compliance',
    short: 'End-to-end GST registration, returns, reconciliations, refunds, and audits.',
    bullets: [
      'GST registration, amendments, and cancellation',
      'Monthly / quarterly returns – GSTR-1, 3B, 9, 9C',
      'Input tax credit reconciliation (2A / 2B)',
      'GST audits, refunds, and litigation support',
    ],
  },
  {
    slug: 'audit-assurance',
    icon: 'ShieldCheck',
    title: 'Audit & Assurance',
    short: 'Statutory, internal, and tax audits with a strong focus on actionable insights.',
    bullets: [
      'Statutory audit under Companies Act',
      'Tax audit and GST audit',
      'Internal audit and concurrent audit',
      'Stock audit and management audits',
    ],
  },
  {
    slug: 'roc-mca',
    icon: 'Building2',
    title: 'ROC & MCA Compliance',
    short: 'Company and LLP incorporation plus annual ROC filings and event-based compliances.',
    bullets: [
      'Private Limited / OPC / LLP / Section 8 incorporation',
      'Annual filings – AOC-4, MGT-7, DIR-3 KYC',
      'Director appointment, share allotment, charge filings',
      'Strike-off, conversion, and closure formalities',
    ],
  },
  {
    slug: 'bookkeeping',
    icon: 'BookOpen',
    title: 'Bookkeeping & Accounting',
    short: 'Cloud-based monthly bookkeeping, MIS reports, and ledger reconciliations.',
    bullets: [
      'Monthly accounting on Tally / Zoho Books / QuickBooks',
      'Bank, vendor, and customer reconciliations',
      'Payroll processing and statutory compliances',
      'Custom MIS dashboards and management reports',
    ],
  },
  {
    slug: 'advisory',
    icon: 'TrendingUp',
    title: 'Business & Tax Advisory',
    short: 'Strategic advisory on structuring, valuations, fundraising, and growth decisions.',
    bullets: [
      'Business structuring and tax-efficient planning',
      'Startup advisory – DPIIT, 80-IAC, angel tax',
      'Valuations and fundraising support',
      'Cross-border taxation and FEMA advisory',
    ],
  },
];

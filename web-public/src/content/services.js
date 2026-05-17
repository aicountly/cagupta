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

/** Specialised / advanced practice areas shown on the /services page. */
export const ADVANCED_PRACTICE_AREAS = [
  {
    id: 'ai_audit',
    icon: 'ShieldCheck',
    color: '#2563EB',
    bg: '#EFF6FF',
    border: '#BFDBFE',
    label: 'AI Audit',
    tagline: 'AI-powered audit & compliance review',
    bullets: [
      'Automated risk-flagging across ledgers',
      'AI-assisted compliance checks',
      'Continuous control monitoring',
    ],
  },
  {
    id: 'it_consultancy',
    icon: 'Monitor',
    color: '#7C3AED',
    bg: '#F5F3FF',
    border: '#DDD6FE',
    label: 'IT Consultancy',
    tagline: 'Information technology strategy & advisory',
    bullets: [
      'Technology roadmaps for finance teams',
      'Bespoke portal & automation scoping',
      'Vendor evaluation and delivery oversight',
    ],
  },
  {
    id: 'ai_consultancy',
    icon: 'Brain',
    color: '#DB2777',
    bg: '#FDF2F8',
    border: '#FBCFE8',
    label: 'AI Consultancy',
    tagline: 'AI strategy & transformation consulting',
    bullets: [
      'AI readiness assessment',
      'Use-case identification and prioritisation',
      'Change management and adoption planning',
    ],
  },
  {
    id: 'ai_implementation',
    icon: 'Cpu',
    color: '#0891B2',
    bg: '#ECFEFF',
    border: '#A5F3FC',
    label: 'AI Implementation',
    tagline: 'End-to-end AI solution delivery',
    bullets: [
      'Custom AI tool build and integration',
      'LLM-powered workflow automation',
      'Quality assurance and post-launch support',
    ],
  },
  {
    id: 'investor_funding',
    icon: 'TrendingUp',
    color: '#059669',
    bg: '#ECFDF5',
    border: '#A7F3D0',
    label: 'Investor Funding',
    tagline: 'Fundraising, pitch decks & investor relations',
    bullets: [
      'Financial narrative and MIS for fundraising',
      'Cap tables and FEMA-aware structuring',
      'Investor diligence room preparation',
    ],
  },
  {
    id: 'govt_subsidies',
    icon: 'Building2',
    color: '#D97706',
    bg: '#FFFBEB',
    border: '#FDE68A',
    label: 'Govt. Subsidies',
    tagline: 'Government grants, subsidies & scheme advisory',
    bullets: [
      'Central & state scheme mapping',
      'Documentation and timeline management',
      'Reimbursement tracking and audit-ready books',
    ],
  },
];

/** Highlights shown only on `/services`, below the main catalogue. */
export const SERVICES_BEYOND = {
  eyebrow: 'Beyond the checklist',
  title: 'Where we operate as stewards — and problem solvers.',
  intro:
    'Compliance is table stakes; we regularly step in upstream of filings — on incentives, investors, messy operations, and how technology can carry the load.',
  bullets: [
    'Government subsidies — mapping eligible schemes (central & state), documentation, timelines, reimbursement tracking, and clean books so benefits hold up to audit.',
    'Investor funding — investment readiness: financial narrative, MIS, diligence rooms, valuations context, cap tables, and tax/FEMA-aware structuring conversations with founders.',
    'Hands-on problem solving — unpacking stuck situations across tax, operations, and controls, assigning owners and turning ambiguity into executable next steps.',
    'IT & custom applications — bridging business users and builders: documenting workflows, sizing a bespoke portal or automation, and supervising delivery so a custom app actually lifts throughput and lowers errors.',
  ],
};

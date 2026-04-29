// Static blog posts — TODO: replace with real posts and add a CMS later if needed.
// `body` accepts an array of { type, text } blocks so we can render headings/paragraphs.

export const BLOG_POSTS = [
  {
    slug: 'itr-filing-checklist-fy-2025-26',
    title: 'ITR filing checklist for FY 2025-26: documents you should keep handy',
    date: '2026-04-15',
    author: 'CA Rahul Gupta',
    excerpt:
      'A practical, no-jargon checklist of everything you should pull together before sitting down to file your income-tax return this year.',
    body: [
      { type: 'p', text: 'The new financial year is here, and with it the annual ritual of gathering documents for your ITR. Whether you are a salaried professional, a freelancer, or running a business, having the right files ready up-front saves hours of back-and-forth later.' },
      { type: 'h2', text: 'Identity & login' },
      { type: 'p', text: 'PAN, Aadhaar (linked to PAN), and access to the income-tax portal — make sure your password works and your mobile number is updated.' },
      { type: 'h2', text: 'Income proofs' },
      { type: 'p', text: 'Form 16 from every employer for the year, salary slips for any unaccounted months, capital-gains statements from your broker, rental receipts, and Form 26AS / AIS / TIS downloads.' },
      { type: 'h2', text: 'Investments and deductions' },
      { type: 'p', text: 'LIC and term-insurance receipts, ELSS / PPF statements, home-loan principal and interest certificates, education-loan interest certificate, NPS contribution proofs, and any donations claimed under 80G.' },
      { type: 'p', text: 'If you keep these handy, your ITR can usually be filed and reviewed in a single sitting.' },
    ],
  },
  {
    slug: 'gst-input-tax-credit-mistakes',
    title: '5 GST input tax credit mistakes we keep seeing in SME books',
    date: '2026-03-22',
    author: 'CA Rahul Gupta',
    excerpt:
      'From mismatched 2B reconciliations to credits taken on blocked expenses — here are the GST ITC pitfalls we flag most often during review.',
    body: [
      { type: 'p', text: 'GST input tax credit is where most working capital quietly leaks out of small businesses. The rules look simple on paper, but month after month we see the same handful of mistakes.' },
      { type: 'h2', text: '1. Claiming ITC without 2B match' },
      { type: 'p', text: 'Since the 2B-only regime, you can only claim what your supplier has actually filed. Before claiming a credit, reconcile your purchase register with GSTR-2B every single month.' },
      { type: 'h2', text: '2. Blocked credits taken anyway' },
      { type: 'p', text: 'Section 17(5) bars credit on motor vehicles, food and beverages for staff, club memberships, etc. Tagging these correctly in books prevents a costly reversal later.' },
      { type: 'h2', text: '3. Not reversing ITC on credit notes' },
      { type: 'p', text: 'When a supplier issues a credit note, the proportionate ITC has to be reversed in the same period. Missing this is one of the most common scrutiny triggers.' },
      { type: 'p', text: 'Want a clean ITC review for your business? Reach out via our contact page and we will share a sample report.' },
    ],
  },
  {
    slug: 'startup-incorporation-private-limited-vs-llp',
    title: 'Private Limited vs LLP: which structure should your startup pick?',
    date: '2026-02-08',
    author: 'CA Rahul Gupta',
    excerpt:
      'A founder-friendly comparison of Private Limited and LLP — covering compliance load, fund-raising readiness, taxation, and exit options.',
    body: [
      { type: 'p', text: '“Private Limited or LLP?” is the single most common question we get from first-time founders. The right answer depends on what you intend to do in the next 24 months.' },
      { type: 'h2', text: 'When Private Limited makes sense' },
      { type: 'p', text: 'If you plan to raise external capital (angels, VCs, or even family at fair value), issue ESOPs, or eventually list — Private Limited is the only realistic option. Investors are familiar with the cap-table mechanics, and the equity instruments (CCPS, CCDs) are well-tested.' },
      { type: 'h2', text: 'When LLP makes sense' },
      { type: 'p', text: 'For service businesses, professional partnerships, and bootstrapped startups that will not raise equity capital, an LLP gives most of the same liability protection at a fraction of the compliance cost. There is no DDT, no audit unless turnover exceeds the threshold, and far fewer ROC events.' },
      { type: 'p', text: 'Talk to us before you incorporate — converting later is possible, but it is far cheaper to start with the right structure on day one.' },
    ],
  },
];

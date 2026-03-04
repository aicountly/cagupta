// ─── Service Catalog ─────────────────────────────────────────────────────────
// Default catalog seeded with realistic CA-firm items.
// The shape is intentionally stable so this module can later be replaced
// by a fetch from Settings / API without changing consumers.
//
// Override at runtime: localStorage.setItem("serviceCatalog", JSON.stringify({...}))

const defaultServiceCatalog = {
  version: 1,
  categories: [
    {
      id: 'itr',
      name: 'ITR',
      subcategories: [
        {
          id: 'itr-individuals',
          name: 'Individuals',
          engagementTypes: [
            {
              id: 'itr-ind-regular',
              name: 'ITR Filing (Regular)',
              defaultSlaDays: 30,
              defaultChecklist: [
                'Collect Form 16 from client',
                'Download AIS/TIS from portal',
                'Prepare ITR draft',
                'Get client approval',
                'File ITR on portal',
                'Share acknowledgement with client',
              ],
            },
            {
              id: 'itr-ind-audit',
              name: 'ITR Filing (Audit)',
              defaultSlaDays: 60,
              defaultChecklist: [
                'Collect books of accounts',
                'Complete tax audit (Form 3CA/3CB + 3CD)',
                'Prepare ITR draft',
                'Get client approval',
                'File tax audit report on portal',
                'File ITR on portal',
                'Share acknowledgement with client',
              ],
            },
            {
              id: 'itr-ind-notice',
              name: 'Notice Reply',
              defaultSlaDays: 14,
              defaultChecklist: [
                'Collect notice from client',
                'Analyze notice and identify grounds',
                'Prepare response draft',
                'Get client approval on response',
                'Submit response on portal',
                'Save acknowledgement',
              ],
            },
          ],
        },
        {
          id: 'itr-businesses',
          name: 'Businesses',
          engagementTypes: [
            {
              id: 'itr-biz-regular',
              name: 'ITR Filing (Regular)',
              defaultSlaDays: 45,
              defaultChecklist: [
                'Collect P&L and Balance Sheet',
                'Reconcile books with GST returns',
                'Compute taxable income',
                'Prepare ITR draft',
                'Get client approval',
                'File ITR on portal',
                'Share acknowledgement with client',
              ],
            },
            {
              id: 'itr-biz-audit',
              name: 'ITR Filing (Audit)',
              defaultSlaDays: 75,
              defaultChecklist: [
                'Collect audited financials',
                'Complete tax audit (Form 3CA + 3CD)',
                'Prepare ITR draft',
                'Get client approval',
                'File tax audit report',
                'File ITR on portal',
                'Share acknowledgement with client',
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'gst',
      name: 'GST',
      subcategories: [
        {
          id: 'gst-returns',
          name: 'Returns',
          engagementTypes: [
            {
              id: 'gst-gstr3b-1',
              name: 'GSTR-3B + GSTR-1',
              defaultSlaDays: 20,
              defaultChecklist: [
                'Collect purchase & sales data',
                'Reconcile ITC with GSTR-2B',
                'Prepare GSTR-1 draft',
                'Prepare GSTR-3B draft',
                'Get client approval',
                'File GSTR-1',
                'File GSTR-3B',
                'Share filed copies with client',
              ],
            },
            {
              id: 'gst-annual',
              name: 'GSTR-9 (Annual Return)',
              defaultSlaDays: 90,
              defaultChecklist: [
                'Compile all monthly GSTR-1 and GSTR-3B data',
                'Reconcile with books',
                'Prepare GSTR-9 draft',
                'Get client approval',
                'File GSTR-9 on portal',
              ],
            },
          ],
        },
        {
          id: 'gst-registration',
          name: 'Registration',
          engagementTypes: [
            {
              id: 'gst-new-reg',
              name: 'GST Registration',
              defaultSlaDays: 7,
              defaultChecklist: [
                'Collect KYC documents',
                'Collect business proof documents',
                'Apply for GST registration on portal',
                'Respond to queries / clarifications',
                'Share GST certificate with client',
              ],
            },
            {
              id: 'gst-amendment',
              name: 'GST Amendment',
              defaultSlaDays: 10,
              defaultChecklist: [
                'Identify fields to amend',
                'Collect supporting documents',
                'File amendment application',
                'Share updated certificate',
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'roc',
      name: 'ROC / Company Law',
      subcategories: [
        {
          id: 'roc-annual',
          name: 'Annual Filing',
          engagementTypes: [
            {
              id: 'roc-aoc4-mgt7',
              name: 'AOC-4 + MGT-7',
              defaultSlaDays: 60,
              defaultChecklist: [
                'Collect audited financials',
                'Prepare AOC-4 (Financial Statement)',
                'Prepare MGT-7 (Annual Return)',
                'Get board approval / DIN certification',
                'File AOC-4 on MCA21',
                'File MGT-7 on MCA21',
                'Collect SRN receipts',
              ],
            },
          ],
        },
        {
          id: 'roc-event',
          name: 'Event Based',
          engagementTypes: [
            {
              id: 'roc-dir3-kyc',
              name: 'DIR-3 KYC',
              defaultSlaDays: 30,
              defaultChecklist: [
                'Collect KYC documents of director',
                'Generate and send OTP',
                'File DIR-3 KYC on MCA21',
                'Share acknowledgement',
              ],
            },
            {
              id: 'roc-inc22',
              name: 'Change of Registered Office',
              defaultSlaDays: 45,
              defaultChecklist: [
                'Collect proof of new address',
                'Board resolution for change',
                'File INC-22 on MCA21',
                'Update statutory records',
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'audit',
      name: 'Audit',
      subcategories: [
        {
          id: 'audit-tax',
          name: 'Tax Audit',
          engagementTypes: [
            {
              id: 'audit-tax-main',
              name: 'Tax Audit (u/s 44AB)',
              defaultSlaDays: 90,
              defaultChecklist: [
                'Receive engagement letter',
                'Collect books of accounts',
                'Verify sales / turnover threshold',
                'Perform audit procedures',
                'Prepare Form 3CD annexures',
                'Issue audit report (Form 3CA/3CB)',
                'File on income tax portal',
              ],
            },
          ],
        },
        {
          id: 'audit-stat',
          name: 'Statutory Audit',
          engagementTypes: [
            {
              id: 'audit-stat-main',
              name: 'Statutory Audit',
              defaultSlaDays: 120,
              defaultChecklist: [
                'Accept audit engagement',
                'Plan audit (risk assessment)',
                'Perform fieldwork',
                'Review internal controls',
                'Issue management letter',
                'Issue audit report',
                'Present to board / AGM',
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'bookkeeping',
      name: 'Bookkeeping',
      subcategories: [
        {
          id: 'bk-monthly',
          name: 'Monthly',
          engagementTypes: [
            {
              id: 'bk-monthly-main',
              name: 'Monthly Bookkeeping',
              defaultSlaDays: 15,
              defaultChecklist: [
                'Collect bank statements',
                'Collect purchase & sales invoices',
                'Post entries in accounting software',
                'Bank reconciliation',
                'Share MIS report with client',
              ],
            },
          ],
        },
        {
          id: 'bk-quarterly',
          name: 'Quarterly',
          engagementTypes: [
            {
              id: 'bk-quarterly-main',
              name: 'Quarterly Bookkeeping',
              defaultSlaDays: 30,
              defaultChecklist: [
                'Collect source documents for the quarter',
                'Post journal entries',
                'Quarterly bank reconciliation',
                'Prepare provisional P&L',
                'Share report with client',
              ],
            },
          ],
        },
      ],
    },
  ],
};

/**
 * Returns the active service catalog.
 * Priority: localStorage override → defaultServiceCatalog
 */
export function getServiceCatalog() {
  try {
    const stored = localStorage.getItem('serviceCatalog');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && Array.isArray(parsed.categories) && parsed.categories.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore malformed data
  }
  return defaultServiceCatalog;
}

export default defaultServiceCatalog;

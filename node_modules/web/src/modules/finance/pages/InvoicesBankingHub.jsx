import { useNavigate } from 'react-router-dom';
import { Receipt, Landmark, ArrowRight, Layers, BookOpen, Wallet } from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';

const HUB_SECTIONS = [
  {
    id: 'invoices',
    label: 'Invoices & Ledger',
    description: 'Client billing, payment tracking, and financial ledger',
    permission: 'invoices.view',
    tools: [
      {
        id: 'invoices',
        label: 'Invoices',
        description: 'Manage client invoices, receipts, payments, TDS, rebates, credit notes, and service billing.',
        icon: Receipt,
        to: '/invoices',
      },
      {
        id: 'ledgers',
        label: 'Ledgers',
        description: 'View client ledger, bill-by-bill settlement, and recovery list.',
        icon: BookOpen,
        to: '/invoices/ledgers',
      },
    ],
  },
  {
    id: 'cash-book',
    label: 'Cash book',
    description: 'Counter cash and petty cash day book (cash accounts only)',
    anyOf: ['cash_book.view', 'invoices.view'],
    tools: [
      {
        id: 'cash-book',
        label: 'Cash book',
        description: 'View cash accounts, record expenses and inflows, transfers between cash accounts, and day-book reports.',
        icon: Wallet,
        to: '/finance/cash-book',
      },
    ],
  },
  {
    id: 'bank',
    label: 'Bank & Firm Transactions',
    description: 'Firm bank accounts, transfers, and expense management (bank accounts only)',
    permission: 'invoices.view',
    tools: [
      {
        id: 'bank-firm',
        label: 'Bank & Firm Transactions',
        description: 'Manage bank accounts, inter-account transfers, expenses, inflows, and bank ledger entries.',
        icon: Landmark,
        to: '/finance/bank-reports',
      },
    ],
  },
];

export default function InvoicesBankingHub() {
  const navigate = useNavigate();
  const { hasPermission, hasAnyPermission } = useAuth();

  const visibleSections = HUB_SECTIONS.filter((s) => {
    if (s.anyOf && !hasAnyPermission(s.anyOf)) return false;
    if (s.permission && !hasPermission(s.permission)) return false;
    return true;
  });

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <Layers size={28} color="var(--portal-primary)" />
        </div>
        <div>
          <h1 style={styles.headerTitle}>Invoices & Banking</h1>
          <p style={styles.headerSub}>
            Manage invoices, ledger, bank accounts, and cash book.
          </p>
        </div>
      </div>

      {visibleSections.map((section) => (
        <section key={section.id} style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>{section.label}</span>
            <span style={styles.sectionDesc}>{section.description}</span>
          </div>
          <div style={styles.grid}>
            {section.tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  style={styles.card}
                  onClick={() => navigate(tool.to)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(var(--portal-primary-rgb),0.13)';
                    e.currentTarget.style.borderColor = 'var(--portal-primary)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = styles.card.boxShadow;
                    e.currentTarget.style.borderColor = styles.card.borderColor;
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  <div style={styles.cardIconWrap}>
                    <Icon size={20} color="var(--portal-primary)" />
                  </div>
                  <div style={styles.cardBody}>
                    <div style={styles.cardTitle}>{tool.label}</div>
                    <div style={styles.cardDesc}>{tool.description}</div>
                  </div>
                  <ArrowRight size={16} color="#cbd5e1" style={{ flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

const styles = {
  page: {
    padding: '32px 36px',
    maxWidth: 960,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 36,
  },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    background: 'var(--portal-primary-tint)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: '#1e293b',
  },
  headerSub: {
    margin: '3px 0 0',
    fontSize: 13,
    color: '#64748b',
  },
  section: {
    marginBottom: 36,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    display: 'block',
    marginBottom: 2,
  },
  sectionDesc: {
    fontSize: 12,
    color: '#94a3b8',
    display: 'block',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: 14,
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '16px 18px',
    background: '#fff',
    border: '1px solid #e8ecf3',
    borderRadius: 12,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'box-shadow 0.15s, border-color 0.15s, transform 0.15s',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    borderColor: '#e8ecf3',
  },
  cardIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    background: 'var(--portal-primary-tint)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#1e293b',
    marginBottom: 3,
  },
  cardDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 1.4,
  },
};

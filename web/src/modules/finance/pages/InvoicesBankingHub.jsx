import { useNavigate } from 'react-router-dom';
import { Receipt, Landmark, ArrowRight, Layers } from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';

const HUB_SECTIONS = [
  {
    id: 'invoices',
    label: 'Invoices & Ledger',
    description: 'Client billing, payment tracking, and financial ledger',
    permission: null,
    tools: [
      {
        id: 'invoices',
        label: 'Invoices & Ledger',
        description: 'Manage client invoices, record payments, and view the complete financial ledger.',
        icon: Receipt,
        to: '/invoices',
      },
    ],
  },
  {
    id: 'bank',
    label: 'Bank & Firm Transactions',
    description: 'Bank accounts, firm accounts, transfers, and expense management',
    permission: 'invoices.view',
    tools: [
      {
        id: 'bank-firm',
        label: 'Bank & Firm Transactions',
        description: 'Manage bank accounts, firm accounts, inter-account transfers, expenses, and view ledger entries.',
        icon: Landmark,
        to: '/finance/bank-reports',
      },
    ],
  },
];

export default function InvoicesBankingHub() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const visibleSections = HUB_SECTIONS.filter(
    (s) => s.permission === null || hasPermission(s.permission),
  );

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <Layers size={28} color="#F37920" />
        </div>
        <div>
          <h1 style={styles.headerTitle}>Invoices & Banking</h1>
          <p style={styles.headerSub}>
            Manage invoices, ledger, bank accounts, and firm transactions.
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
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(243,121,32,0.13)';
                    e.currentTarget.style.borderColor = '#F37920';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = styles.card.boxShadow;
                    e.currentTarget.style.borderColor = styles.card.borderColor;
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  <div style={styles.cardIconWrap}>
                    <Icon size={20} color="#F37920" />
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
    background: '#FEF0E6',
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
    background: '#FEF0E6',
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

import { useNavigate } from 'react-router-dom';
import { Wallet, ArrowRight, Handshake, Briefcase } from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';

const PAYOUT_SECTIONS = [
  {
    id: 'affiliate',
    label: 'Affiliate Payouts',
    description: 'Process and manage payout cycles for affiliate partners',
    permission: 'affiliates.manage',
    tools: [
      {
        id: 'affiliate-payout-cycles',
        label: 'Affiliate Payout Cycles',
        description: 'Review, approve, and disburse affiliate commissions. Manage cycle-wise payouts for all affiliate partners.',
        icon: Handshake,
        to: '/finance/affiliate-payout-cycles',
      },
    ],
  },
  {
    id: 'partner',
    label: 'Partner Payouts',
    description: 'Process and manage payout cycles for service delivery partners',
    permission: 'partners.manage',
    tools: [
      {
        id: 'partner-payout-cycles',
        label: 'Partner Payout Cycles',
        description: 'Review, approve, and disburse partner fees. Manage cycle-wise payouts for all service delivery partners.',
        icon: Briefcase,
        to: '/finance/partner-payout-cycles',
      },
    ],
  },
];

export default function PayoutCyclesHub() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const visibleSections = PAYOUT_SECTIONS.filter((s) => hasPermission(s.permission));

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <Wallet size={28} color="#F37920" />
        </div>
        <div>
          <h1 style={styles.headerTitle}>Payout Cycles</h1>
          <p style={styles.headerSub}>
            Manage affiliate and partner payout cycles from one place.
          </p>
        </div>
      </div>

      {visibleSections.length === 0 ? (
        <div style={styles.empty}>
          <Wallet size={36} color="#cbd5e1" />
          <p style={{ marginTop: 12, color: '#94a3b8', fontSize: 14 }}>
            You do not have permission to manage payout cycles.
          </p>
        </div>
      ) : (
        visibleSections.map((section) => (
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
        ))
      )}
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
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 60,
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

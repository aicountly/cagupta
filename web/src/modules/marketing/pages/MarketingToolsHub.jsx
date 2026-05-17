import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare, Smartphone, Share2, Megaphone, BookOpen,
  Search, ArrowRight, Zap,
} from 'lucide-react';

const TOOL_CATEGORIES = [
  {
    id: 'whatsapp',
    label: 'WhatsApp Marketing',
    description: 'Send bulk messages via WhatsApp Web automation or Business API',
    tools: [
      {
        id: 'wa-web',
        label: 'WA Web (Browser)',
        description: 'Send bulk WhatsApp messages using browser automation. Ideal for manual campaigns.',
        icon: Smartphone,
        to: '/marketing/wa/web',
      },
      {
        id: 'wa-api',
        label: 'WA Native (API)',
        description: 'Send messages via WhatsApp Business API for automated and programmatic delivery.',
        icon: MessageSquare,
        to: '/marketing/wa/api',
      },
    ],
  },
  {
    id: 'sms',
    label: 'SMS Marketing',
    description: 'Send bulk SMS messages to contacts and client groups',
    tools: [
      {
        id: 'sms',
        label: 'SMS Marketing',
        description: 'Send bulk SMS messages to contacts and client groups via integrated gateways.',
        icon: Smartphone,
        to: '/marketing/sms',
      },
    ],
  },
  {
    id: 'social',
    label: 'Social Posting',
    description: 'Schedule and publish content across social media platforms',
    tools: [
      {
        id: 'social',
        label: 'Social Posting',
        description: 'Schedule and publish posts across Facebook, Instagram, LinkedIn, and more.',
        icon: Share2,
        to: '/marketing/social',
      },
    ],
  },
  {
    id: 'campaigns',
    label: 'Campaigns',
    description: 'Create and track multi-channel marketing campaigns',
    tools: [
      {
        id: 'campaigns',
        label: 'Marketing Campaigns',
        description: 'Create and track multi-channel marketing campaigns with built-in analytics.',
        icon: Megaphone,
        to: '/marketing/campaigns',
      },
    ],
  },
  {
    id: 'blog',
    label: 'Blog Management',
    description: 'Write, manage, and publish blog content to your website',
    tools: [
      {
        id: 'blog',
        label: 'Blog Management',
        description: 'Write, manage, and publish AI-assisted blog posts to your website.',
        icon: BookOpen,
        to: '/marketing/blog',
      },
    ],
  },
];

export default function MarketingToolsHub() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TOOL_CATEGORIES
      .map((cat) => ({
        ...cat,
        tools: cat.tools.filter((t) => {
          if (!q) return true;
          return (
            t.label.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            cat.label.toLowerCase().includes(q)
          );
        }),
      }))
      .filter((cat) => cat.tools.length > 0);
  }, [query]);

  const totalVisible = filteredCategories.reduce((n, c) => n + c.tools.length, 0);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <Zap size={28} color="#F37920" />
        </div>
        <div>
          <h1 style={styles.headerTitle}>Marketing Tools</h1>
          <p style={styles.headerSub}>
            Access all marketing channels and campaign tools in one place.
          </p>
        </div>
      </div>

      <div style={styles.searchWrap}>
        <Search size={15} style={styles.searchIcon} />
        <input
          type="text"
          placeholder="Search tools…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={styles.searchInput}
        />
        {query && (
          <button style={styles.clearBtn} onClick={() => setQuery('')} type="button">
            ✕
          </button>
        )}
      </div>

      {filteredCategories.length === 0 ? (
        <div style={styles.empty}>
          <Search size={36} color="#cbd5e1" />
          <p style={{ marginTop: 12, color: '#94a3b8', fontSize: 14 }}>
            No tools match &ldquo;{query}&rdquo;
          </p>
        </div>
      ) : (
        <>
          {query && (
            <p style={styles.resultCount}>
              {totalVisible} result{totalVisible !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
            </p>
          )}
          {filteredCategories.map((cat) => (
            <section key={cat.id} style={styles.section}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>{cat.label}</span>
                <span style={styles.sectionDesc}>{cat.description}</span>
              </div>
              <div style={styles.grid}>
                {cat.tools.map((tool) => {
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
        </>
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
    marginBottom: 28,
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
  searchWrap: {
    position: 'relative',
    marginBottom: 32,
    maxWidth: 420,
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#94a3b8',
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    padding: '10px 36px 10px 36px',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    fontSize: 13,
    color: '#1e293b',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },
  clearBtn: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 1,
    padding: 2,
  },
  resultCount: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 20,
    marginTop: -20,
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
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

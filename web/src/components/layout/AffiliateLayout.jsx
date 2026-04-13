import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import logoUrl from '../../assets/cropped_logo.png';

const nav = [
  { to: '/affiliate', label: 'Dashboard', end: true },
  { to: '/affiliate/services', label: 'My services' },
  { to: '/affiliate/commissions', label: 'Commissions' },
  { to: '/affiliate/payouts', label: 'Payouts' },
  { to: '/affiliate/bank', label: 'Bank / KYC' },
  { to: '/affiliate/sub-affiliates', label: 'Invite affiliate' },
  { to: '/affiliate/profile', label: 'Profile' },
];

export default function AffiliateLayout({ title, children }) {
  const navigate = useNavigate();
  const { logout, session } = useAuth();
  const name = session?.user?.name || 'Affiliate';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F6F7FB' }}>
      <aside style={{
        width: 220, background: '#fff', borderRight: '1px solid #E6E8F0', display: 'flex', flexDirection: 'column',
      }}
      >
        <div style={{ padding: 16, borderBottom: '1px solid #f1f5f9' }}>
          <img src={logoUrl} alt="" style={{ height: 36, display: 'block' }} />
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>Partner portal</div>
        </div>
        <nav style={{ flex: 1, padding: '12px 0' }}>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                display: 'block',
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: isActive ? '#5b21b6' : '#475569',
                background: isActive ? '#f5f3ff' : 'transparent',
                textDecoration: 'none',
                borderLeft: isActive ? '3px solid #7c3aed' : '3px solid transparent',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: 12, borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#64748b' }}>
          <div style={{ fontWeight: 600, color: '#334155', marginBottom: 8 }}>{name}</div>
          <button
            type="button"
            onClick={() => { logout(); navigate('/login', { replace: true }); }}
            style={{
              width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #e2e8f0',
              background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          padding: '14px 24px', background: '#fff', borderBottom: '1px solid #E6E8F0',
          fontSize: 18, fontWeight: 700, color: '#0f172a',
        }}
        >
          {title}
        </header>
        <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {children}
        </main>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown, Handshake, LogIn, Menu, UserCircle, Users, X } from 'lucide-react';
import logoUrl from '../../assets/cropped_logo.png';
import Button from '../ui/Button.jsx';
import Container from '../ui/Container.jsx';
import { PORTAL_LINKS, SITE } from '../../config/site.config.js';

const NAV_ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About' },
  { to: '/services', label: 'Services' },
  { to: '/blog', label: 'Blog' },
  { to: '/contact', label: 'Contact' },
];

const PORTAL_OPTIONS = [
  {
    key: 'staff',
    label: 'Staff & Team',
    sub: 'For internal team members',
    href: PORTAL_LINKS.staff,
    Icon: Users,
    iconClass: 'login-dd__icon--staff',
  },
  {
    key: 'affiliate',
    label: 'Affiliate Partner',
    sub: 'For referral partners',
    href: PORTAL_LINKS.affiliate,
    Icon: Handshake,
    iconClass: 'login-dd__icon--affiliate',
  },
  {
    key: 'client',
    label: 'My CA',
    sub: 'For our clients',
    href: PORTAL_LINKS.client,
    Icon: UserCircle,
    iconClass: 'login-dd__icon--client',
  },
];

function LoginDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onEsc(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="login-dd" ref={ref}>
      <Button
        variant="primary"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <LogIn size={16} /> Login
        <ChevronDown size={14} style={{ marginLeft: 2, opacity: 0.85 }} />
      </Button>
      {open && (
        <div className="login-dd__panel" role="menu">
          <div className="login-dd__title">Choose your portal</div>
          {PORTAL_OPTIONS.map(({ key, label, sub, href, Icon, iconClass }) => (
            <a
              key={key}
              href={href}
              className="login-dd__item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <span className={`login-dd__icon ${iconClass}`}>
                <Icon size={18} />
              </span>
              <span style={{ flex: 1 }}>
                <span className="login-dd__label">{label}</span>
                <span className="login-dd__sub">{sub}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NavBar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <header className="navbar">
      <Container className="navbar__inner">
        <NavLink to="/" className="navbar__brand" aria-label={SITE.firmName} onClick={closeMobile}>
          <img src={logoUrl} alt={`${SITE.firmShort} logo`} />
          <span className="navbar__brand-text">
            <strong>{SITE.firmShort}</strong>
            <span>{SITE.tagline}</span>
          </span>
        </NavLink>

        <nav className="navbar__links" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive ? 'navbar__link is-active' : 'navbar__link'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="navbar__cta">
          <LoginDropdown />
          <button
            className="navbar__menu-btn"
            type="button"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </Container>

      {mobileOpen && (
        <div className="mobile-menu" role="dialog" aria-label="Mobile navigation">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'is-active' : '')}
              onClick={closeMobile}
            >
              {item.label}
            </NavLink>
          ))}
          <div className="mobile-menu__cta">
            <div className="login-dd__title" style={{ paddingLeft: 0 }}>
              Choose your portal
            </div>
            {PORTAL_OPTIONS.map(({ key, label, sub, href, Icon, iconClass }) => (
              <a
                key={key}
                href={href}
                className="login-dd__item"
                style={{ marginTop: 6 }}
                onClick={closeMobile}
              >
                <span className={`login-dd__icon ${iconClass}`}>
                  <Icon size={18} />
                </span>
                <span style={{ flex: 1 }}>
                  <span className="login-dd__label">{label}</span>
                  <span className="login-dd__sub">{sub}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

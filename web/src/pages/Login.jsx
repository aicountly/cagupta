import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { useMsal } from '@azure/msal-react';
import logoUrl from '../assets/cropped_logo.png';
import { useAuth } from '../auth/AuthContext';
import {
  loginWithGoogle,
  loginWithMicrosoft,
  loginWithPassword,
} from '../services/authService';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const MOCK_GOOGLE_CREDENTIAL =
  'mock-google-credential.' +
  btoa(JSON.stringify({ name: 'Google User', email: 'user@gmail.com' })) +
  '.sig';

function isValidEmail(email) {
  return /^[^\s@]+@[^"]+\.[^\s@]+$/.test(email);
}

export default function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const { instance: msalInstance } = useMsal();

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogleSuccess(credentialResponse) {
    setError('');
    setLoading(true);
    try {
      const { token, user } = await loginWithGoogle(credentialResponse.credential);
      login(token, user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Google login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleMicrosoftLogin() {
    setError('');
    setLoading(true);
    try {
      const response = await msalInstance.loginPopup({
        scopes: ['openid', 'profile', 'email', 'User.Read'],
        prompt: 'select_account',
      });
      const { token, user } = await loginWithMicrosoft(response);
      login(token, user);
      navigate('/', { replace: true });
    } catch (err) {
      if (err?.errorCode === 'user_cancelled' || err?.message?.includes('user_cancelled')) {
        // user closed popup — do nothing
      } else {
        setError(err.message || 'Microsoft login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin(e) {
    e.preventDefault();
    setError('');
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    setLoading(true);
    try {
      const { token, user } = await loginWithPassword(email, password);
      login(token, user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID || 'dev-placeholder'}>
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.logoWrap}>
            <img src={logoUrl} alt="CA Office Portal" style={s.logo} />
          </div>
          <h1 style={s.heading}>Sign in to your account</h1>
          <p style={s.subheading}>CA Rahul Gupta – Office Portal</p>
          <div style={s.socialSection}>
            {GOOGLE_CLIENT_ID ? (
              <div style={s.googleWrap}>
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setError('Google login failed. Please try again.')}
                  width="340"
                  text="continue_with"
                  shape="rectangular"
                  size="large"
                  theme="outline"
                />
              </div>
            ) : (
              <button
                style={{ ...s.socialBtn, opacity: loading ? 0.7 : 1 }}
                onClick={handleGoogleSuccess.bind(null, { credential: MOCK_GOOGLE_CREDENTIAL })}
                disabled={loading}
              >
                <GoogleIcon /> Continue with Google
              </button>
            )}
            <button
              style={{ ...s.socialBtn, opacity: loading ? 0.7 : 1 }}
              onClick={handleMicrosoftLogin}
              disabled={loading}
            >
              <MicrosoftIcon /> Continue with Outlook
            </button>
          </div>
          <div style={s.divider}>
            <div style={s.dividerLine} />
            <span style={s.dividerText}>or</span>
            <div style={s.dividerLine} />
          </div>
          <form onSubmit={handlePasswordLogin} style={s.form} noValidate>
            <label style={s.label} htmlFor="login-email">Official email address</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder="name@company.com"
              style={s.input}
              autoComplete="email"
              disabled={loading}
            />
            <label style={s.label} htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="Enter your password"
              style={s.input}
              autoComplete="current-password"
              disabled={loading}
            />
            <button
              type="submit"
              style={{ ...s.primaryBtn, opacity: loading ? 0.7 : 1 }}
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
          {error && <div style={s.errorBox}>{error}</div>}
          <p style={s.adminNote}>
            Access is provided by admin. Contact support if you need access.
          </p>
        </div>
      </div>
    </GoogleOAuthProvider>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 29.9 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 19.4-7 21.8-16.6L44.5 20z" />
      <path fill="#34A853" d="M6.3 14.7l7 5.1C15.1 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3c-7.7 0-14.3 4.4-17.7 11.7z" />
      <path fill="#FBBC05" d="M24 45c5.8 0 10.7-1.9 14.3-5.2l-6.6-5.4C29.9 36.1 27.1 37 24 37c-5.8 0-10.7-3.8-12.5-9.1l-7 5.4C8 40.1 15.4 45 24 45z" />
      <path fill="#EA4335" d="M44.5 20H24v8.5h11.8c-.9 2.8-2.8 5.1-5.3 6.6l6.6 5.4C41.3 37.1 44.5 31 44.5 24c0-1.3-.2-2.7-.5-4z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

const s = {
  page: {
    minHeight: '100vh',
    background: '#F6F7FB',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif",
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    border: '1px solid #E6E8F0',
    padding: '40px 36px 32px',
    width: '100%',
    maxWidth: 400,
  },
  logoWrap: { display: 'flex', justifyContent: 'center', marginBottom: 24 },
  logo: { maxWidth: 200, height: 'auto', objectFit: 'contain' },
  heading: { fontSize: 22, fontWeight: 700, color: '#0B1F3B', margin: '0 0 4px', textAlign: 'center' },
  subheading: { fontSize: 13, color: '#64748b', textAlign: 'center', margin: '0 0 28px' },
  socialSection: { display: 'flex', flexDirection: 'column', gap: 10 },
  googleWrap: { display: 'flex', justifyContent: 'center' },
  socialBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    width: '100%', padding: '10px 16px', border: '1px solid #E6E8F0', borderRadius: 8,
    background: '#fff', fontSize: 14, fontWeight: 500, color: '#334155',
    cursor: 'pointer', transition: 'background 0.15s',
  },
  divider: { display: 'flex', alignItems: 'center', margin: '22px 0', gap: 10 },
  dividerLine: { flex: 1, height: 1, background: '#E6E8F0' },
  dividerText: { fontSize: 12, color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  label: { fontSize: 13, fontWeight: 600, color: '#334155' },
  input: {
    padding: '10px 12px', border: '1px solid #E6E8F0', borderRadius: 8,
    fontSize: 14, color: '#1e293b', background: '#F6F7FB', outline: 'none',
    width: '100%', boxSizing: 'border-box', fontFamily: 'inherit',
  },
  primaryBtn: {
    padding: '11px 0', background: '#F37920', color: '#fff', border: 'none',
    borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    width: '100%', transition: 'opacity 0.15s', letterSpacing: '0.01em',
  },
  otpInfo: { fontSize: 13, color: '#64748b', background: '#F6F7FB', borderRadius: 8, padding: '8px 12px', lineHeight: 1.5 },
  changeLink: { background: 'none', border: 'none', color: '#F37920', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0, textDecoration: 'underline' },
  resendRow: { display: 'flex', justifyContent: 'center', marginTop: 4 },
  resendTimer: { fontSize: 12, color: '#94a3b8' },
  resendBtn: { background: 'none', border: 'none', color: '#F37920', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' },
  errorBox: {
    marginTop: 12, background: '#FEF2F2', border: '1px solid #fecaca',
    borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c', lineHeight: 1.5,
  },
  adminNote: { marginTop: 20, textAlign: 'center', fontSize: 12, color: '#94a3b8', lineHeight: 1.5 },
};
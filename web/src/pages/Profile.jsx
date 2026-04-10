import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS } from '../constants/roles';
import { updateCurrentUserProfile, changePassword, fetchCurrentUser } from '../services/authService';
import { API_BASE_URL } from '../constants/config';
import { getInitials } from '../utils/getInitials';

const cardStyle = {
  background:   '#fff',
  borderRadius: 14,
  padding:      '24px',
  boxShadow:    '0 1px 4px rgba(0,0,0,0.06)',
  border:       '1px solid #E6E8F0',
  marginBottom: 20,
};
const labelStyle = {
  display:      'block',
  fontSize:     12,
  fontWeight:   600,
  color:        '#475569',
  marginBottom: 6,
};
const inputStyle = {
  width:        '100%',
  maxWidth:     440,
  padding:      '10px 12px',
  borderRadius: 8,
  border:       '1px solid #E6E8F0',
  fontSize:     14,
  outline:      'none',
  boxSizing:    'border-box',
};
const btnPrimary = {
  padding:      '10px 20px',
  borderRadius: 8,
  border:       'none',
  background:   'linear-gradient(135deg, #F37920 0%, #f5a623 100%)',
  color:        '#fff',
  fontWeight:   600,
  fontSize:     14,
  cursor:       'pointer',
};
export default function Profile() {
  const { session, updateSessionUser } = useAuth();
  const user = session?.user;
  const token = session?.token;

  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);

  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passSaving, setPassSaving] = useState(false);
  const [passMsg, setPassMsg] = useState(null);
  const [authFlagsLoaded, setAuthFlagsLoaded] = useState(() => !API_BASE_URL);

  const passwordBlockRef = useRef(null);

  useEffect(() => {
    if (!token || !API_BASE_URL) {
      setAuthFlagsLoaded(true);
      return;
    }
    setAuthFlagsLoaded(false);
    fetchCurrentUser(token)
      .then((u) => {
        if (u) updateSessionUser(u);
      })
      .finally(() => setAuthFlagsLoaded(true));
  }, [token, updateSessionUser]);

  useEffect(() => {
    if (!user) return;
    setName(user.name || '');
    setAvatarUrl(user.avatar_url || '');
  }, [user?.id, user?.name, user?.avatar_url]);

  useEffect(() => {
    if (window.location.hash !== '#password' || !passwordBlockRef.current) return;
    const t = setTimeout(() => {
      passwordBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => clearTimeout(t);
  }, []);

  async function handleSaveProfile(e) {
    e.preventDefault();
    if (!token) return;
    setProfileMsg(null);
    setProfileSaving(true);
    try {
      const updated = await updateCurrentUserProfile(token, {
        name:       name.trim(),
        avatar_url: avatarUrl.trim() || null,
      });
      updateSessionUser(updated);
      setProfileMsg({ type: 'ok', text: 'Profile saved.' });
    } catch (err) {
      setProfileMsg({ type: 'err', text: err.message || 'Could not save profile.' });
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPassMsg(null);
    if (newPass !== confirmPass) {
      setPassMsg({ type: 'err', text: 'New password and confirmation do not match.' });
      return;
    }
    if (!token) return;
    setPassSaving(true);
    try {
      await changePassword(token, { currentPassword: curPass, newPassword: newPass });
      setCurPass('');
      setNewPass('');
      setConfirmPass('');
      setPassMsg({ type: 'ok', text: 'Password updated. Use your new password next time you sign in.' });
    } catch (err) {
      setPassMsg({ type: 'err', text: err.message || 'Could not change password.' });
    } finally {
      setPassSaving(false);
    }
  }

  if (!user) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: '#64748b' }}>You need to be signed in to view your profile.</p>
      </div>
    );
  }

  const canChangePassword = user.can_change_password === true;
  const passwordFlagPending = API_BASE_URL && !authFlagsLoaded;
  const passwordUnknown = API_BASE_URL && authFlagsLoaded && user.can_change_password !== true && user.can_change_password !== false;
  const roleLabel = ROLE_LABELS[user.role] || user.role || 'User';
  const previewInitials = getInitials(name || user.name || '?');
  const previewSrc = (avatarUrl || '').trim() || user.avatar_url;

  return (
    <div style={{ padding: 24, background: '#F6F7FB', minHeight: '100%' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0B1F3B', margin: '0 0 8px' }}>My profile</h1>
      <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px' }}>
        Update how your name appears in the app and optionally set a profile picture URL.
      </p>

      <section style={cardStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>Account details</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          {previewSrc ? (
            <img
              src={previewSrc}
              alt=""
              style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover', border: '1px solid #E6E8F0' }}
              onError={(ev) => { ev.target.style.display = 'none'; }}
            />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #F37920 0%, #f5a623 100%)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {previewInitials}
            </div>
          )}
          <div>
            <div style={{ fontSize: 13, color: '#64748b' }}>Preview</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>{name.trim() || user.name}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{roleLabel}</div>
          </div>
        </div>

        <form onSubmit={handleSaveProfile}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Email</label>
            <input style={{ ...inputStyle, background: '#f8fafc', color: '#64748b' }} value={user.email || ''} readOnly />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Email is managed by an administrator.</div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Display name</label>
            <input
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoComplete="name"
              required
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Avatar image URL (optional)</label>
            <input
              style={inputStyle}
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
              autoComplete="off"
            />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              Use a direct link to an image (https). Leave blank to show initials.
            </div>
          </div>
          {profileMsg && (
            <div
              style={{
                fontSize: 13,
                marginBottom: 12,
                color: profileMsg.type === 'ok' ? '#166534' : '#dc2626',
              }}
            >
              {profileMsg.text}
            </div>
          )}
          <button type="submit" style={btnPrimary} disabled={profileSaving}>
            {profileSaving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </section>

      <section style={cardStyle} ref={passwordBlockRef} id="password">
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>Change password</h2>
        {passwordFlagPending ? (
          <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>Checking account settings…</p>
        ) : passwordUnknown ? (
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
            Could not load sign-in settings. Refresh the page or try again later.
          </p>
        ) : !canChangePassword ? (
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
            Your account uses single sign-on (Google or Microsoft). Password changes are not available here; manage
            security in your provider&apos;s account settings.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
              For accounts that sign in with email and password (after OTP verification).
            </p>
            <form onSubmit={handleChangePassword}>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Current password</label>
                <input
                  style={inputStyle}
                  type="password"
                  value={curPass}
                  onChange={(e) => setCurPass(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>New password</label>
                <input
                  style={inputStyle}
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Confirm new password</label>
                <input
                  style={inputStyle}
                  type="password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              {passMsg && (
                <div
                  style={{
                    fontSize: 13,
                    marginBottom: 12,
                    color: passMsg.type === 'ok' ? '#166534' : '#dc2626',
                  }}
                >
                  {passMsg.text}
                </div>
              )}
              <button type="submit" style={btnPrimary} disabled={passSaving}>
                {passSaving ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

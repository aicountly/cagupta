import { useState } from 'react';
import AffiliateLayout from '../../components/layout/AffiliateLayout';
import { postSubAffiliate } from '../../services/affiliatePortalService';

export default function AffiliateSubAffiliates() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setOk('');
    try {
      await postSubAffiliate({ name, email, password });
      setOk('Registration submitted. An administrator will approve the account.');
      setName(''); setEmail(''); setPassword('');
    } catch (ex) {
      setErr(ex.message || 'Failed');
    }
  }

  return (
    <AffiliateLayout title="Invite sub-affiliate">
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0', maxWidth: 440 }}>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
          Create a pending affiliate account linked to you. They sign in with the email and password you set; staff must approve before they can use the portal.
        </p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input required placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }} />
          <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }} />
          <input required type="password" minLength={8} placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }} />
          <button type="submit" style={{ padding: 12, borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Submit</button>
        </form>
        {ok && <div style={{ color: '#16a34a', marginTop: 12 }}>{ok}</div>}
        {err && <div style={{ color: '#dc2626', marginTop: 12 }}>{err}</div>}
      </div>
    </AffiliateLayout>
  );
}

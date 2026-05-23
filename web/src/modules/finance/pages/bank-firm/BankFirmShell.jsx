import { NavLink, Outlet } from 'react-router-dom';
import { Landmark } from 'lucide-react';
import { getBillingProfiles } from '../../../../constants/billingProfiles';
import DestructiveConfirmModal from '../../../../components/common/DestructiveConfirmModal';
import { useBankFirmWorkspace } from './BankFirmWorkspaceContext';
import {
  headerCard,
  iconWrap,
  inputStyle,
  labelStyle,
  pageWrap,
  sectionCard,
} from './bankFirmStyles';

const BASE = '/finance/bank-reports';

const tabs = [
  { to: `${BASE}/accounts`, label: 'Accounts' },
  { to: `${BASE}/ledger`, label: 'Bank ledger' },
  { to: `${BASE}/transfer`, label: 'Intra Transfer' },
  { to: `${BASE}/inter-transfer`, label: 'Inter Transfer' },
  { to: `${BASE}/expense`, label: 'Firm expense' },
  { to: `${BASE}/inflow`, label: 'Firm inflow' },
  { to: `${BASE}/report`, label: 'Reports' },
];

/** Shell expects `BankFirmWorkspaceProvider` as an ancestor. Renders `<Outlet />` below workspace chrome. */
export default function BankFirmShell() {
  const {
    accounts,
    firmCode,
    setFirmCode,
    msg,
    deleteAccountId,
    deleteAccountBusy,
    confirmRemoveBankAccount,
    closeDeleteModal,
  } = useBankFirmWorkspace();

  const profiles = getBillingProfiles();

  return (
    <div style={pageWrap}>
      {deleteAccountId != null && (
        <DestructiveConfirmModal
          open
          title="Delete bank / cash account?"
          busy={deleteAccountBusy}
          confirmLabel="Delete account"
          onClose={closeDeleteModal}
          onConfirm={confirmRemoveBankAccount}
        >
          <p style={{ margin: '0 0 8px' }}>
            Remove{' '}
            <strong>{accounts.find((a) => a.id === deleteAccountId)?.name ?? 'this account'}</strong>{' '}
            under firm <strong>{firmCode}</strong>?
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
            The server may block deletion while transactions reference this ledger. Any error will appear after you confirm.
          </p>
        </DestructiveConfirmModal>
      )}

      <div style={headerCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={iconWrap}><Landmark size={20} color="var(--portal-primary)" /></div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0B1F3B' }}>Bank & Firm Transactions</h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>
              Manage bank/cash accounts, view ledgers, record transfers, firm expenses and inflows
            </p>
          </div>
        </div>
      </div>

      {msg.text && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            background: msg.type === 'error' ? '#FEE2E2' : msg.type === 'success' ? '#DCFCE7' : '#FEF3C7',
            color: msg.type === 'error' ? '#991B1B' : msg.type === 'success' ? '#166534' : '#92400E',
            border: `1px solid ${msg.type === 'error' ? '#FECACA' : msg.type === 'success' ? '#BBF7D0' : '#FDE68A'}`,
          }}
        >
          {msg.text}
        </div>
      )}

      <div style={{ ...sectionCard, padding: '16px 20px' }}>
        <label style={labelStyle}>BILLING FIRM (WORKSPACE)</label>
        <select style={{ ...inputStyle, maxWidth: 440 }} value={firmCode} onChange={(e) => setFirmCode(e.target.value)}>
          <option value="">— Select billing firm —</option>
          {profiles.map((p) => (
            <option key={p.code} value={p.code}>
              {p.code} – {p.name}
            </option>
          ))}
        </select>
      </div>

      <div
        role="tablist"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          padding: '4px 0',
          borderBottom: '2px solid #E6E8F0',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end
            style={({ isActive }) => ({
              padding: '10px 16px',
              borderRadius: '10px 10px 0 0',
              fontSize: 13,
              fontWeight: 600,
              color: isActive ? 'var(--portal-primary)' : '#64748b',
              textDecoration: 'none',
              borderBottom: isActive ? '3px solid var(--portal-primary)' : '3px solid transparent',
              marginBottom: -2,
            })}
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}

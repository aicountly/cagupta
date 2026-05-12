import { Plus, Trash2 } from 'lucide-react';
import { useBankFirmWorkspace } from './BankFirmWorkspaceContext';
import {
  badge,
  btnDanger,
  btnPrimary,
  inputStyle,
  labelStyle,
  sectionCard,
  sectionHeader,
  sectionTitle,
  tableStyle,
  tdStyle,
  thStyle,
} from './bankFirmStyles';

export default function BankFirmAccountsPage() {
  const {
    canSettings,
    firmCode,
    accounts,
    loading,
    newName,
    setNewName,
    newType,
    setNewType,
    newOpen,
    setNewOpen,
    newOpenDate,
    setNewOpenDate,
    addAccount,
    promptRemoveAccount,
  } = useBankFirmWorkspace();

  return (
    <div style={sectionCard}>
      <div style={sectionHeader}>
        <span style={sectionTitle}>Firm accounts</span>
      </div>
      <div style={{ padding: 20 }}>
        {!firmCode && (
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Select a billing firm above to load accounts.</div>
        )}
        {loading && <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading accounts...</div>}
        {firmCode && accounts.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Account name</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Opening balance</th>
                  {canSettings && <th style={thStyle}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td style={tdStyle}>
                      <strong>{a.name}</strong>
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          ...badge,
                          background: a.accountType === 'bank' ? '#DBEAFE' : '#F3E8FF',
                          color: a.accountType === 'bank' ? '#1E40AF' : '#7C3AED',
                        }}
                      >
                        {a.accountType}
                      </span>
                    </td>
                    <td style={tdStyle}>₹{Number(a.openingBalance || 0).toLocaleString('en-IN')}</td>
                    {canSettings && (
                      <td style={tdStyle}>
                        <button type="button" onClick={() => promptRemoveAccount(a.id)} style={btnDanger} title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {firmCode && accounts.length === 0 && !loading && (
          <div style={{ fontSize: 13, color: '#94a3b8' }}>No accounts found for this firm.</div>
        )}
        {canSettings && firmCode && (
          <form
            onSubmit={addAccount}
            style={{
              marginTop: 20,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 12,
              alignItems: 'end',
              paddingTop: 16,
              borderTop: '1px solid #F1F5F9',
            }}
          >
            <div>
              <label style={labelStyle}>Account name</label>
              <input style={inputStyle} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. HDFC Current" />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select style={inputStyle} value={newType} onChange={(e) => setNewType(e.target.value)}>
                <option value="bank">Bank</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Opening balance</label>
              <input style={inputStyle} type="number" value={newOpen} onChange={(e) => setNewOpen(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>OB date</label>
              <input style={inputStyle} type="date" value={newOpenDate} onChange={(e) => setNewOpenDate(e.target.value)} />
            </div>
            <button type="submit" style={btnPrimary}>
              <Plus size={14} /> Add account
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

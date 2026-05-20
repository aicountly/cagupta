import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useBankFirmWorkspace } from './BankFirmWorkspaceContext';
import {
  badge,
  btnDanger,
  btnPrimary,
  btnSecondary,
  inputStyle,
  labelStyle,
  sectionCard,
  sectionHeader,
  sectionTitle,
  tableStyle,
  tdStyle,
  thStyle,
} from './bankFirmStyles';

const btnEdit = {
  ...btnSecondary,
  padding: '6px 10px',
  display: 'inline-flex',
  alignItems: 'center',
};

export default function BankFirmAccountsPage() {
  const {
    canSettings,
    canEditOpeningBalance,
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
    editAccountId,
    editOpen,
    setEditOpen,
    editOpenDate,
    setEditOpenDate,
    editAccountBusy,
    promptEditOpeningBalance,
    closeEditOpeningBalanceModal,
    saveEditOpeningBalance,
  } = useBankFirmWorkspace();

  const editingAccount = editAccountId != null ? accounts.find((a) => a.id === editAccountId) : null;

  return (
    <>
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
                    {(canSettings || canEditOpeningBalance) && <th style={thStyle}>Action</th>}
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
                      <td style={tdStyle}>
                        ₹{Number(a.openingBalance || 0).toLocaleString('en-IN')}
                        {a.openingBalanceDate && (
                          <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                            as of {String(a.openingBalanceDate).slice(0, 10)}
                          </span>
                        )}
                      </td>
                      {(canSettings || canEditOpeningBalance) && (
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {canEditOpeningBalance && (
                              <button
                                type="button"
                                onClick={() => promptEditOpeningBalance(a)}
                                style={btnEdit}
                                title="Edit opening balance"
                              >
                                <Pencil size={13} />
                                <span style={{ marginLeft: 4, fontSize: 12 }}>Edit</span>
                              </button>
                            )}
                            {canSettings && (
                              <button type="button" onClick={() => promptRemoveAccount(a.id)} style={btnDanger} title="Delete">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
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

      {editAccountId != null && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.35)',
            zIndex: 10050,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !editAccountBusy) closeEditOpeningBalanceModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-ob-title"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              width: '100%',
              maxWidth: 420,
              padding: '20px 22px',
            }}
          >
            <h2 id="edit-ob-title" style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#0B1F3B' }}>
              Edit opening balance
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
              {editingAccount?.name ?? 'Account'}
            </p>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={labelStyle}>Opening balance (₹)</label>
                <input
                  style={inputStyle}
                  type="number"
                  step="0.01"
                  value={editOpen}
                  onChange={(e) => setEditOpen(e.target.value)}
                  disabled={editAccountBusy}
                />
              </div>
              <div>
                <label style={labelStyle}>OB date</label>
                <input
                  style={inputStyle}
                  type="date"
                  value={editOpenDate}
                  onChange={(e) => setEditOpenDate(e.target.value)}
                  disabled={editAccountBusy}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button type="button" style={btnSecondary} onClick={closeEditOpeningBalanceModal} disabled={editAccountBusy}>
                Cancel
              </button>
              <button type="button" style={btnPrimary} onClick={saveEditOpeningBalance} disabled={editAccountBusy}>
                {editAccountBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

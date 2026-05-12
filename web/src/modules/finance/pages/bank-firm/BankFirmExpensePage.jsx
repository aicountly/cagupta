import { Receipt } from 'lucide-react';
import { useBankFirmWorkspace } from './BankFirmWorkspaceContext';
import { EXPENSE_CATS } from './bankFirmConstants';
import { btnPrimary, inputStyle, sectionCard, sectionHeader, sectionTitle } from './bankFirmStyles';

export default function BankFirmExpensePage() {
  const {
    firmCode,
    accounts,
    expAcct,
    setExpAcct,
    expCat,
    setExpCat,
    expAmt,
    setExpAmt,
    expDate,
    setExpDate,
    expNote,
    setExpNote,
    submitExp,
  } = useBankFirmWorkspace();

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={sectionCard}>
        <div style={sectionHeader}>
          <Receipt size={15} color="#F37920" style={{ marginRight: 8 }} />
          <span style={sectionTitle}>Firm expense</span>
        </div>
        {!firmCode || accounts.length === 0 ? (
          <div style={{ padding: 20, fontSize: 13, color: '#94a3b8' }}>
            {!firmCode ? 'Select a billing firm above.' : 'No accounts loaded for this firm — add accounts on the Accounts tab.'}
          </div>
        ) : (
          <form onSubmit={submitExp} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select style={inputStyle} value={expAcct} onChange={(e) => setExpAcct(e.target.value)} required>
              <option value="">— Bank / cash —</option>
              {accounts.map((a) => (
                <option key={`e-${a.id}`} value={String(a.id)}>
                  {a.name}
                </option>
              ))}
            </select>
            <select style={inputStyle} value={expCat} onChange={(e) => setExpCat(e.target.value)}>
              {EXPENSE_CATS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              style={inputStyle}
              type="number"
              step="0.01"
              placeholder="Amount (₹)"
              value={expAmt}
              onChange={(e) => setExpAmt(e.target.value)}
              required
            />
            <input style={inputStyle} type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} required />
            <input style={inputStyle} placeholder="Narration" value={expNote} onChange={(e) => setExpNote(e.target.value)} />
            <button type="submit" style={{ ...btnPrimary, background: '#7C3AED' }}>
              Save expense
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

import { ArrowRightLeft } from 'lucide-react';
import { useBankFirmWorkspace } from './BankFirmWorkspaceContext';
import { btnPrimary, inputStyle, sectionCard, sectionHeader, sectionTitle } from './bankFirmStyles';

export default function BankFirmTransferPage() {
  const {
    firmCode,
    accounts,
    xferFrom,
    setXferFrom,
    xferTo,
    setXferTo,
    xferAmt,
    setXferAmt,
    xferDate,
    setXferDate,
    xferNote,
    setXferNote,
    submitXfer,
  } = useBankFirmWorkspace();

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={sectionCard}>
        <div style={sectionHeader}>
          <ArrowRightLeft size={15} color="#F37920" style={{ marginRight: 8 }} />
          <span style={sectionTitle}>Internal transfer (contra)</span>
        </div>
        {!firmCode || accounts.length === 0 ? (
          <div style={{ padding: 20, fontSize: 13, color: '#94a3b8' }}>
            {!firmCode ? 'Select a billing firm above.' : 'No accounts loaded for this firm — add accounts on the Accounts tab.'}
          </div>
        ) : (
          <form onSubmit={submitXfer} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select style={inputStyle} value={xferFrom} onChange={(e) => setXferFrom(e.target.value)} required>
              <option value="">— From account —</option>
              {accounts.map((a) => (
                <option key={`f-${a.id}`} value={String(a.id)}>
                  {a.name}
                </option>
              ))}
            </select>
            <select style={inputStyle} value={xferTo} onChange={(e) => setXferTo(e.target.value)} required>
              <option value="">— To account —</option>
              {accounts.map((a) => (
                <option key={`t-${a.id}`} value={String(a.id)}>
                  {a.name}
                </option>
              ))}
            </select>
            <input
              style={inputStyle}
              type="number"
              step="0.01"
              placeholder="Amount (₹)"
              value={xferAmt}
              onChange={(e) => setXferAmt(e.target.value)}
              required
            />
            <input style={inputStyle} type="date" value={xferDate} onChange={(e) => setXferDate(e.target.value)} required />
            <input style={inputStyle} placeholder="Narration" value={xferNote} onChange={(e) => setXferNote(e.target.value)} />
            <button type="submit" style={btnPrimary}>
              Save transfer
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

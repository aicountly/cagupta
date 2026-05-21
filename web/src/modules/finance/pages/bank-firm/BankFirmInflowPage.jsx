import { ArrowDownToLine } from 'lucide-react';
import { useBankFirmWorkspace } from './BankFirmWorkspaceContext';
import { INFLOW_CATS } from './bankFirmConstants';
import { btnPrimary, inputStyle, sectionCard, sectionHeader, sectionTitle } from './bankFirmStyles';

export default function BankFirmInflowPage() {
  const {
    firmCode,
    accounts,
    infAcct,
    setInfAcct,
    infCat,
    setInfCat,
    infAmt,
    setInfAmt,
    infDate,
    setInfDate,
    infNote,
    setInfNote,
    submitInf,
  } = useBankFirmWorkspace();

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={sectionCard}>
        <div style={sectionHeader}>
          <ArrowDownToLine size={15} color="#059669" style={{ marginRight: 8 }} />
          <span style={sectionTitle}>Firm inflow</span>
        </div>
        {!firmCode || accounts.length === 0 ? (
          <div style={{ padding: 20, fontSize: 13, color: '#94a3b8' }}>
            {!firmCode ? 'Select a billing firm above.' : 'No accounts loaded for this firm — add accounts on the Accounts tab.'}
          </div>
        ) : (
          <form onSubmit={submitInf} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select style={inputStyle} value={infAcct} onChange={(e) => setInfAcct(e.target.value)} required>
              <option value="">— Bank / cash —</option>
              {accounts.map((a) => (
                <option key={`i-${a.id}`} value={String(a.id)}>
                  {a.name}
                </option>
              ))}
            </select>
            <select style={inputStyle} value={infCat} onChange={(e) => setInfCat(e.target.value)}>
              {INFLOW_CATS.map((c) => (
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
              value={infAmt}
              onChange={(e) => setInfAmt(e.target.value)}
              required
            />
            <input style={inputStyle} type="date" value={infDate} onChange={(e) => setInfDate(e.target.value)} required />
            <input style={inputStyle} placeholder="Narration" value={infNote} onChange={(e) => setInfNote(e.target.value)} />
            <button type="submit" style={{ ...btnPrimary, background: '#059669' }}>
              Save inflow
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

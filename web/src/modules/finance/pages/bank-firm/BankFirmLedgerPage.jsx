import { BookOpen } from 'lucide-react';
import { useBankFirmWorkspace } from './BankFirmWorkspaceContext';
import {
  btnPrimary,
  inputStyle,
  sectionCard,
  sectionHeader,
  sectionTitle,
  tableScrollRegion,
  tableStyle,
  tdStyle,
  thStyle,
} from './bankFirmStyles';

export default function BankFirmLedgerPage() {
  const {
    firmCode,
    accounts,
    ledgerAccountId,
    setLedgerAccountId,
    ledgerFrom,
    setLedgerFrom,
    ledgerTo,
    setLedgerTo,
    ledgerRows,
    loadLedger,
  } = useBankFirmWorkspace();

  return (
    <div style={sectionCard}>
      <div style={sectionHeader}>
        <BookOpen size={15} color="#F37920" style={{ marginRight: 8 }} />
        <span style={sectionTitle}>Bank ledger</span>
      </div>
      <div style={{ padding: 20 }}>
        {!firmCode ? (
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Select a billing firm above to choose an account.</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              <select
                style={{ ...inputStyle, flex: 1, minWidth: 200, maxWidth: 360 }}
                value={ledgerAccountId}
                onChange={(e) => setLedgerAccountId(e.target.value)}
              >
                <option value="">— Account —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.name}
                  </option>
                ))}
              </select>
              <input style={{ ...inputStyle, minWidth: 130 }} type="date" value={ledgerFrom} onChange={(e) => setLedgerFrom(e.target.value)} />
              <input style={{ ...inputStyle, minWidth: 130 }} type="date" value={ledgerTo} onChange={(e) => setLedgerTo(e.target.value)} />
              <button type="button" style={btnPrimary} onClick={loadLedger}>
                Load
              </button>
            </div>
            <div style={tableScrollRegion}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Particulars</th>
                    <th style={thStyle}>Movement</th>
                    <th style={thStyle}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>
                        No entries
                      </td>
                    </tr>
                  )}
                  {ledgerRows.map((r, i) => (
                    <tr key={r.id ?? `o-${i}`}>
                      <td style={tdStyle}>{r.txn_date || r.txnDate || '—'}</td>
                      <td style={tdStyle}>{r.narration || r.row_type || ''}</td>
                      <td
                        style={{
                          ...tdStyle,
                          color: r.movement >= 0 ? '#166534' : '#991B1B',
                          fontWeight: 600,
                        }}
                      >
                        {r.movement != null ? `₹${Number(r.movement).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        {r.balance != null ? `₹${Number(r.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

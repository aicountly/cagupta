import { useBankFirmWorkspace } from './BankFirmWorkspaceContext';
import {
  badge,
  btnSecondary,
  inputStyle,
  sectionCard,
  sectionHeader,
  sectionTitle,
  tableScrollRegion,
  tableStyle,
  tdStyle,
  thStyle,
} from './bankFirmStyles';

export default function BankFirmReportPage() {
  const { reportKind, setReportKind, reportRows, loadReport } = useBankFirmWorkspace();

  return (
    <div style={sectionCard}>
      <div style={sectionHeader}>
        <span style={sectionTitle}>Contra & expenses report</span>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <select style={{ ...inputStyle, maxWidth: 240 }} value={reportKind} onChange={(e) => setReportKind(e.target.value)}>
            <option value="all">All transactions</option>
            <option value="contra">Contra only</option>
            <option value="expense">Expenses only</option>
          </select>
          <button type="button" style={btnSecondary} onClick={loadReport}>
            Refresh
          </button>
        </div>
        <div style={tableScrollRegion}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Debit</th>
                <th style={thStyle}>Credit</th>
                <th style={thStyle}>Narration</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>
                    No transactions
                  </td>
                </tr>
              )}
              {reportRows.map((r) => (
                <tr key={r.id}>
                  <td style={tdStyle}>{r.txnDate}</td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        ...badge,
                        background: r.txnType === 'contra' ? '#DBEAFE' : '#FEE2E2',
                        color: r.txnType === 'contra' ? '#1E40AF' : '#991B1B',
                      }}
                    >
                      {r.txnType}
                    </span>
                  </td>
                  <td style={tdStyle}>{r.debit ? `₹${Number(r.debit).toLocaleString('en-IN')}` : '—'}</td>
                  <td style={tdStyle}>{r.credit ? `₹${Number(r.credit).toLocaleString('en-IN')}` : '—'}</td>
                  <td style={tdStyle}>{r.narration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

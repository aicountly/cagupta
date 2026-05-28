import { ArrowRightLeft } from 'lucide-react';
import { getBillingProfiles } from '../../../../constants/billingProfiles';
import { useBankFirmWorkspace } from './BankFirmWorkspaceContext';
import { btnPrimary, inputStyle, labelStyle, sectionCard, sectionHeader, sectionTitle } from './bankFirmStyles';

function accountLabel(a) {
  const type = a.accountType || a.account_type || '';
  return type ? `${a.name} (${type})` : a.name;
}

export default function BankFirmInterTransferPage() {
  const {
    interFromFirm,
    setInterFromFirm,
    interToFirm,
    setInterToFirm,
    interFromAccounts,
    interToAccounts,
    interFromAcct,
    setInterFromAcct,
    interToAcct,
    setInterToAcct,
    interAmt,
    setInterAmt,
    interDate,
    setInterDate,
    interNote,
    setInterNote,
    submitInterXfer,
    xferSubmitting,
  } = useBankFirmWorkspace();

  const profiles = getBillingProfiles();
  const sameFirm = interFromFirm && interToFirm && interFromFirm === interToFirm;
  const canSubmit =
    interFromFirm &&
    interToFirm &&
    interFromFirm !== interToFirm &&
    interFromAcct &&
    interToAcct &&
    interFromAcct !== interToAcct &&
    parseFloat(interAmt) > 0;

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={sectionCard}>
        <div style={sectionHeader}>
          <ArrowRightLeft size={15} color="var(--portal-primary)" style={{ marginRight: 8 }} />
          <span style={sectionTitle}>Inter Transfer</span>
        </div>
        <p style={{ margin: '0 0 0', padding: '0 20px 12px', fontSize: 12, color: '#64748b' }}>
          Move funds between accounts in different billing firms.
        </p>
        <form onSubmit={submitInterXfer} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={labelStyle}>FROM BILLING FIRM</label>
          <select style={inputStyle} value={interFromFirm} onChange={(e) => setInterFromFirm(e.target.value)} required>
            <option value="">— From billing firm —</option>
            {profiles.map((p) => (
              <option key={`ff-${p.code}`} value={p.code}>
                {p.code} – {p.name}
              </option>
            ))}
          </select>
          <select
            style={inputStyle}
            value={interFromAcct}
            onChange={(e) => setInterFromAcct(e.target.value)}
            required
            disabled={!interFromFirm || interFromAccounts.length === 0}
          >
            <option value="">— From account —</option>
            {interFromAccounts.map((a) => (
              <option key={`fa-${a.id}`} value={String(a.id)}>
                {accountLabel(a)}
              </option>
            ))}
          </select>

          <label style={{ ...labelStyle, marginTop: 6 }}>TO BILLING FIRM</label>
          <select style={inputStyle} value={interToFirm} onChange={(e) => setInterToFirm(e.target.value)} required>
            <option value="">— To billing firm —</option>
            {profiles.map((p) => (
              <option key={`tf-${p.code}`} value={p.code}>
                {p.code} – {p.name}
              </option>
            ))}
          </select>
          <select
            style={inputStyle}
            value={interToAcct}
            onChange={(e) => setInterToAcct(e.target.value)}
            required
            disabled={!interToFirm || interToAccounts.length === 0}
          >
            <option value="">— To account —</option>
            {interToAccounts.map((a) => (
              <option key={`ta-${a.id}`} value={String(a.id)}>
                {accountLabel(a)}
              </option>
            ))}
          </select>

          {sameFirm && (
            <p style={{ margin: 0, fontSize: 12, color: '#991B1B' }}>
              From and to billing firms must be different for an inter transfer.
            </p>
          )}

          <input
            style={inputStyle}
            type="number"
            step="0.01"
            placeholder="Amount (₹)"
            value={interAmt}
            onChange={(e) => setInterAmt(e.target.value)}
            required
          />
          <input style={inputStyle} type="date" value={interDate} onChange={(e) => setInterDate(e.target.value)} required />
          <input style={inputStyle} placeholder="Narration" value={interNote} onChange={(e) => setInterNote(e.target.value)} />
          <button
            type="submit"
            style={{ ...btnPrimary, opacity: canSubmit && !xferSubmitting ? 1 : 0.6 }}
            disabled={!canSubmit || xferSubmitting}
          >
            {xferSubmitting ? 'Saving…' : 'Save transfer'}
          </button>
        </form>
      </div>
    </div>
  );
}

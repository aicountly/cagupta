const ONE_LAKH = 100000;
export function formatRupeeKpiLakhAbbrev(amount, { abbreviateFrom = ONE_LAKH } = {}) {
    const n = Number(amount);
    if (!Number.isFinite(n)) {
        const s = amount == null ? '' : String(amount);
        return { short: s, full: s, abbreviated: false };
    }
    const fullRupees = (x) => `₹${x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const full = Math.abs(n) >= abbreviateFrom ? fullRupees(n) : `₹${n.toLocaleString('en-IN')}`;
    if (Math.abs(n) < abbreviateFrom) {
        return { short: full, full, abbreviated: false };
    }
    const sign = n < 0 ? '−' : '';
    const lakhs = Math.abs(n) / ONE_LAKH;
    const short = `${sign}₹${lakhs.toFixed(2)} L`;
    return { short, full, abbreviated: true };
}

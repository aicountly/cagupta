export const pageWrap = { padding: 24, display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--portal-bg)', minHeight: '100%' };
export const headerCard = { background: '#fff', padding: '20px 24px', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' };
export const iconWrap = { width: 44, height: 44, borderRadius: 12, background: 'var(--portal-primary-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
export const sectionCard = { background: '#fff', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' };
export const sectionHeader = { display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #F1F5F9', background: '#FAFBFD' };
export const sectionTitle = { fontSize: 14, fontWeight: 700, color: '#0B1F3B' };
export const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' };
export const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E6E8F0', fontSize: 13, color: '#334155', boxSizing: 'border-box', outline: 'none' };
/** Single-row toolbar for ledger filters (overrides full-width inputStyle). */
export const toolbarBarStyle = { display: 'flex', flexWrap: 'nowrap', gap: 8, alignItems: 'center', marginBottom: 14 };
export const toolbarSelectStyle = { ...inputStyle, width: 'auto', flex: '1 1 200px', minWidth: 160, maxWidth: 360 };
export const toolbarDateStyle = { ...inputStyle, width: 'auto', minWidth: 130, maxWidth: 150, flexShrink: 0 };
export const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--portal-primary)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 8px rgba(var(--portal-primary-rgb),0.2)' };
export const btnSecondary = { padding: '9px 18px', borderRadius: 8, border: '1px solid #E6E8F0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
export const btnDanger = { padding: '6px 10px', borderRadius: 6, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' };
export const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
export const thStyle = { textAlign: 'left', padding: '10px 12px', color: '#64748b', fontWeight: 600, fontSize: 11, borderBottom: '1px solid #E6E8F0', textTransform: 'uppercase', letterSpacing: '0.04em', background: '#FAFBFD' };
export const tdStyle = { padding: '10px 12px', color: '#334155', borderBottom: '1px solid #F8FAFC' };
export const badge = { display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, textTransform: 'capitalize' };

/** Scroll region for full-width ledger / report tables */
export const tableScrollRegion = { overflow: 'auto', minHeight: 'min(70vh, 720px)' };

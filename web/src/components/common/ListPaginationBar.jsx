const baseBarStyle = {
  padding: '10px 16px',
  fontSize: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 8,
  background: '#FAFBFD',
};

/** @param {boolean} disabled */
function pageBtn(disabled) {
  return {
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    border: '1px solid #E6E8F0',
    background: disabled ? '#f1f5f9' : '#fff',
    color: disabled ? '#94a3b8' : '#F37920',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

/**
 * @param {object} props
 * @param {'top'|'bottom'} props.placement
 * @param {number} props.total
 * @param {number} props.page
 * @param {number} props.totalPages
 * @param {number} props.perPage
 * @param {boolean} props.loading
 * @param {(fn: (p: number) => number) => void} props.setPage
 * @param {string} props.entityPlural
 */
export default function ListPaginationBar({
  placement,
  total,
  page,
  totalPages,
  perPage,
  loading,
  setPage,
  entityPlural,
}) {
  const barStyle =
    placement === 'top'
      ? { ...baseBarStyle, borderBottom: '1px solid #f1f5f9' }
      : { ...baseBarStyle, borderTop: '1px solid #f1f5f9' };

  const summary =
    total === 0
      ? `No ${entityPlural}`
      : `${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)} of ${total} ${entityPlural}`;

  return (
    <div style={barStyle}>
      <span style={{ color: '#64748b' }}>{summary}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          style={pageBtn(page <= 1)}
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => p - 1)}
        >
          ‹ Prev
        </button>
        <span
          style={{
            fontSize: 12,
            color: '#475569',
            fontWeight: 600,
            minWidth: 80,
            textAlign: 'center',
          }}
        >
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          style={pageBtn(page >= totalPages)}
          disabled={page >= totalPages || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Next ›
        </button>
      </div>
    </div>
  );
}

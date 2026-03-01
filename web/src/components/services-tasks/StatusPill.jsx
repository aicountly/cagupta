const pillStyles = {
  in_progress:  { bg: '#FEF3E8', color: '#C2570A', border: '1px solid #F8CFA0' },
  completed:    { bg: '#EDFBE8', color: '#1F7A17', border: '1px solid #A3E19B' },
  pending_info: { bg: '#FEF3E8', color: '#C2570A', border: '1px solid #F8CFA0' },
  not_started:  { bg: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' },
  review:       { bg: '#EDE9FE', color: '#5B21B6', border: '1px solid #C4B5FD' },
  cancelled:    { bg: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' },
};

const labels = {
  in_progress:  'In Progress',
  completed:    'Completed',
  pending_info: 'Pending Info',
  not_started:  'Not Started',
  review:       'Review',
  cancelled:    'Cancelled',
};

export default function StatusPill({ status }) {
  const s = pillStyles[status] || { bg: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' };
  const label = labels[status] || (status?.replace(/_/g, ' ') || '');
  return (
    <span style={{
      background: s.bg,
      color: s.color,
      border: s.border,
      padding: '3px 10px',
      borderRadius: 9999,
      fontSize: 12,
      fontWeight: 600,
      whiteSpace: 'nowrap',
      display: 'inline-block',
      letterSpacing: '0.01em',
    }}>
      {label}
    </span>
  );
}

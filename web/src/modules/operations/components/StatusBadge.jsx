const statusColors = {
  // services / tasks
  not_started:     { bg: '#f1f5f9', color: '#64748b' },
  in_progress:     { bg: '#FEF0E6', color: '#C25A0A' },
  pending_info:    { bg: '#FEF0E6', color: '#F37920' },
  pending:         { bg: '#FEF0E6', color: '#F37920' },
  review:          { bg: '#ede9fe', color: '#5b21b6' },
  completed:       { bg: '#E8F7E6', color: '#2E8A25' },
  done:            { bg: '#E8F7E6', color: '#2E8A25' },
  cancelled:       { bg: '#fee2e2', color: '#991b1b' },
  blocked:         { bg: '#fee2e2', color: '#991b1b' },
  // invoices
  draft:           { bg: '#f1f5f9', color: '#64748b' },
  sent:            { bg: '#dbeafe', color: '#1d4ed8' },
  partially_paid:  { bg: '#FEF0E6', color: '#F37920' },
  paid:            { bg: '#E8F7E6', color: '#2E8A25' },
  overdue:         { bg: '#fee2e2', color: '#991b1b' },
  // clients
  active:          { bg: '#E8F7E6', color: '#2E8A25' },
  inactive:        { bg: '#fee2e2', color: '#991b1b' },
  prospect:        { bg: '#dbeafe', color: '#1d4ed8' },
  // appointments
  scheduled:       { bg: '#dbeafe', color: '#1d4ed8' },
  confirmed:       { bg: '#E8F7E6', color: '#2E8A25' },
  // leads
  new:             { bg: '#f1f5f9', color: '#64748b' },
  contacted:       { bg: '#dbeafe', color: '#1d4ed8' },
  qualified:       { bg: '#ede9fe', color: '#5b21b6' },
  proposal_sent:   { bg: '#FEF0E6', color: '#F37920' },
  won:             { bg: '#E8F7E6', color: '#2E8A25' },
  lost:            { bg: '#fee2e2', color: '#991b1b' },
};

export default function StatusBadge({ status }) {
  const s = statusColors[status] || { bg: '#f1f5f9', color: '#475569' };
  const label = status?.replace(/_/g, ' ') ?? '';
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, textTransform: 'capitalize', whiteSpace: 'nowrap', letterSpacing: '0.02em', display: 'inline-block' }}>
      {label}
    </span>
  );
}

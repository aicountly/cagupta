import { useState } from 'react';
import { mockServices } from '../data/mockData';
import KpiCards from '../components/services-tasks/KpiCards';
import ServicesTable from '../components/services-tasks/ServicesTable';
import { ChevronDown } from 'lucide-react';

export default function Services() {
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredServices = filterStatus === 'all'
    ? mockServices
    : mockServices.filter(s => s.status === filterStatus);

  return (
    <div style={pageWrap}>
      {/* Page title */}
      <div style={pageTitle}>Services &amp; Tasks</div>

      {/* Top action row */}
      <div style={actionRow}>
        <StatusDropdown value={filterStatus} onChange={setFilterStatus} />
        <NewEngagementBtn />
      </div>

      {/* KPI cards */}
      <KpiCards />

      {/* Client section card */}
      <div style={sectionCard}>
        <div style={sectionHeading}>Client</div>
        <div style={actionRowInner}>
          <StatusDropdown value={filterStatus} onChange={setFilterStatus} />
          <NewEngagementBtn />
        </div>
        <ServicesTable services={filteredServices} />
      </div>
    </div>
  );
}

function StatusDropdown({ value, onChange }) {
  return (
    <div style={dropdownWrap}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={selectStyle}
      >
        <option value="all">All Statuses</option>
        <option value="in_progress">In Progress</option>
        <option value="completed">Completed</option>
        <option value="not_started">Not Started</option>
        <option value="pending_info">Pending Info</option>
        <option value="review">Review</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <ChevronDown size={14} style={chevronStyle} />
    </div>
  );
}

function NewEngagementBtn() {
  const [hover, setHover] = useState(false);
  return (
    <button
      style={{ ...btnPrimary, background: hover ? '#D96910' : '#F37920' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      + New Service Engagement
    </button>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const pageWrap = {
  padding: '28px 28px',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  background: '#F8FAFC',
  minHeight: '100%',
};

const pageTitle = {
  fontSize: 24,
  fontWeight: 700,
  color: '#111827',
  lineHeight: 1.2,
};

const actionRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  background: '#fff',
  padding: '14px 18px',
  borderRadius: 14,
  border: '1px solid #E5E7EB',
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
};

const actionRowInner = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '0 0 16px 0',
};

const dropdownWrap = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
};

const selectStyle = {
  appearance: 'none',
  WebkitAppearance: 'none',
  padding: '8px 36px 8px 14px',
  border: '1px solid #E5E7EB',
  borderRadius: 9999,
  fontSize: 13,
  fontWeight: 500,
  background: '#fff',
  color: '#374151',
  outline: 'none',
  cursor: 'pointer',
};

const chevronStyle = {
  position: 'absolute',
  right: 12,
  color: '#6B7280',
  pointerEvents: 'none',
};

const btnPrimary = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 18px',
  color: '#fff',
  border: 'none',
  borderRadius: 9999,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  transition: 'background 0.15s',
  boxShadow: '0 2px 8px rgba(243,121,32,0.28)',
};

const sectionCard = {
  background: '#fff',
  borderRadius: 14,
  border: '1px solid #E5E7EB',
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  padding: '20px 20px 0',
  overflow: 'hidden',
};

const sectionHeading = {
  fontSize: 16,
  fontWeight: 700,
  color: '#111827',
  marginBottom: 16,
};

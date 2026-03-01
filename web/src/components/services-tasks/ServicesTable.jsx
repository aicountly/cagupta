import { useState } from 'react';
import { Pencil } from 'lucide-react';
import StatusPill from './StatusPill';

const COLUMNS = ['Client', 'Service', 'FY', 'Assigned To', 'Due Date', 'Fee', 'Status'];

export default function ServicesTable({ services }) {
  const [hoverRow, setHoverRow] = useState(null);

  return (
    <div style={tableCard}>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {COLUMNS.map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {services.map(s => {
              const isHover = hoverRow === s.id;
              return (
                <tr
                  key={s.id}
                  style={{ background: isHover ? '#FFF9F5' : '#fff', transition: 'background 0.12s', cursor: 'default' }}
                  onMouseEnter={() => setHoverRow(s.id)}
                  onMouseLeave={() => setHoverRow(null)}
                >
                  <td style={{ ...tdStyle, fontWeight: 600, color: '#111827' }}>{s.clientName}</td>
                  <td style={tdStyle}>{s.type}</td>
                  <td style={{ ...tdStyle, color: '#6B7280' }}>{s.financialYear}</td>
                  <td style={tdStyle}>{s.assignedTo}</td>
                  <td style={tdStyle}>{s.dueDate}</td>
                  <td style={{ ...tdStyle, fontWeight: 500, color: '#111827' }}>
                    ₹{s.feeAgreed?.toLocaleString('en-IN')}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StatusPill status={s.status} />
                      <EditBtn />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditBtn() {
  const [hover, setHover] = useState(false);
  return (
    <button
      style={{
        width: 28, height: 28,
        border: '1px solid ' + (hover ? '#F8CFA0' : '#E5E7EB'),
        borderRadius: 7,
        background: hover ? '#FEF3E8' : '#F9FAFB',
        color: hover ? '#F37920' : '#9CA3AF',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.15s', padding: 0, flexShrink: 0,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Edit"
    >
      <Pencil size={13} />
    </button>
  );
}

const tableCard = {
  background: '#fff',
  borderRadius: 14,
  border: '1px solid #E5E7EB',
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  overflow: 'hidden',
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
};

const thStyle = {
  textAlign: 'left',
  padding: '12px 16px',
  color: '#6B7280',
  fontWeight: 500,
  fontSize: 13,
  borderBottom: '1px solid #E5E7EB',
  background: '#fff',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '14px 16px',
  color: '#374151',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid #F3F4F6',
};

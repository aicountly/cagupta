import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOrganizations } from '../data/organizationStore';
import StatusBadge from '../components/common/StatusBadge';

export default function Organizations() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const orgs = getOrganizations();
  const filtered = orgs.filter(o => {
    const matchSearch =
      o.displayName.toLowerCase().includes(search.toLowerCase()) ||
      o.pan?.includes(search.toUpperCase()) ||
      o.gstin?.includes(search.toUpperCase()) ||
      o.clientCode.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || o.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div style={{ padding: 24, background: '#F6F7FB', minHeight: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <input
          placeholder="🔍 Search organization by name, GSTIN, PAN, code…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={inputStyle}
        />
        <select value={filter} onChange={e => setFilter(e.target.value)} style={selectStyle}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="prospect">Prospect</option>
        </select>
        <button style={btnPrimary} onClick={() => navigate('/clients/organizations/new')}>➕ Add Organization</button>
      </div>

      {/* Table */}
      <div style={cardStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {['Code', 'Name', 'Constitution', 'PAN', 'GSTIN', 'Primary Contact', 'Manager', 'City', 'Status', 'Actions'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id} style={trStyle}>
                <td style={tdStyle}>
                  <code style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{o.clientCode}</code>
                </td>
                <td style={{ ...tdStyle, fontWeight: 600, color: '#F37920' }}>{o.displayName}</td>
                <td style={tdStyle}>{o.constitution}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{o.pan || '—'}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>{o.gstin || '—'}</td>
                <td style={tdStyle}>{o.primaryContact || '—'}</td>
                <td style={tdStyle}>{o.assignedManager}</td>
                <td style={tdStyle}>{o.city}</td>
                <td style={tdStyle}><StatusBadge status={o.status} /></td>
                <td style={tdStyle}>
                  <button style={iconBtn} title="View">👁️</button>
                  <button style={iconBtn} title="Edit">✏️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '12px 16px', fontSize: 12, color: '#64748b', borderTop: '1px solid #f1f5f9' }}>
          Showing {filtered.length} of {orgs.length} organizations
        </div>
      </div>
    </div>
  );
}

const cardStyle = { background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.06)', border: '1px solid #E6E8F0', overflow: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = { textAlign: 'left', padding: '10px 12px', color: '#64748b', fontWeight: 600, fontSize: 11, borderBottom: '1px solid #F0F2F8', whiteSpace: 'nowrap', background: '#F8FAFC', textTransform: 'uppercase', letterSpacing: '0.04em' };
const tdStyle = { padding: '10px 12px', color: '#334155', verticalAlign: 'middle', whiteSpace: 'nowrap', borderBottom: '1px solid #F6F7FB' };
const trStyle = { cursor: 'default', transition: 'background 0.1s' };
const inputStyle = { flex: 1, padding: '8px 12px', border: '1px solid #E6E8F0', borderRadius: 8, fontSize: 13, outline: 'none', background: '#F6F7FB' };
const selectStyle = { padding: '8px 12px', border: '1px solid #E6E8F0', borderRadius: 8, fontSize: 13, background: '#fff' };
const btnPrimary = { padding: '8px 16px', background: '#F37920', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: '2px 4px' };

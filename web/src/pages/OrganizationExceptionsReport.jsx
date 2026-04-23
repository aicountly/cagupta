import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getOrganizationExceptions } from '../services/reportService';

const CRITERIA = [
  { key: 'gstin', label: 'GST number' },
  { key: 'pan', label: 'PAN' },
  { key: 'cin', label: 'CIN' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Website' },
];

const FIELD_BADGE = {
  gstin: 'GSTIN',
  pan: 'PAN',
  cin: 'CIN',
  email: 'Email',
  website: 'Website',
};

export default function OrganizationExceptionsReport() {
  const { hasPermission } = useAuth();
  const canView = hasPermission('clients.view');

  const [selected, setSelected] = useState(() => new Set(['gstin', 'pan', 'email']));
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 25;
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, last_page: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!canView) return;
    const keys = [...selected];
    if (keys.length === 0) {
      setRows([]);
      setPagination({ total: 0, last_page: 1 });
      setError('Select at least one criterion.');
      return;
    }
    setLoading(true);
    setError('');
    getOrganizationExceptions({ missingKeys: keys, page, perPage, includeInactive })
      .then(({ rows: r, pagination: p }) => {
        setRows(r);
        setPagination({
          total: p.total ?? 0,
          last_page: p.last_page ?? 1,
        });
      })
      .catch((e) => {
        setError(e.message || 'Failed to load report.');
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [canView, selected, page, perPage, includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleCriterion(key) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setPage(1);
  }

  if (!canView) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: '#64748b' }}>You do not have permission to view this report.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1280 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0B1F3B', marginBottom: 8 }}>Organization data exceptions</h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, maxWidth: 720 }}>
        Lists active organizations where <strong>any</strong> selected field is empty. Use this as a work queue for
        completing GSTIN, PAN, CIN, email, and website. Rows link to the organization edit screen.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', marginBottom: 20 }}>
        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>Missing (any of)</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {CRITERIA.map(({ key, label }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#334155', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selected.has(key)}
                  onChange={() => toggleCriterion(key)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => {
              setIncludeInactive(e.target.checked);
              setPage(1);
            }}
          />
          Include inactive
        </label>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              {['Organization', 'Group', 'GSTIN', 'PAN', 'CIN', 'Email', 'Website', 'Missing', 'Edit'].map((h) => (
                <th key={h} style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600, fontSize: 12, borderBottom: '2px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No matching organizations.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                    <Link to={`/clients/organizations/${r.id}/edit`} style={{ color: '#0B1F3B', textDecoration: 'none' }}>
                      {r.name}
                    </Link>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#64748b' }}>{r.groupName || '—'}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>{r.gstin || '—'}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>{r.pan || '—'}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>{r.cin || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{r.email || '—'}</td>
                  <td style={{ padding: '10px 12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.website || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(r.missingFields || []).map((f) => (
                        <span
                          key={f}
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: '#fef3c7',
                            color: '#92400e',
                          }}
                        >
                          {FIELD_BADGE[f] || f}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <Link
                      to={`/clients/organizations/${r.id}/edit`}
                      style={{ fontSize: 12, fontWeight: 600, color: '#F37920' }}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination.last_page > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, fontSize: 13, color: '#64748b' }}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: page <= 1 ? '#f8fafc' : '#fff',
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
            }}
          >
            Previous
          </button>
          <span>
            Page {page} of {pagination.last_page} ({pagination.total} total)
          </span>
          <button
            type="button"
            disabled={page >= pagination.last_page}
            onClick={() => setPage((p) => p + 1)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: page >= pagination.last_page ? '#f8fafc' : '#fff',
              cursor: page >= pagination.last_page ? 'not-allowed' : 'pointer',
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

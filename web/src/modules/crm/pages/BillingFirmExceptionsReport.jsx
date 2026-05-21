import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext';
import { getContactExceptions, getOrganizationExceptions } from '../../../services/reportService';

const MISSING_KEY = 'default_billing_profile';

function Pagination({ page, lastPage, total, onPageChange }) {
  if (lastPage <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, fontSize: 13, color: '#64748b' }}>
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
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
        Page {page} of {lastPage} ({total} total)
      </span>
      <button
        type="button"
        disabled={page >= lastPage}
        onClick={() => onPageChange(page + 1)}
        style={{
          padding: '6px 12px',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          background: page >= lastPage ? '#f8fafc' : '#fff',
          cursor: page >= lastPage ? 'not-allowed' : 'pointer',
        }}
      >
        Next
      </button>
    </div>
  );
}

export default function BillingFirmExceptionsReport() {
  const { hasPermission } = useAuth();
  const canView = hasPermission('clients.view');

  const perPage = 25;
  const [includeInactive, setIncludeInactive] = useState(false);
  const [contactPage, setContactPage] = useState(1);
  const [orgPage, setOrgPage] = useState(1);
  const [contacts, setContacts] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [contactPagination, setContactPagination] = useState({ total: 0, last_page: 1 });
  const [orgPagination, setOrgPagination] = useState({ total: 0, last_page: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!canView) return;
    setLoading(true);
    setError('');
    Promise.all([
      getContactExceptions({
        missingKeys: [MISSING_KEY],
        page: contactPage,
        perPage,
        includeInactive,
      }),
      getOrganizationExceptions({
        missingKeys: [MISSING_KEY],
        page: orgPage,
        perPage,
        includeInactive,
      }),
    ])
      .then(([contactRes, orgRes]) => {
        setContacts(contactRes.rows);
        setContactPagination({
          total: contactRes.pagination?.total ?? 0,
          last_page: contactRes.pagination?.last_page ?? 1,
        });
        setOrgs(orgRes.rows);
        setOrgPagination({
          total: orgRes.pagination?.total ?? 0,
          last_page: orgRes.pagination?.last_page ?? 1,
        });
      })
      .catch((e) => {
        setError(e.message || 'Failed to load report.');
        setContacts([]);
        setOrgs([]);
      })
      .finally(() => setLoading(false));
  }, [canView, contactPage, orgPage, perPage, includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canView) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: '#64748b' }}>You do not have permission to view this report.</p>
      </div>
    );
  }

  const totalExceptions = (contactPagination.total || 0) + (orgPagination.total || 0);

  return (
    <div style={{ padding: 24, maxWidth: 1280 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0B1F3B', marginBottom: 8 }}>
        Default billing firm exceptions
      </h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, maxWidth: 720 }}>
        Active client masters (contacts and organizations) with no default billing firm set. Set a default on
        the master record to pre-fill Raise Invoice; optional, but this report helps you find records that still
        need one.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 20 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => {
              setIncludeInactive(e.target.checked);
              setContactPage(1);
              setOrgPage(1);
            }}
          />
          Include inactive
        </label>
        {!loading && (
          <span style={{ fontSize: 13, fontWeight: 600, color: totalExceptions > 0 ? '#b45309' : '#16a34a' }}>
            {totalExceptions === 0
              ? 'No exceptions — all listed masters have a default billing firm (or none match filters).'
              : `${totalExceptions} master${totalExceptions === 1 ? '' : 's'} without default billing firm`}
          </span>
        )}
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
          Contacts ({contactPagination.total ?? 0})
        </h2>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                {['Contact', 'Group', 'Status', 'Edit'].map((h) => (
                  <th
                    key={h}
                    style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600, fontSize: 12, borderBottom: '2px solid #e2e8f0' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                    No contacts without a default billing firm.
                  </td>
                </tr>
              ) : (
                contacts.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                      <Link to={`/clients/contacts/${r.id}/edit`} style={{ color: '#0B1F3B', textDecoration: 'none' }}>
                        {r.displayName}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{r.groupName || '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{r.contactStatus || '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <Link to={`/clients/contacts/${r.id}/edit`} style={{ fontSize: 12, fontWeight: 600, color: '#F37920' }}>
                        Set default
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={contactPage}
          lastPage={contactPagination.last_page}
          total={contactPagination.total}
          onPageChange={setContactPage}
        />
      </section>

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
          Organizations ({orgPagination.total ?? 0})
        </h2>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                {['Organization', 'Group', 'Edit'].map((h) => (
                  <th
                    key={h}
                    style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600, fontSize: 12, borderBottom: '2px solid #e2e8f0' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</td>
                </tr>
              ) : orgs.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                    No organizations without a default billing firm.
                  </td>
                </tr>
              ) : (
                orgs.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                      <Link to={`/clients/organizations/${r.id}/edit`} style={{ color: '#0B1F3B', textDecoration: 'none' }}>
                        {r.name}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{r.groupName || '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <Link to={`/clients/organizations/${r.id}/edit`} style={{ fontSize: 12, fontWeight: 600, color: '#F37920' }}>
                        Set default
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={orgPage}
          lastPage={orgPagination.last_page}
          total={orgPagination.total}
          onPageChange={setOrgPage}
        />
      </section>
    </div>
  );
}

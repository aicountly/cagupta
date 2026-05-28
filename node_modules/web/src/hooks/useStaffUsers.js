import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { API_BASE_URL, SUPER_ADMIN_EMAIL } from '../constants/config';

// ── Default fallback list used in mock / demo mode ────────────────────────────
const DEFAULT_STAFF = [
  { id: 'default-1', name: 'CA Rahul Gupta' },
  { id: 'default-2', name: 'CA Priya Sharma' },
  { id: 'default-3', name: 'Staff A' },
  { id: 'default-4', name: 'Staff B' },
  { id: 'default-5', name: 'Staff C' },
];

function getMockStaff(sessionUser) {
  const superAdminName = sessionUser?.name || SUPER_ADMIN_EMAIL.split('@')[0];
  return [{ id: 'super-admin', name: superAdminName }, ...DEFAULT_STAFF.slice(1)];
}

/**
 * Returns a list of staff/manager users.
 *
 * When a live API is configured (`VITE_API_BASE_URL`) and the current user is
 * authenticated, the hook fetches active users from `GET /admin/users`.
 *
 * In mock / demo mode (no `API_BASE_URL` or no auth token) it falls back to
 * `DEFAULT_STAFF` so the dropdowns remain functional.
 *
 * @returns {{ staffUsers: Array<{id: string|number, name: string}>, loading: boolean }}
 */
export function useStaffUsers() {
  const { session } = useAuth();
  const token = session?.token;
  const sessionUser = session?.user;

  const [staffUsers, setStaffUsers] = useState(() =>
    (!API_BASE_URL || !token) ? getMockStaff(sessionUser) : []
  );
  const [loading, setLoading] = useState(() => Boolean(API_BASE_URL && token));

  useEffect(() => {
    if (!API_BASE_URL || !token) {
      return;
    }

    let cancelled = false;

    fetch(`${API_BASE_URL}/admin/users?status=active&per_page=100`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
      .then(res => res.json().catch(() => ({})))
      .then(json => {
        if (cancelled) return;
      const users = (json.data || [])
        .filter(u => u.name)
        .map(u => ({ id: u.id, name: u.name }));
        setStaffUsers(users.length > 0 ? users : DEFAULT_STAFF);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setStaffUsers(DEFAULT_STAFF);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [token]);

  return { staffUsers, loading };
}

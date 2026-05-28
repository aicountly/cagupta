import { useMemo } from 'react';
import { SUPER_ADMIN_EMAIL } from '../constants/config';

/**
 * Dropdown options for scoping services/tasks/timesheets to a team member.
 *
 * @param {{ staffUsers: Array<{ id: number|string, name?: string }>, userEmail?: string, canViewTeam?: boolean }} opts
 */
export function useTeamScopeOptions({ staffUsers = [], userEmail = '', canViewTeam = false }) {
  const isPrimarySuperAdmin = String(userEmail || '').toLowerCase() === String(SUPER_ADMIN_EMAIL).toLowerCase();
  const showScopeDropdown = canViewTeam || isPrimarySuperAdmin;

  const selectableUsers = useMemo(() => (
    staffUsers
      .filter((s) => Number(s.id) > 0)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  ), [staffUsers]);

  const defaultScopeValue = isPrimarySuperAdmin ? '' : '';

  return {
    isPrimarySuperAdmin,
    showScopeDropdown,
    selectableUsers,
    defaultScopeValue,
    defaultOptionLabel: isPrimarySuperAdmin ? 'All Users' : 'My tasks',
    allTeamOptionLabel: 'All team',
    allTeamOptionValue: 'all',
  };
}

/**
 * Map UI scope value to API user_id query param (undefined = omit param).
 * @param {string} scopeUserId
 * @returns {number|string|undefined}
 */
export function scopeUserIdToApiParam(scopeUserId) {
  if (scopeUserId == null || scopeUserId === '') return undefined;
  if (scopeUserId === 'all') return 'all';
  const n = Number(scopeUserId);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Append userId scope to a path search string for KPI drill-down links.
 * @param {string} basePath
 * @param {string} scopeUserId
 */
export function appendScopeToPath(basePath, scopeUserId) {
  const param = scopeUserIdToApiParam(scopeUserId);
  if (param == null) return basePath;
  const sep = basePath.includes('?') ? '&' : '?';
  return `${basePath}${sep}userId=${encodeURIComponent(String(param))}`;
}

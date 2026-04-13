import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * Wraps private routes.
 *
 * - Redirects to /login when the user is not authenticated.
 * - Shows a 403 "Access Denied" screen when `requiredPermission` is set
 *   and the current user lacks that permission.
 * - Renders a blank screen while the token validation is in progress.
 *
 * `affiliateOnly` — only users with role affiliate.
 * `staffOnly` — blocks affiliate role from staff UI (redirects to /affiliate).
 */
export default function ProtectedRoute({
  children,
  requiredPermission,
  requiredAnyPermissions,
  affiliateOnly,
  staffOnly,
}) {
  const { isAuthenticated, loading, hasPermission, hasAnyPermission, user } = useAuth();

  // Wait for the token validation round-trip before deciding
  if (loading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const role = user?.role || '';

  if (staffOnly && role === 'affiliate') {
    return <Navigate to="/affiliate" replace />;
  }

  if (affiliateOnly && role !== 'affiliate') {
    return <Navigate to="/" replace />;
  }

  if (requiredAnyPermissions?.length && !hasAnyPermission(requiredAnyPermissions)) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#F6F7FB',
        gap: 16,
      }}>
        <div style={{ fontSize: 64 }}>🚫</div>
        <h1 style={{ margin: 0, color: '#1e293b', fontSize: 28, fontWeight: 700 }}>
          403 — Access Denied
        </h1>
        <p style={{ color: '#64748b', margin: 0 }}>
          You don&apos;t have permission to view this page.
        </p>
      </div>
    );
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#F6F7FB',
        gap: 16,
      }}>
        <div style={{ fontSize: 64 }}>🚫</div>
        <h1 style={{ margin: 0, color: '#1e293b', fontSize: 28, fontWeight: 700 }}>
          403 — Access Denied
        </h1>
        <p style={{ color: '#64748b', margin: 0 }}>
          You don&apos;t have permission to view this page.
        </p>
      </div>
    );
  }

  return children;
}

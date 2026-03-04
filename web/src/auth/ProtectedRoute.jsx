import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * Wraps private routes: redirects to /login when the user is not authenticated.
 * Works correctly on hard refresh because AuthContext reads from localStorage.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

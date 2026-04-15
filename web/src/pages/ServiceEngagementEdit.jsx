import { Navigate, useParams } from 'react-router-dom';

/**
 * Legacy URL: /services/:id/edit → canonical manage hub.
 */
export default function ServiceEngagementEdit() {
  const { id } = useParams();
  if (!id) return <Navigate to="/services" replace />;
  return <Navigate to={`/services/${id}`} replace />;
}

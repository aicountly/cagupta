import { useAuth } from '../../auth/AuthContext';
import ClientLayout from '../../components/layout/ClientLayout';

export default function ClientProfile() {
  const { user } = useAuth();
  return (
    <ClientLayout title="Profile">
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>
        <div style={{ marginBottom: 8 }}><strong>Name:</strong> {user?.name || '-'}</div>
        <div style={{ marginBottom: 8 }}><strong>Role:</strong> {user?.role || '-'}</div>
        <div style={{ marginBottom: 8 }}><strong>Entity type:</strong> {user?.entity_type || '-'}</div>
        <div style={{ marginBottom: 8 }}><strong>Entity id:</strong> {user?.id || '-'}</div>
      </div>
    </ClientLayout>
  );
}

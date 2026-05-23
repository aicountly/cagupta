import { useAuth } from '../../../auth/AuthContext';
import ClientLayout from '../components/ClientLayout';
import PortalThemePicker from '../../../components/settings/PortalThemePicker';

export default function ClientProfile() {
  const { user } = useAuth();
  return (
    <ClientLayout title="Profile">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--portal-border)', padding: 16 }}>
          <div style={{ marginBottom: 8 }}><strong>Name:</strong> {user?.name || '-'}</div>
          <div style={{ marginBottom: 8 }}><strong>Role:</strong> {user?.role || '-'}</div>
          <div style={{ marginBottom: 8 }}><strong>Entity type:</strong> {user?.entity_type || '-'}</div>
          <div style={{ marginBottom: 8 }}><strong>Entity id:</strong> {user?.id || '-'}</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--portal-border)', padding: 24 }}>
          <PortalThemePicker compact />
        </div>
      </div>
    </ClientLayout>
  );
}

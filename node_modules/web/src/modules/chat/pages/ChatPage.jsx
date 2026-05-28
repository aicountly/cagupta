import { Link } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext';
import { ROLES } from '../../../constants/roles';
import { SUPER_ADMIN_EMAIL } from '../../../constants/config';
import BrowserNotificationPrompt from '../../../components/BrowserNotificationPrompt';
import ChatWorkspace from '../components/ChatWorkspace';

export default function ChatPage({ auditPath = '/desk/chat/audit' }) {
  const { session } = useAuth();
  const user = session?.user;
  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN
    || String(user?.email || '').toLowerCase() === String(SUPER_ADMIN_EMAIL).toLowerCase();

  const auditLink = isSuperAdmin ? (
    <Link to={auditPath} style={auditBtn}>Audit log</Link>
  ) : null;

  return (
    <>
      <BrowserNotificationPrompt />
      <ChatWorkspace auditLink={auditLink} />
    </>
  );
}

const auditBtn = {
  display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 8,
  border: '1px solid #E2E8F0', background: '#fff', fontSize: 13, fontWeight: 600,
  color: '#334155', textDecoration: 'none',
};

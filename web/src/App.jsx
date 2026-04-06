import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import ProtectedRoute from './auth/ProtectedRoute';
import LoginPage from './pages/Login';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import ContactCreatePage from './pages/ContactCreatePage';
import Organizations from './pages/Organizations';
import OrganizationCreatePage from './pages/OrganizationCreatePage';
import Services from './pages/Services';
import NewServiceEngagement from './pages/NewServiceEngagement';
import Documents from './pages/Documents';
import Invoices from './pages/Invoices';
import Calendar from './pages/Calendar';
import Credentials from './pages/Credentials';
import Registers from './pages/Registers';
import Leads from './pages/Leads';
import Settings from './pages/Settings';
import UserManagement from './pages/UserManagement';
import ClientGroups from './pages/ClientGroups';

const pageTitles = {
  '/':                          '🏠 Dashboard',
  '/clients/contacts':          '👤 Contacts',
  '/clients/contacts/new':      '➕ Add Contact',
  '/clients/contacts/edit':     '✏️ Edit Contact',
  '/clients/organizations':     '🏢 Organizations',
  '/clients/organizations/new': '🏢 Add Organization',
  '/clients/organizations/edit':'🏢 Edit Organization',
  '/clients/groups':            '🗂️ Groups',
  '/services':                  '📋 Services & Tasks',
  '/services/new':              '➕ New Service Engagement',
  '/documents':                 '📂 Document Management',
  '/invoices':                  '💰 Invoices & Ledger',
  '/calendar':                  '📅 Calendar & Appointments',
  '/credentials':               '🔑 Credentials Vault',
  '/registers':                 '📊 Compliance Registers',
  '/leads':                     '🎯 Leads & Quotations',
  '/settings':                  '⚙️ Settings',
  '/admin/users':               '👥 User Management',
};

function Layout({ routePath, children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F6F7FB', overflow: 'hidden' }}>
        <TopBar title={pageTitles[routePath] || 'CA Office Portal'} />
        <main style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><Layout routePath="/"><Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/clients" element={<ProtectedRoute><Navigate to="/clients/contacts" replace /></ProtectedRoute>} />
          <Route path="/clients/contacts" element={<ProtectedRoute><Layout routePath="/clients/contacts"><Contacts /></Layout></ProtectedRoute>} />
          <Route path="/clients/contacts/new" element={<ProtectedRoute><Layout routePath="/clients/contacts/new"><ContactCreatePage /></Layout></ProtectedRoute>} />
          <Route path="/clients/contacts/:id/edit" element={<ProtectedRoute><Layout routePath="/clients/contacts/edit"><ContactCreatePage /></Layout></ProtectedRoute>} />
          <Route path="/clients/organizations" element={<ProtectedRoute><Layout routePath="/clients/organizations"><Organizations /></Layout></ProtectedRoute>} />
          <Route path="/clients/organizations/new" element={<ProtectedRoute><Layout routePath="/clients/organizations/new"><OrganizationCreatePage /></Layout></ProtectedRoute>} />
          <Route path="/clients/organizations/:id/edit" element={<ProtectedRoute><Layout routePath="/clients/organizations/edit"><OrganizationCreatePage /></Layout></ProtectedRoute>} />
          <Route path="/clients/groups" element={<ProtectedRoute><Layout routePath="/clients/groups"><ClientGroups /></Layout></ProtectedRoute>} />
          <Route path="/services" element={<ProtectedRoute><Layout routePath="/services"><Services /></Layout></ProtectedRoute>} />
          <Route path="/services/new" element={<ProtectedRoute><Layout routePath="/services/new"><NewServiceEngagement /></Layout></ProtectedRoute>} />
          <Route path="/documents" element={<ProtectedRoute><Layout routePath="/documents"><Documents /></Layout></ProtectedRoute>} />
          <Route path="/invoices" element={<ProtectedRoute><Layout routePath="/invoices"><Invoices /></Layout></ProtectedRoute>} />
          <Route path="/calendar" element={<ProtectedRoute><Layout routePath="/calendar"><Calendar /></Layout></ProtectedRoute>} />
          <Route path="/credentials" element={<ProtectedRoute><Layout routePath="/credentials"><Credentials /></Layout></ProtectedRoute>} />
          <Route path="/registers" element={<ProtectedRoute><Layout routePath="/registers"><Registers /></Layout></ProtectedRoute>} />
          <Route path="/leads" element={<ProtectedRoute><Layout routePath="/leads"><Leads /></Layout></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Layout routePath="/settings"><Settings /></Layout></ProtectedRoute>} />
          <Route path="/admin/users" element={
            <ProtectedRoute requiredPermission="users.manage">
              <Layout routePath="/admin/users">
                <UserManagement />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
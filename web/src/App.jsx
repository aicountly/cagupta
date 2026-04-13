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
import ServiceEngagementEdit from './pages/ServiceEngagementEdit';
import ServiceEngagementFiles from './pages/ServiceEngagementFiles';
import Documents from './pages/Documents';
import Invoices from './pages/Invoices';
import Calendar from './pages/Calendar';
import Credentials from './pages/Credentials';
import Registers from './pages/Registers';
import Leads from './pages/Leads';
import Settings from './pages/Settings';
import UserManagement from './pages/UserManagement';
import ClientGroups from './pages/ClientGroups';
import GlobalSearchPage from './pages/GlobalSearchPage';
import Profile from './pages/Profile';
import AdminAffiliates from './pages/AdminAffiliates';
import AffiliateLayout from './components/layout/AffiliateLayout';
import AffiliateDashboard from './pages/affiliate/AffiliateDashboard';
import AffiliateServices from './pages/affiliate/AffiliateServices';
import AffiliateCommissions from './pages/affiliate/AffiliateCommissions';
import AffiliatePayouts from './pages/affiliate/AffiliatePayouts';
import AffiliateBank from './pages/affiliate/AffiliateBank';
import AffiliateSubAffiliates from './pages/affiliate/AffiliateSubAffiliates';

/** Subpath deployments (e.g. `npm run build:github` → base `/cagupta/`) need this or /search opens the wrong URL. */
const ROUTER_BASENAME =
  import.meta.env.BASE_URL && import.meta.env.BASE_URL !== '/'
    ? import.meta.env.BASE_URL.replace(/\/$/, '')
    : undefined;

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
  '/services/edit':             '✏️ Edit Service Engagement',
  '/services/files':            '📂 Engagement Files',
  '/documents':                 '📂 Document Management',
  '/invoices':                  '💰 Invoices & Ledger',
  '/calendar':                  '📅 Calendar & Appointments',
  '/credentials':               '🔑 Credentials Vault',
  '/registers':                 '📊 Compliance Registers',
  '/leads':                     '🎯 Leads & Quotations',
  '/settings':                  '⚙️ Settings',
  '/admin/users':               '👥 User Management',
  '/admin/affiliates':          '🤝 Affiliates',
  '/search':                    '🔍 Search',
  '/profile':                   '👤 My Profile',
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
    <BrowserRouter basename={ROUTER_BASENAME}>
      <AuthProvider>
        <NotificationProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute staffOnly><Layout routePath="/"><Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/clients" element={<ProtectedRoute staffOnly><Navigate to="/clients/contacts" replace /></ProtectedRoute>} />
          <Route path="/clients/contacts" element={<ProtectedRoute staffOnly><Layout routePath="/clients/contacts"><Contacts /></Layout></ProtectedRoute>} />
          <Route path="/clients/contacts/new" element={<ProtectedRoute staffOnly><Layout routePath="/clients/contacts/new"><ContactCreatePage /></Layout></ProtectedRoute>} />
          <Route path="/clients/contacts/:id/edit" element={<ProtectedRoute staffOnly><Layout routePath="/clients/contacts/edit"><ContactCreatePage /></Layout></ProtectedRoute>} />
          <Route path="/clients/organizations" element={<ProtectedRoute staffOnly><Layout routePath="/clients/organizations"><Organizations /></Layout></ProtectedRoute>} />
          <Route path="/clients/organizations/new" element={<ProtectedRoute staffOnly><Layout routePath="/clients/organizations/new"><OrganizationCreatePage /></Layout></ProtectedRoute>} />
          <Route path="/clients/organizations/:id/edit" element={<ProtectedRoute staffOnly><Layout routePath="/clients/organizations/edit"><OrganizationCreatePage /></Layout></ProtectedRoute>} />
          <Route path="/clients/groups" element={<ProtectedRoute staffOnly><Layout routePath="/clients/groups"><ClientGroups /></Layout></ProtectedRoute>} />
          <Route path="/services" element={<ProtectedRoute staffOnly><Layout routePath="/services"><Services /></Layout></ProtectedRoute>} />
          <Route path="/services/new" element={<ProtectedRoute staffOnly><Layout routePath="/services/new"><NewServiceEngagement /></Layout></ProtectedRoute>} />
          <Route path="/services/:id/edit" element={
            <ProtectedRoute staffOnly requiredPermission="services.edit">
              <Layout routePath="/services/edit"><ServiceEngagementEdit /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/services/:id/files" element={<ProtectedRoute staffOnly><Layout routePath="/services/files"><ServiceEngagementFiles /></Layout></ProtectedRoute>} />
          <Route path="/documents" element={<ProtectedRoute staffOnly><Layout routePath="/documents"><Documents /></Layout></ProtectedRoute>} />
          <Route path="/invoices" element={<ProtectedRoute staffOnly><Layout routePath="/invoices"><Invoices /></Layout></ProtectedRoute>} />
          <Route path="/calendar" element={<ProtectedRoute staffOnly><Layout routePath="/calendar"><Calendar /></Layout></ProtectedRoute>} />
          <Route path="/credentials" element={<ProtectedRoute staffOnly><Layout routePath="/credentials"><Credentials /></Layout></ProtectedRoute>} />
          <Route path="/registers" element={<ProtectedRoute staffOnly><Layout routePath="/registers"><Registers /></Layout></ProtectedRoute>} />
          <Route path="/leads" element={<ProtectedRoute staffOnly><Layout routePath="/leads"><Leads /></Layout></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute staffOnly><Layout routePath="/search"><GlobalSearchPage /></Layout></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute staffOnly><Layout routePath="/settings"><Settings /></Layout></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute staffOnly><Layout routePath="/profile"><Profile /></Layout></ProtectedRoute>} />
          <Route path="/admin/users" element={
            <ProtectedRoute staffOnly requiredAnyPermissions={['users.manage', 'users.delegate']}>
              <Layout routePath="/admin/users">
                <UserManagement />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/affiliates" element={
            <ProtectedRoute staffOnly requiredPermission="affiliates.manage">
              <Layout routePath="/admin/affiliates">
                <AdminAffiliates />
              </Layout>
            </ProtectedRoute>
          } />

          <Route path="/affiliate" element={<ProtectedRoute affiliateOnly><AffiliateDashboard /></ProtectedRoute>} />
          <Route path="/affiliate/services" element={<ProtectedRoute affiliateOnly><AffiliateServices /></ProtectedRoute>} />
          <Route path="/affiliate/commissions" element={<ProtectedRoute affiliateOnly><AffiliateCommissions /></ProtectedRoute>} />
          <Route path="/affiliate/payouts" element={<ProtectedRoute affiliateOnly><AffiliatePayouts /></ProtectedRoute>} />
          <Route path="/affiliate/bank" element={<ProtectedRoute affiliateOnly><AffiliateBank /></ProtectedRoute>} />
          <Route path="/affiliate/sub-affiliates" element={<ProtectedRoute affiliateOnly><AffiliateSubAffiliates /></ProtectedRoute>} />
          <Route path="/affiliate/profile" element={
            <ProtectedRoute affiliateOnly>
              <AffiliateLayout title="My profile">
                <Profile />
              </AffiliateLayout>
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
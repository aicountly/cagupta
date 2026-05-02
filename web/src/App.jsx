import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import ProtectedRoute from './auth/ProtectedRoute';
// ── Core module ──────────────────────────────────────────────────────────────
import LoginPage from './modules/core/pages/Login';
import Sidebar from './modules/core/components/Sidebar';
import TopBar from './modules/core/components/TopBar';
import Dashboard from './modules/core/pages/Dashboard';
import Profile from './modules/core/pages/Profile';
import UserManagement from './modules/core/pages/UserManagement';
import Settings from './modules/core/pages/Settings';
import GlobalSearchPage from './modules/core/pages/GlobalSearchPage';
import InboxAndTickets from './modules/core/pages/InboxAndTickets';

// ── CRM module ───────────────────────────────────────────────────────────────
import Contacts from './modules/crm/pages/Contacts';
import ContactCreatePage from './modules/crm/pages/ContactCreatePage';
import ContactExceptionsReport from './modules/crm/pages/ContactExceptionsReport';
import ContactVerificationExceptions from './modules/crm/pages/ContactVerificationExceptions';
import ContactKycExceptionsReport from './modules/crm/pages/ContactKycExceptionsReport';
import Organizations from './modules/crm/pages/Organizations';
import OrganizationCreatePage from './modules/crm/pages/OrganizationCreatePage';
import OrganizationExceptionsReport from './modules/crm/pages/OrganizationExceptionsReport';
import OrganizationKycExceptionsReport from './modules/crm/pages/OrganizationKycExceptionsReport';
import ClientEngagementGaps from './modules/crm/pages/ClientEngagementGaps';
import Clients from './modules/crm/pages/Clients';
import ClientGroups from './modules/crm/pages/ClientGroups';
import Leads from './modules/crm/pages/Leads';

// ── Operations module ────────────────────────────────────────────────────────
import Services from './modules/operations/pages/Services';
import ServicesKpiList from './modules/operations/pages/ServicesKpiList';
import NewServiceEngagement from './modules/operations/pages/NewServiceEngagement';
import ServiceEngagementEdit from './modules/operations/pages/ServiceEngagementEdit';
import ServiceEngagementManage from './modules/operations/pages/ServiceEngagementManage';
import ServiceEngagementFiles from './modules/operations/pages/ServiceEngagementFiles';
import Documents from './modules/operations/pages/Documents';
import Calendar from './modules/operations/pages/Calendar';
import AppointmentFeeRules from './modules/operations/pages/AppointmentFeeRules';
import Credentials from './modules/operations/pages/Credentials';
import Registers from './modules/operations/pages/Registers';
import RecurringServices from './modules/operations/pages/RecurringServices';
import PendingFollowUps from './modules/operations/pages/PendingFollowUps';
import DashboardMetricDetail from './modules/operations/pages/DashboardMetricDetail';
import ReportsHub from './modules/operations/pages/ReportsHub';
import TimesheetsReport from './modules/operations/pages/TimesheetsReport';
import ShiftTargetTimesheetReport from './modules/operations/pages/ShiftTargetTimesheetReport';

// ── Finance module ───────────────────────────────────────────────────────────
import Invoices from './modules/finance/pages/Invoices';
import BankFirmReports from './modules/finance/pages/BankFirmReports';

// ── Marketing module ─────────────────────────────────────────────────────────
import WAWebMarketing from './modules/marketing/pages/WAWebMarketing';
import WANativeMarketing from './modules/marketing/pages/WANativeMarketing';
import SMSMarketing from './modules/marketing/pages/SMSMarketing';
import SocialPosting from './modules/marketing/pages/SocialPosting';
import AffiliateOutreach from './modules/marketing/pages/AffiliateOutreach';
import MarketingCampaigns from './modules/marketing/pages/MarketingCampaigns';
import TriggerSettings from './modules/marketing/pages/TriggerSettings';

// ── Affiliate module ─────────────────────────────────────────────────────────
import AdminAffiliates from './modules/affiliate/pages/AdminAffiliates';
import AffiliateLayout from './modules/affiliate/components/AffiliateLayout';
import AffiliateDashboard from './modules/affiliate/pages/AffiliateDashboard';
import AffiliateServices from './modules/affiliate/pages/AffiliateServices';
import AffiliateCommissions from './modules/affiliate/pages/AffiliateCommissions';
import AffiliatePayouts from './modules/affiliate/pages/AffiliatePayouts';
import AffiliateBank from './modules/affiliate/pages/AffiliateBank';
import AffiliateSubAffiliates from './modules/affiliate/pages/AffiliateSubAffiliates';
import AffiliateRewards from './modules/affiliate/pages/AffiliateRewards';

// ── Partner module ───────────────────────────────────────────────────────────
import AdminPartners from './modules/partner/pages/AdminPartners';
import PartnerLayout from './modules/partner/components/PartnerLayout';
import PartnerDashboard from './modules/partner/pages/PartnerDashboard';
import PartnerAssignments from './modules/partner/pages/PartnerAssignments';
import PartnerPayouts from './modules/partner/pages/PartnerPayouts';
import PartnerBank from './modules/partner/pages/PartnerBank';

// ── Client module ────────────────────────────────────────────────────────────
import ClientActiveServices from './modules/client/pages/ClientActiveServices';
import ClientCompletedServices from './modules/client/pages/ClientCompletedServices';
import ClientServiceDetails from './modules/client/pages/ClientServiceDetails';
import ClientLedger from './modules/client/pages/ClientLedger';
import ClientProfile from './modules/client/pages/ClientProfile';

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
  '/services/focus':            '📋 Services & Tasks',
  '/dashboard/metrics':         '🏠 Dashboard',
  '/services/new':              '➕ New Service Engagement',
  '/services/edit':             '✏️ Edit Service Engagement',
  '/services/manage':          '📋 Manage Service Engagement',
  '/services/follow-ups':      '📋 Pending Follow-ups',
  '/services/files':            '📂 Engagement Files',
  '/documents':                 '📂 Document Management',
  '/invoices':                  '💰 Invoices & Ledger',
  '/finance/bank-reports':      '🏦 Bank & firm txns',
  '/reports':                            '📊 Reports',
  '/reports/timesheets':                 '🕐 Timesheet report',
  '/reports/timesheets/shift-target':    '📊 Staff punch vs target',
  '/reports/exceptions/contacts':          '📋 Contact data exceptions',
  '/reports/exceptions/organizations':     '📋 Organization data exceptions',
  '/reports/exceptions/contact-kyc':       '📋 Contact KYC exceptions',
  '/reports/exceptions/organization-kyc':  '📋 Organization KYC exceptions',
  '/calendar':                  '📅 Calendar & Appointments',
  '/settings/appointment-fees': '💳 Appointment fee rules',
  '/credentials':               '🔑 Credentials Vault',
  '/registers':                 '📊 Compliance Registers',
  '/recurring-services':        '🔁 Recurring Services',
  '/leads':                     '🎯 Leads & Quotations',
  '/settings':                  '⚙️ Settings',
  '/admin/users':               '👥 User Management',
  '/admin/leaves':              '📅 Leave Management',
  '/admin/affiliates':          '🤝 Affiliates',
  '/admin/partners':            '🤝 Partners',
  '/marketing/wa/web':          '📱 WA Web Marketing',
  '/marketing/wa/api':          '📱 WA Native (API)',
  '/marketing/sms':             '📲 SMS Marketing',
  '/marketing/social':          '🌐 Social Posting',
  '/marketing/affiliate':       '🤝 Affiliate Outreach',
  '/marketing/campaigns':       '📣 Marketing Campaigns',
  '/marketing/triggers':        '🔔 Trigger Settings',
  '/reports/exceptions/verification': '🔒 Verification Exceptions',
  '/reports/client-engagement': '📊 Client engagement gaps',
  '/search':                    '🔍 Search',
  '/inbox':                     '📥 Inbox & tickets',
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
          <Route path="/services/follow-ups" element={
            <ProtectedRoute staffOnly requiredPermission="services.view">
              <Layout routePath="/services/follow-ups"><PendingFollowUps /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/dashboard/metrics/:metricKey" element={<ProtectedRoute staffOnly><Layout routePath="/dashboard/metrics"><DashboardMetricDetail /></Layout></ProtectedRoute>} />
          <Route path="/services/new" element={<ProtectedRoute staffOnly><Layout routePath="/services/new"><NewServiceEngagement /></Layout></ProtectedRoute>} />
          <Route path="/services/focus" element={<ProtectedRoute staffOnly><Navigate to="/services" replace /></ProtectedRoute>} />
          <Route path="/services/focus/:kpiSlug" element={<ProtectedRoute staffOnly><Layout routePath="/services/focus"><ServicesKpiList /></Layout></ProtectedRoute>} />
          <Route path="/services/:id" element={
            <ProtectedRoute staffOnly requiredPermission="services.edit">
              <Layout routePath="/services/manage"><ServiceEngagementManage /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/services/:id/edit" element={
            <ProtectedRoute staffOnly requiredPermission="services.edit">
              <Layout routePath="/services/edit"><ServiceEngagementEdit /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/services/:id/files" element={<ProtectedRoute staffOnly><Layout routePath="/services/files"><ServiceEngagementFiles /></Layout></ProtectedRoute>} />
          <Route path="/documents" element={<ProtectedRoute staffOnly><Layout routePath="/documents"><Documents /></Layout></ProtectedRoute>} />
          <Route path="/invoices" element={<ProtectedRoute staffOnly><Layout routePath="/invoices"><Invoices /></Layout></ProtectedRoute>} />
          <Route path="/finance/bank-reports" element={<ProtectedRoute staffOnly requiredPermission="invoices.view"><Layout routePath="/finance/bank-reports"><BankFirmReports /></Layout></ProtectedRoute>} />
          <Route path="/reports" element={
            <ProtectedRoute staffOnly requiredPermission="services.view">
              <Layout routePath="/reports"><ReportsHub /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/reports/timesheets" element={
            <ProtectedRoute staffOnly requiredPermission="services.view">
              <Layout routePath="/reports/timesheets"><TimesheetsReport /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/reports/timesheets/shift-target" element={
            <ProtectedRoute staffOnly requiredPermission="services.view">
              <Layout routePath="/reports/timesheets/shift-target"><ShiftTargetTimesheetReport /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/reports/exceptions/contacts" element={
            <ProtectedRoute staffOnly requiredPermission="clients.view">
              <Layout routePath="/reports/exceptions/contacts"><ContactExceptionsReport /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/reports/exceptions/organizations" element={
            <ProtectedRoute staffOnly requiredPermission="clients.view">
              <Layout routePath="/reports/exceptions/organizations"><OrganizationExceptionsReport /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/reports/exceptions/contact-kyc" element={
            <ProtectedRoute staffOnly requiredPermission="clients.view">
              <Layout routePath="/reports/exceptions/contact-kyc"><ContactKycExceptionsReport /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/reports/exceptions/organization-kyc" element={
            <ProtectedRoute staffOnly requiredPermission="clients.view">
              <Layout routePath="/reports/exceptions/organization-kyc"><OrganizationKycExceptionsReport /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/reports/exceptions/verification" element={
            <ProtectedRoute staffOnly requiredPermission="clients.view">
              <Layout routePath="/reports/exceptions/verification"><ContactVerificationExceptions /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/reports/client-engagement" element={
            <ProtectedRoute staffOnly requiredPermission="clients.view">
              <Layout routePath="/reports/client-engagement"><ClientEngagementGaps /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/calendar" element={<ProtectedRoute staffOnly><Layout routePath="/calendar"><Calendar /></Layout></ProtectedRoute>} />
          <Route path="/credentials" element={<ProtectedRoute staffOnly><Layout routePath="/credentials"><Credentials /></Layout></ProtectedRoute>} />
          <Route path="/registers" element={<ProtectedRoute staffOnly><Layout routePath="/registers"><Registers /></Layout></ProtectedRoute>} />
          <Route path="/recurring-services" element={<ProtectedRoute staffOnly><Layout routePath="/recurring-services"><RecurringServices /></Layout></ProtectedRoute>} />
          <Route path="/leads" element={<ProtectedRoute staffOnly><Layout routePath="/leads"><Leads /></Layout></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute staffOnly><Layout routePath="/search"><GlobalSearchPage /></Layout></ProtectedRoute>} />
          <Route path="/inbox" element={
            <ProtectedRoute staffOnly requiredPermission="settings.view">
              <Layout routePath="/inbox"><InboxAndTickets /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/settings" element={<ProtectedRoute staffOnly><Layout routePath="/settings"><Settings /></Layout></ProtectedRoute>} />
          <Route path="/settings/appointment-fees" element={<ProtectedRoute staffOnly><Layout routePath="/settings/appointment-fees"><AppointmentFeeRules /></Layout></ProtectedRoute>} />
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
          <Route path="/admin/partners" element={
            <ProtectedRoute staffOnly requiredPermission="partners.manage">
              <Layout routePath="/admin/partners">
                <AdminPartners />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/leaves" element={
            <ProtectedRoute staffOnly requiredPermission="users.manage">
              <Layout routePath="/admin/leaves">
                <LeaveManagement />
              </Layout>
            </ProtectedRoute>
          } />

          {/* ── Marketing routes ───────────────────────────────────────────── */}
          <Route path="/marketing/wa/web" element={<ProtectedRoute staffOnly><Layout routePath="/marketing/wa/web"><WAWebMarketing /></Layout></ProtectedRoute>} />
          <Route path="/marketing/wa/api" element={<ProtectedRoute staffOnly><Layout routePath="/marketing/wa/api"><WANativeMarketing /></Layout></ProtectedRoute>} />
          <Route path="/marketing/sms" element={<ProtectedRoute staffOnly><Layout routePath="/marketing/sms"><SMSMarketing /></Layout></ProtectedRoute>} />
          <Route path="/marketing/social" element={<ProtectedRoute staffOnly><Layout routePath="/marketing/social"><SocialPosting /></Layout></ProtectedRoute>} />
          <Route path="/marketing/affiliate" element={<ProtectedRoute staffOnly><Layout routePath="/marketing/affiliate"><AffiliateOutreach /></Layout></ProtectedRoute>} />
          <Route path="/marketing/campaigns" element={<ProtectedRoute staffOnly><Layout routePath="/marketing/campaigns"><MarketingCampaigns /></Layout></ProtectedRoute>} />
          <Route path="/marketing/triggers" element={<ProtectedRoute staffOnly><Layout routePath="/marketing/triggers"><TriggerSettings /></Layout></ProtectedRoute>} />
          <Route path="/marketing" element={<ProtectedRoute staffOnly><Navigate to="/marketing/campaigns" replace /></ProtectedRoute>} />

          <Route path="/affiliate" element={<ProtectedRoute affiliateOnly><AffiliateDashboard /></ProtectedRoute>} />
          <Route path="/affiliate/services" element={<ProtectedRoute affiliateOnly><AffiliateServices /></ProtectedRoute>} />
          <Route path="/affiliate/commissions" element={<ProtectedRoute affiliateOnly><AffiliateCommissions /></ProtectedRoute>} />
          <Route path="/affiliate/payouts" element={<ProtectedRoute affiliateOnly><AffiliatePayouts /></ProtectedRoute>} />
          <Route path="/affiliate/bank" element={<ProtectedRoute affiliateOnly><AffiliateBank /></ProtectedRoute>} />
          <Route path="/affiliate/sub-affiliates" element={<ProtectedRoute affiliateOnly><AffiliateSubAffiliates /></ProtectedRoute>} />
          <Route path="/affiliate/rewards" element={<ProtectedRoute affiliateOnly><AffiliateRewards /></ProtectedRoute>} />
          <Route path="/affiliate/profile" element={
            <ProtectedRoute affiliateOnly>
              <AffiliateLayout title="My profile">
                <Profile />
              </AffiliateLayout>
            </ProtectedRoute>
          } />

          <Route path="/partner" element={<ProtectedRoute partnerOnly><PartnerDashboard /></ProtectedRoute>} />
          <Route path="/partner/assignments" element={<ProtectedRoute partnerOnly><PartnerAssignments /></ProtectedRoute>} />
          <Route path="/partner/payouts" element={<ProtectedRoute partnerOnly><PartnerPayouts /></ProtectedRoute>} />
          <Route path="/partner/bank" element={<ProtectedRoute partnerOnly><PartnerBank /></ProtectedRoute>} />
          <Route path="/partner/profile" element={
            <ProtectedRoute partnerOnly>
              <PartnerLayout title="My profile">
                <Profile />
              </PartnerLayout>
            </ProtectedRoute>
          } />

          <Route path="/client" element={<ProtectedRoute clientOnly><ClientActiveServices /></ProtectedRoute>} />
          <Route path="/client/completed" element={<ProtectedRoute clientOnly><ClientCompletedServices /></ProtectedRoute>} />
          <Route path="/client/services/:id" element={<ProtectedRoute clientOnly><ClientServiceDetails /></ProtectedRoute>} />
          <Route path="/client/ledger" element={<ProtectedRoute clientOnly><ClientLedger /></ProtectedRoute>} />
          <Route path="/client/profile" element={<ProtectedRoute clientOnly><ClientProfile /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Organizations from './pages/Organizations';
import Services from './pages/Services';
import Documents from './pages/Documents';
import Invoices from './pages/Invoices';
import Calendar from './pages/Calendar';
import Credentials from './pages/Credentials';
import Registers from './pages/Registers';
import Leads from './pages/Leads';
import Settings from './pages/Settings';

const pageTitles = {
  '/':                       '🏠 Dashboard',
  '/clients/contacts':       '👤 Contacts',
  '/clients/organizations':  '🏢 Organizations',
  '/services':               '📋 Services & Tasks',
  '/documents':              '📂 Document Management',
  '/invoices':               '💰 Invoices & Ledger',
  '/calendar':               '📅 Calendar & Appointments',
  '/credentials':            '🔑 Credentials Vault',
  '/registers':              '📊 Compliance Registers',
  '/leads':                  '🎯 Leads & Quotations',
  '/settings':               '⚙️ Settings',
};

function Layout({ path, children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F6F7FB', overflow: 'hidden' }}>
        <TopBar title={pageTitles[path] || 'CA Office Portal'} />
        <main style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout path="/"><Dashboard /></Layout>} />
        <Route path="/clients" element={<Navigate to="/clients/contacts" replace />} />
        <Route path="/clients/contacts" element={<Layout path="/clients/contacts"><Contacts /></Layout>} />
        <Route path="/clients/organizations" element={<Layout path="/clients/organizations"><Organizations /></Layout>} />
        <Route path="/services" element={<Layout path="/services"><Services /></Layout>} />
        <Route path="/documents" element={<Layout path="/documents"><Documents /></Layout>} />
        <Route path="/invoices" element={<Layout path="/invoices"><Invoices /></Layout>} />
        <Route path="/calendar" element={<Layout path="/calendar"><Calendar /></Layout>} />
        <Route path="/credentials" element={<Layout path="/credentials"><Credentials /></Layout>} />
        <Route path="/registers" element={<Layout path="/registers"><Registers /></Layout>} />
        <Route path="/leads" element={<Layout path="/leads"><Leads /></Layout>} />
        <Route path="/settings" element={<Layout path="/settings"><Settings /></Layout>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

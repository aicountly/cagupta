import Header from './components/layout/Header.jsx';

const navItems = [
  { label: 'Dashboard' },
  { label: 'Clients' },
  { label: 'Tasks' },
  { label: 'Documents' },
  { label: 'Billing' },
  { label: 'Reports' },
];

export default function App() {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-60 bg-blue-900 text-white flex flex-col">
        <div className="px-6 py-5 border-b border-blue-800">
          <h1 className="text-xl font-bold tracking-wide">CA Gupta</h1>
          <p className="text-xs text-blue-300 mt-0.5">Office Management Portal</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              className="w-full text-left px-3 py-2 rounded text-sm text-blue-100 hover:bg-blue-800 hover:text-white transition-colors"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto p-6">
          <h2 className="text-2xl font-semibold text-gray-700">Dashboard</h2>
          <p className="mt-2 text-gray-500">Welcome to the CA Gupta Office Management Portal.</p>
        </main>
      </div>
    </div>
  );
}

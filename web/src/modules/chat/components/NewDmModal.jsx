import { useState } from 'react';
import { Search, X } from 'lucide-react';

export default function NewDmModal({ contacts, onClose, onCreate, busy }) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const filtered = contacts.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.name || '').toLowerCase().includes(q)
      || (c.email || '').toLowerCase().includes(q)
      || (c.role_name || '').toLowerCase().includes(q);
  });

  async function handleCreate() {
    if (!selectedId) return;
    await onCreate(selectedId);
  }

  return (
    <div style={overlay}>
      <div style={modal} role="dialog" aria-modal="true">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0B1F3B' }}>New direct message</h2>
          <button type="button" onClick={onClose} style={iconBtn} aria-label="Close"><X size={18} /></button>
        </div>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search people..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...input, paddingLeft: 34 }}
          />
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #F1F5F9', borderRadius: 10 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No contacts found</div>
          ) : filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              style={{
                ...rowBtn,
                background: selectedId === c.id ? '#FFF7ED' : '#fff',
                borderLeft: selectedId === c.id ? '3px solid #F37920' : '3px solid transparent',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: '#0B1F3B' }}>{c.name}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{c.role_display_name || c.role_name || ''}</div>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
          <button type="button" onClick={handleCreate} disabled={!selectedId || busy} style={btnPrimary}>
            {busy ? 'Opening…' : 'Start chat'}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modal = { background: '#fff', borderRadius: 14, padding: 24, width: 'min(440px, 92vw)', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' };
const input = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, boxSizing: 'border-box' };
const rowBtn = { width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none', borderBottom: '1px solid #F8FAFC', cursor: 'pointer' };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 };
const btnSecondary = { padding: '8px 16px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnPrimary = { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#F37920', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 };

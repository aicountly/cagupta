import { useState } from 'react';
import { X } from 'lucide-react';

export default function NewChannelModal({ contacts, onClose, onCreate, busy }) {
  const [title, setTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  function toggleId(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleCreate() {
    if (!title.trim()) return;
    await onCreate({ title: title.trim(), memberUserIds: selectedIds });
  }

  return (
    <div style={overlay}>
      <div style={modal} role="dialog" aria-modal="true">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0B1F3B' }}>New channel</h2>
          <button type="button" onClick={onClose} style={iconBtn} aria-label="Close"><X size={18} /></button>
        </div>
        <label style={label}>Channel name</label>
        <input
          type="text"
          placeholder="e.g. Finance, Operations"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ ...input, marginBottom: 16 }}
        />
        <label style={label}>Add members (optional)</label>
        <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #F1F5F9', borderRadius: 10, marginBottom: 16 }}>
          {contacts.map((c) => (
            <label key={c.id} style={checkRow}>
              <input
                type="checkbox"
                checked={selectedIds.includes(c.id)}
                onChange={() => toggleId(c.id)}
              />
              <span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>{c.role_display_name || c.role_name}</span>
              </span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
          <button type="button" onClick={handleCreate} disabled={!title.trim() || busy} style={btnPrimary}>
            {busy ? 'Creating…' : 'Create channel'}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modal = { background: '#fff', borderRadius: 14, padding: 24, width: 'min(480px, 92vw)', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' };
const input = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, boxSizing: 'border-box' };
const label = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 };
const checkRow = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #F8FAFC', cursor: 'pointer', fontSize: 13 };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 };
const btnSecondary = { padding: '8px 16px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnPrimary = { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#F37920', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 };

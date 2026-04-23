import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X } from 'lucide-react';
import { getContactsForSearch } from '../../services/contactService';

const MIN_QUERY = 2;
const SEARCH_LIMIT = 40;
const DEBOUNCE_MS = 300;

const inputStyle = {
  padding: '8px 10px',
  border: '1px solid #E6E8F0',
  borderRadius: 8,
  fontSize: 13,
  color: '#334155',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const dropdownStyle = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  zIndex: 9999,
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  maxHeight: 280,
  overflowY: 'auto',
  marginTop: 4,
};

const chipBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 10px 5px 12px',
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 600,
  border: '1.5px solid #F37920',
  background: '#FEF0E6',
  color: '#C25A0A',
  cursor: 'pointer',
  transition: 'all 0.15s',
};

/**
 * Search-driven multi-select for secondary contacts on an organization.
 *
 * @param {object} props
 * @param {number[]} props.selectedIds
 * @param {Record<number, string>} props.namesById
 * @param {(next: { ids: number[], namesById: Record<number, string> }) => void} props.onChange
 * @param {(number|string)[]} [props.excludeIds]  e.g. primary contact id — cannot be added
 */
function toNumericIds(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export default function ContactMultiSelect({ selectedIds, namesById, onChange, excludeIds = [] }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  const ids = useMemo(() => toNumericIds(selectedIds), [selectedIds]);

  const excludeSet = useMemo(() => {
    const s = new Set();
    for (const x of excludeIds) {
      const n = Number(x);
      if (Number.isFinite(n) && n > 0) s.add(n);
    }
    return s;
  }, [excludeIds]);

  const pushChange = useCallback((ids, nextNames) => {
    onChange({ ids, namesById: nextNames });
  }, [onChange]);

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const runSearch = useCallback(async (q) => {
    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await getContactsForSearch(trimmed, SEARCH_LIMIT);
      setSuggestions(rows);
      setOpen(true);
    } catch {
      setSuggestions([]);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInput(e) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), DEBOUNCE_MS);
    if (val.trim().length < MIN_QUERY) {
      setSuggestions([]);
      setOpen(false);
    }
  }

  function handleFocus() {
    if (query.trim().length >= MIN_QUERY) {
      runSearch(query);
    }
  }

  function addContact(row) {
    const id = Number(row.id);
    if (!Number.isFinite(id) || id <= 0) return;
    if (excludeSet.has(id)) {
      setQuery('');
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (ids.includes(id)) {
      setQuery('');
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const name = row.displayName || `Contact #${id}`;
    const nextIds = [...ids, id];
    const nextNames = { ...namesById, [id]: name };
    pushChange(nextIds, nextNames);
    setQuery('');
    setSuggestions([]);
    setOpen(false);
  }

  function removeContact(id) {
    const nextIds = ids.filter(x => x !== id);
    const nextNames = { ...namesById };
    delete nextNames[id];
    pushChange(nextIds, nextNames);
  }

  function labelFor(id) {
    return namesById[id] || namesById[String(id)] || `Contact #${id}`;
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={query}
        onChange={handleInput}
        onFocus={handleFocus}
        placeholder="Type at least 2 characters to search contacts…"
        style={inputStyle}
        autoComplete="off"
      />
      {loading && (
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94a3b8' }}>
          …
        </span>
      )}
      <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0' }}>
        Search by contact name, then click a result to add. Large directories are not listed here in full.
      </p>

      {open && (
        <div style={dropdownStyle}>
          {suggestions.length === 0 && !loading && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: '#94a3b8' }}>
              No contacts found
            </div>
          )}
          {suggestions.map((row) => {
            const id = Number(row.id);
            const picked = ids.includes(id);
            const blocked = excludeSet.has(id);
            return (
              <div
                key={id}
                style={{
                  padding: '8px 12px',
                  cursor: picked || blocked ? 'default' : 'pointer',
                  fontSize: 13,
                  color: picked || blocked ? '#94a3b8' : '#334155',
                  background: '#fff',
                  borderBottom: '1px solid #f8fafc',
                }}
                onMouseDown={e => {
                  e.preventDefault();
                  if (!picked && !blocked) addContact(row);
                }}
                onMouseEnter={e => {
                  if (!picked && !blocked) e.currentTarget.style.background = '#f0f4ff';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = '#fff';
                }}
              >
                {row.displayName}
                {blocked ? ' · primary contact' : picked ? ' · already added' : ''}
              </div>
            );
          })}
        </div>
      )}

      {ids.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {ids.map(id => (
            <button
              key={id}
              type="button"
              onClick={() => removeContact(id)}
              style={chipBtn}
              title="Remove"
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280 }}>{labelFor(id)}</span>
              <X size={14} strokeWidth={2.5} aria-hidden />
            </button>
          ))}
        </div>
      )}
      {ids.length > 0 && (
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
          {ids.length} secondary contact{ids.length > 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
}

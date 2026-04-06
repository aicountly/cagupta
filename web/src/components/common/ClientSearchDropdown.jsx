import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE_URL } from '../../constants/config';

const API_BASE = API_BASE_URL;

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * ClientSearchDropdown
 *
 * A debounced autocomplete input that lets users search for clients by name,
 * email, or PAN.  Designed to handle ~1,000 client records efficiently.
 *
 * Props:
 *   value         {number|string}  Currently selected client ID (controlled).
 *   displayValue  {string}         Currently selected client display name.
 *   onChange      {function}       Called with ({ id, displayName }) when a client is selected.
 *   placeholder   {string}         Input placeholder text.
 *   style         {object}         Extra styles for the input element.
 *   allowAll      {boolean}        If true, shows an "All Clients" option when no query.
 *   onAllClients  {function}       Called when "All Clients" is selected (requires allowAll).
 */
export default function ClientSearchDropdown({
  value,
  displayValue = '',
  onChange,
  placeholder = 'Search client…',
  style = {},
  allowAll = false,
  onAllClients,
}) {
  const [query, setQuery]           = useState(displayValue || '');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const debounceRef                 = useRef(null);
  const containerRef                = useRef(null);

  // Keep the input text in sync when the parent changes the displayValue
  useEffect(() => {
    setQuery(displayValue || '');
  }, [displayValue]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: q.trim(), limit: 20 });
      const res = await fetch(`${API_BASE}/admin/contacts/search?${params}`, {
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const rows = (data.data || []).map(c => {
          const parts = [c.first_name, c.last_name].filter(Boolean);
          return {
            id:          c.id,
            displayName: c.organization_name || parts.join(' ') || 'Unknown',
          };
        });
        setSuggestions(rows);
        setOpen(true);
      }
    } catch {
      // ignore search errors
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInput(e) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
    if (!val.trim()) {
      setSuggestions([]);
      setOpen(false);
    }
  }

  function handleFocus() {
    if (query.trim()) {
      doSearch(query);
    } else if (allowAll) {
      setOpen(true);
    }
  }

  function handleSelect(client) {
    setQuery(client.displayName);
    setSuggestions([]);
    setOpen(false);
    if (onChange) onChange(client);
  }

  function handleAllClients() {
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    if (onAllClients) onAllClients();
  }

  const inputStyle = {
    padding: '8px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    fontSize: 13,
    color: '#334155',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    ...style,
  };

  const dropdownStyle = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 9999,
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    maxHeight: 240,
    overflowY: 'auto',
    marginTop: 2,
  };

  const itemStyle = (hovered) => ({
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: 13,
    color: '#334155',
    background: hovered ? '#f0f4ff' : '#fff',
    borderBottom: '1px solid #f8fafc',
  });

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={query}
        onChange={handleInput}
        onFocus={handleFocus}
        placeholder={placeholder}
        style={inputStyle}
        autoComplete="off"
      />
      {loading && (
        <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:11, color:'#94a3b8' }}>…</span>
      )}
      {open && (
        <div style={dropdownStyle}>
          {allowAll && (
            <div
              style={{ ...itemStyle(false), fontStyle:'italic', color:'#64748b' }}
              onMouseDown={handleAllClients}
            >
              All Clients
            </div>
          )}
          {suggestions.length === 0 && !loading && query.trim() && (
            <div style={{ padding:'8px 12px', fontSize:12, color:'#94a3b8' }}>No clients found</div>
          )}
          {suggestions.map(c => (
            <div
              key={c.id}
              style={itemStyle(false)}
              onMouseEnter={e => { e.currentTarget.style.background = '#f0f4ff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
              onMouseDown={() => handleSelect(c)}
            >
              {c.displayName}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
 * EntitySearchDropdown
 *
 * A debounced autocomplete input that lets users search for either a Contact
 * or an Organization. A Contact | Organization toggle tab at the top of the
 * dropdown switches the active search source.
 *
 * Props:
 *   value         {number|string}          Currently selected entity ID.
 *   displayValue  {string}                 Currently selected entity display name.
 *   entityType    {'contact'|'organization'} Controlled entity type (default: 'contact').
 *   onChange      {function}               Called with ({ id, displayName, entityType }).
 *   placeholder   {string}                 Input placeholder text.
 *   style         {object}                 Extra styles for the input element.
 *   allowAll      {boolean}                If true, shows an "All" option when no query.
 *   onAllClients  {function}               Called when "All" is selected (requires allowAll).
 */
export default function EntitySearchDropdown({
  value,
  displayValue = '',
  entityType: controlledEntityType,
  onChange,
  placeholder = 'Search…',
  style = {},
  allowAll = false,
  onAllClients,
}) {
  const [activeType, setActiveType]       = useState(controlledEntityType || 'contact');
  const [query, setQuery]                 = useState(displayValue || '');
  const [suggestions, setSuggestions]     = useState([]);
  const [open, setOpen]                   = useState(false);
  const [loading, setLoading]             = useState(false);
  const debounceRef                       = useRef(null);
  const containerRef                      = useRef(null);

  // Keep the input text in sync when the parent changes the displayValue
  useEffect(() => {
    setQuery(displayValue || '');
  }, [displayValue]);

  // Keep activeType in sync when parent controls entityType
  useEffect(() => {
    if (controlledEntityType) setActiveType(controlledEntityType);
  }, [controlledEntityType]);

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

  const doSearch = useCallback(async (q, type) => {
    if (!q.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      let rows = [];
      if (type === 'organization') {
        const params = new URLSearchParams({ q: q.trim(), limit: 20 });
        const res = await fetch(`${API_BASE}/admin/organizations/search?${params}`, {
          headers: authHeaders(),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          rows = (data.data || []).map(o => ({
            id:          o.id,
            displayName: o.name || 'Unknown',
            entityType:  'organization',
          }));
        }
      } else {
        const params = new URLSearchParams({ q: q.trim(), limit: 20 });
        const res = await fetch(`${API_BASE}/admin/contacts/search?${params}`, {
          headers: authHeaders(),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          rows = (data.data || []).map(c => {
            const parts = [c.first_name, c.last_name].filter(Boolean);
            return {
              id:          c.id,
              displayName: c.organization_name || parts.join(' ') || 'Unknown',
              entityType:  'contact',
            };
          });
        }
      }
      setSuggestions(rows);
      setOpen(true);
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
    debounceRef.current = setTimeout(() => doSearch(val, activeType), 300);
    if (!val.trim()) {
      setSuggestions([]);
      setOpen(false);
    }
  }

  function handleFocus() {
    if (query.trim()) {
      doSearch(query, activeType);
    } else if (allowAll) {
      setOpen(true);
    }
  }

  function handleSelect(entity) {
    setQuery(entity.displayName);
    setSuggestions([]);
    setOpen(false);
    if (onChange) onChange(entity);
  }

  function handleAllClients() {
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    if (onAllClients) onAllClients();
  }

  function handleTypeChange(type) {
    setActiveType(type);
    setSuggestions([]);
    if (query.trim()) {
      doSearch(query, type);
    }
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
    maxHeight: 280,
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

  const tabBarStyle = {
    display: 'flex',
    borderBottom: '1px solid #f1f5f9',
    background: '#f8fafc',
  };

  const tabStyle = (active) => ({
    flex: 1,
    padding: '6px 0',
    fontSize: 11,
    fontWeight: 700,
    textAlign: 'center',
    cursor: 'pointer',
    color: active ? '#2563eb' : '#64748b',
    borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
    userSelect: 'none',
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
          {/* Contact | Organization toggle */}
          <div style={tabBarStyle}>
            <button
              style={tabStyle(activeType === 'contact')}
              onMouseDown={e => { e.preventDefault(); handleTypeChange('contact'); }}
            >
              Contact
            </button>
            <button
              style={tabStyle(activeType === 'organization')}
              onMouseDown={e => { e.preventDefault(); handleTypeChange('organization'); }}
            >
              Organization
            </button>
          </div>
          {allowAll && (
            <div
              style={{ ...itemStyle(false), fontStyle:'italic', color:'#64748b' }}
              onMouseDown={handleAllClients}
            >
              All
            </div>
          )}
          {suggestions.length === 0 && !loading && query.trim() && (
            <div style={{ padding:'8px 12px', fontSize:12, color:'#94a3b8' }}>
              No {activeType === 'organization' ? 'organizations' : 'contacts'} found
            </div>
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

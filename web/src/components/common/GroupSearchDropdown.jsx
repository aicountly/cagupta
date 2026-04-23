import { useState, useEffect, useRef, useCallback } from 'react';
import { searchClientGroups } from '../../services/clientGroupService';

/**
 * GroupSearchDropdown — debounced search against /admin/client-groups/search.
 *
 * Props:
 *   value, displayValue — controlled selection (id + label).
 *   onChange({ id, displayName }) — id '' when cleared.
 *   clearSelectionWhenInputEmpty — clearing the input removes the assignment.
 */
export default function GroupSearchDropdown({
  value,
  displayValue = '',
  onChange,
  placeholder = 'Search group by name…',
  style = {},
  minQueryLength = 1,
  searchLimit = 20,
  clearSelectionWhenInputEmpty = true,
}) {
  const [query, setQuery] = useState(displayValue || '');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    setQuery(displayValue || '');
  }, [displayValue]);

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
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < minQueryLength) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const lim = Math.min(50, Math.max(1, searchLimit));
    setLoading(true);
    try {
      const rows = await searchClientGroups(trimmed, lim);
      setSuggestions(
        (rows || []).map((g) => ({
          id: g.id,
          displayName: g.name || `Group #${g.id}`,
        }))
      );
      setOpen(true);
    } catch {
      setSuggestions([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, [minQueryLength, searchLimit]);

  function handleInput(e) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
    if (!val.trim()) {
      setSuggestions([]);
      setOpen(false);
      if (clearSelectionWhenInputEmpty && onChange) {
        onChange({ id: '', displayName: '' });
      }
    }
  }

  function handleFocus() {
    const t = query.trim();
    if (t.length >= minQueryLength) {
      doSearch(query);
    }
  }

  function handleSelect(row) {
    setQuery(row.displayName);
    setSuggestions([]);
    setOpen(false);
    if (onChange) onChange(row);
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

  const itemStyle = {
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: 13,
    color: '#334155',
    background: '#fff',
    borderBottom: '1px solid #f8fafc',
  };

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
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94a3b8' }}>
          …
        </span>
      )}
      {open && (
        <div style={dropdownStyle}>
          {suggestions.length === 0 && !loading && query.trim().length >= minQueryLength && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: '#94a3b8' }}>No groups found</div>
          )}
          {suggestions.map((g) => (
            <div
              key={g.id}
              style={itemStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f0f4ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fff';
              }}
              onMouseDown={() => handleSelect(g)}
            >
              {g.displayName}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

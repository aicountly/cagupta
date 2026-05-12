import { useState, useEffect, useMemo, useRef } from 'react';
import { matchesLineItemContentFilter } from '../../utils/lineItemPresetFilter';

/**
 * Searchable picker for invoice line presets (engagement types).
 *
 * Props:
 *   value      {string}   Selected preset key, or '' for custom.
 *   options    {{ key, description, engagementTypeId }[]}
 *   onChange   {(key: string) => void}  Pass '' to clear preset.
 *   placeholder, style — passed to the text input.
 */
export default function LineItemPresetCombobox({
  value,
  options = [],
  onChange,
  placeholder = 'Type to search service or category…',
  style = {},
}) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const skipNextValueSyncRef = useRef(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  useEffect(() => {
    if (skipNextValueSyncRef.current) {
      skipNextValueSyncRef.current = false;
      return;
    }
    const o = value ? options.find((x) => x.key === value) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync preset key → visible label when parent clears or picks externally
    setInput(o ? o.description : '');
  }, [value, options]);

  const listItems = useMemo(() => {
    const filtered = options.filter((o) => matchesLineItemContentFilter(o.description, input));
    return [{ type: 'custom' }, ...filtered.map((o) => ({ type: 'option', option: o }))];
  }, [options, input]);

  const maxIx = Math.max(0, listItems.length - 1);
  const hi = Math.min(Math.max(highlight, 0), maxIx);

  const pickIndex = (idx) => {
    const row = listItems[idx];
    if (!row) return;
    if (row.type === 'custom') {
      onChange('');
      setInput('');
    } else {
      onChange(row.option.key);
      setInput(row.option.description);
    }
    setOpen(false);
  };

  const handleInputChange = (e) => {
    const v = e.target.value;
    if (value) {
      skipNextValueSyncRef.current = true;
      onChange('');
    }
    setInput(v);
    setOpen(true);
    setHighlight(0);
  };

  const handleKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (listItems.length === 0) return;
      setHighlight((h) => {
        const c = Math.min(Math.max(h, 0), listItems.length - 1);
        return (c + 1) % listItems.length;
      });
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (listItems.length === 0) return;
      setHighlight((h) => {
        const c = Math.min(Math.max(h, 0), listItems.length - 1);
        return (c - 1 + listItems.length) % listItems.length;
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      pickIndex(hi);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={input}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        style={{ ...style, fontSize: style.fontSize ?? 12, width: '100%', boxSizing: 'border-box' }}
      />
      {open && listItems.length > 0 && (
        <ul
          role="listbox"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '100%',
            margin: '4px 0 0 0',
            padding: 0,
            listStyle: 'none',
            maxHeight: 280,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            boxShadow: '0 10px 25px rgba(15, 23, 42, 0.12)',
            zIndex: 50,
          }}
        >
          {listItems.map((row, idx) => {
            const label = row.type === 'custom' ? 'Custom description…' : row.option.description;
            const active = idx === hi;
            return (
              <li key={row.type === 'custom' ? '__custom__' : row.option.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setHighlight(idx)}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => pickIndex(idx)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    fontSize: 12,
                    border: 'none',
                    background: active ? '#f1f5f9' : '#fff',
                    color: '#334155',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

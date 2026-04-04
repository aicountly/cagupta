import React from 'react';

/**
 * Universal sub-filter bar for Registers page.
 *
 * Props:
 *   subFilters  — array from REGISTER_CONFIG[tab].subFilters
 *   filters     — { [filterKey]: value } current selections
 *   onChange    — (key, value) => void
 *   data        — full unfiltered data rows for the active tab (used for 'dynamic' option sets)
 */
export default function RegisterSubFilters({ subFilters = [], filters = {}, onChange, data = [] }) {
  if (!subFilters.length) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16, alignItems: 'center' }}>
      {subFilters.map(sf => {
        const current = filters[sf.key] ?? '__all__';

        // Build options list — static array or derived from data rows
        let options = sf.options;
        if (options === 'dynamic') {
          const unique = [...new Set(data.map(r => r[sf.dataKey]).filter(Boolean))].sort();
          options = [
            { value: '__all__', label: 'All' },
            ...unique.map(v => ({ value: v, label: v })),
          ];
        }

        return (
          <div key={sf.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={labelStyle}>{sf.label}:</span>
            {sf.type === 'pills' ? (
              <div style={{ display: 'flex', gap: 4 }}>
                {options.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => onChange(sf.key, opt.value)}
                    style={current === opt.value ? pillActive : pillInactive}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : (
              <select
                value={current}
                onChange={e => onChange(sf.key, e.target.value)}
                style={selectStyle}
              >
                {options.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}

const labelStyle = { fontSize: 12, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' };
const pillBase = { padding: '4px 12px', borderRadius: 20, border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s' };
const pillActive = { ...pillBase, background: '#2563eb', color: '#fff', border: '1px solid #2563eb' };
const pillInactive = { ...pillBase, background: '#f8fafc', color: '#475569' };
const selectStyle = { padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, color: '#334155', background: '#fff', cursor: 'pointer' };

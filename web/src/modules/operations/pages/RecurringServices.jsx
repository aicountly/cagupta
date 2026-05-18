import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  getRecurringServices,
  createRecurringService,
  updateRecurringService,
  deleteRecurringService,
  generatePeriods,
} from '../services/recurringServiceDefinitionService';
import { getCategories } from '../../../services/serviceCategoryService';
import { getContactsForSearch } from '../../../services/contactService';
import { getOrganizationsForSearch } from '../../../services/organizationService';
import DateInput from '../../../components/common/DateInput';

// ── Constants ─────────────────────────────────────────────────────────────────

const FREQUENCY_OPTIONS = [
  { value: 'monthly',     label: 'Monthly' },
  { value: 'quarterly',   label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-Yearly' },
  { value: 'annual',      label: 'Annual (FY)' },
];

const FREQ_LABEL = Object.fromEntries(FREQUENCY_OPTIONS.map(o => [o.value, o.label]));

const REGISTER_CATEGORIES = [
  { value: '',        label: 'All categories' },
  { value: 'gst',     label: 'GST' },
  { value: 'tds',     label: 'TDS' },
  { value: 'it',      label: 'Income Tax' },
  { value: 'roc',     label: 'ROC' },
  { value: 'pf',      label: 'PF/ESI' },
];

const CAT_LABEL = { gst: 'GST', tds: 'TDS', it: 'IT', roc: 'ROC', pf: 'PF/ESI', payment: 'Payments', '': '—' };

const EMPTY_FORM = {
  client_type:         'contact',   // 'contact' | 'organization'
  client_id:           '',
  organization_id:     '',
  engagement_type_id:  '',
  frequency:           'monthly',
  due_day:             '20',
  due_offset_months:   '0',
  return_type:         '',
  start_date:          '',
  end_date:            '',
  is_active:           true,
  notes:               '',
};

function pickSearchLabel(item) {
  if (!item || typeof item !== 'object') return 'Unknown';
  const n = item.displayName ?? item.name;
  const s = n != null ? String(n).trim() : '';
  return s || 'Unknown';
}

function formatLinkedOrgsSubtitle(names) {
  if (!Array.isArray(names) || names.length === 0) return '';
  const max = 3;
  const cleaned = names.map((x) => (x == null ? '' : String(x).trim())).filter(Boolean);
  if (cleaned.length === 0) return '';
  const part = cleaned.slice(0, max).join(', ');
  const tail = cleaned.length > max ? ', …' : '';
  return `Organizations: ${part}${tail}`;
}

// ── Multi-Client / Org search ─────────────────────────────────────────────────

function MultiClientOrgSearch({ clientType, selectedItems, onChange }) {
  const [q, setQ]             = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen]       = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    const fn = clientType === 'contact' ? getContactsForSearch : getOrganizationsForSearch;
    fn(q, 30)
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.data ?? data?.contacts ?? data?.organizations ?? []);
        setResults(list);
        setOpen(true);
      })
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, [q, clientType]);

  const selectedIds = new Set(selectedItems.map(i => String(i.id)));

  function toggleItem(item) {
    const id = String(item.id);
    if (selectedIds.has(id)) {
      onChange(selectedItems.filter(i => String(i.id) !== id));
    } else {
      onChange([...selectedItems, { id: item.id, name: pickSearchLabel(item) }]);
    }
  }

  function removeItem(id) {
    onChange(selectedItems.filter(i => String(i.id) !== String(id)));
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: selectedItems.length > 0 ? 8 : 0 }}>
        {selectedItems.map(item => (
          <span key={item.id} style={selectedChipStyle}>
            {item.name}
            <button type="button" onClick={() => removeItem(item.id)} style={chipRemoveStyle}>×</button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={clientType === 'contact' ? 'Search contacts to add…' : 'Search organisations to add…'}
        style={{ ...inputStyle, width: '100%' }}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {searching && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Searching…</div>
      )}
      {open && results.length > 0 && (
        <div style={dropdownStyle}>
          {results.map((r) => {
            const isSelected = selectedIds.has(String(r.id));
            const orgLine = clientType === 'contact' ? formatLinkedOrgsSubtitle(r.linkedOrgNames) : '';
            return (
              <div
                key={r.id}
                onMouseDown={() => toggleItem(r)}
                style={{ ...dropdownItemStyle, background: isSelected ? '#eff6ff' : undefined }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 3, border: '2px solid', borderColor: isSelected ? '#2563eb' : '#cbd5e1', background: isSelected ? '#2563eb' : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', flexShrink: 0 }}>
                    {isSelected ? '✓' : ''}
                  </span>
                  <div>
                    <span style={{ fontWeight: 600 }}>{pickSearchLabel(r)}</span>
                    {r.pan ? <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>{r.pan}</span> : null}
                    {r.gstin ? <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>{r.gstin}</span> : null}
                    {orgLine ? (
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, fontWeight: 400 }}>{orgLine}</div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {selectedItems.length > 0 && (
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
          {selectedItems.length} {clientType === 'contact' ? 'contact' : 'organisation'}{selectedItems.length !== 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
}

// Single client search (for edit mode)
function SingleClientOrgSearch({ clientType, clientId, orgId, onChange, presetLabel = '' }) {
  const [q, setQ]             = useState(presetLabel || '');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(() =>
    Boolean(presetLabel && (Number(clientId) > 0 || Number(orgId) > 0)),
  );
  const [open, setOpen]       = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    const fn = clientType === 'contact' ? getContactsForSearch : getOrganizationsForSearch;
    fn(q, 20)
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.data ?? data?.contacts ?? data?.organizations ?? []);
        setResults(list);
        setOpen(true);
      })
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, [q, clientType]);

  function handleSelect(item) {
    setSelected(true);
    setQ(pickSearchLabel(item));
    setOpen(false);
    if (clientType === 'contact') {
      onChange({ client_id: item.id, organization_id: '' });
    } else {
      onChange({ organization_id: item.id, client_id: '' });
    }
  }

  function handleClear() {
    setSelected(false);
    setQ('');
    onChange({ client_id: '', organization_id: '' });
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={q}
          onChange={e => { setQ(e.target.value); if (!e.target.value) handleClear(); }}
          placeholder={clientType === 'contact' ? 'Search contact/client…' : 'Search organisation…'}
          style={{ ...inputStyle, flex: 1 }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
        />
        {selected && (
          <button type="button" onClick={handleClear} style={clearBtnStyle}>✕</button>
        )}
      </div>
      {searching && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Searching…</div>
      )}
      {open && results.length > 0 && (
        <div style={dropdownStyle}>
          {results.map((r) => {
            const orgLine = clientType === 'contact' ? formatLinkedOrgsSubtitle(r.linkedOrgNames) : '';
            return (
              <div key={r.id} onMouseDown={() => handleSelect(r)} style={dropdownItemStyle}>
                <span style={{ fontWeight: 600 }}>{pickSearchLabel(r)}</span>
                {r.pan ? <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>{r.pan}</span> : null}
                {r.gstin ? <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>{r.gstin}</span> : null}
                {orgLine ? (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontWeight: 400 }}>{orgLine}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Cascading Service Catalog Selector ────────────────────────────────────────

function ServiceCatalogSelector({ categoryId, subcategoryId, engagementTypeId, onCategoryChange, onSubcategoryChange, onEngagementTypeChange }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    getCategories()
      .then(cats => setCategories(Array.isArray(cats) ? cats : []))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  }, []);

  const selectedCategory = categories.find(c => String(c.id) === String(categoryId));
  const subcategories = selectedCategory?.subcategories ?? [];
  const selectedSubcategory = subcategories.find(s => String(s.id) === String(subcategoryId));
  const engagementTypes = selectedSubcategory?.engagementTypes ?? [];

  if (loading) {
    return <div style={{ fontSize: 12, color: '#94a3b8' }}>Loading catalog…</div>;
  }

  return (
    <>
      <Field label="Category *">
        <select
          value={categoryId}
          onChange={e => { onCategoryChange(e.target.value); onSubcategoryChange(''); onEngagementTypeChange(''); }}
          style={inputStyle}
        >
          <option value="">Select category…</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>

      <Field label="Subcategory *">
        <select
          value={subcategoryId}
          onChange={e => { onSubcategoryChange(e.target.value); onEngagementTypeChange(''); }}
          style={inputStyle}
          disabled={!categoryId}
        >
          <option value="">{categoryId ? 'Select subcategory…' : '← Select a category first'}</option>
          {subcategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>

      <Field label="Engagement Type *">
        <select
          value={engagementTypeId}
          onChange={e => onEngagementTypeChange(e.target.value)}
          style={inputStyle}
          disabled={!subcategoryId}
        >
          <option value="">{subcategoryId ? 'Select engagement type…' : '← Select a subcategory first'}</option>
          {engagementTypes.map(et => (
            <option key={et.id} value={et.id}>{et.name}</option>
          ))}
        </select>
      </Field>
    </>
  );
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────

function RecurringServiceModal({ editDef, onClose, onSaved }) {
  const [form, setForm]     = useState(() => editDef ? defToForm(editDef) : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [saveProgress, setSaveProgress] = useState('');

  // Multi-client state (only for create mode)
  const [multiClients, setMultiClients] = useState([]);

  // Catalog cascade state
  const [categoryId, setCategoryId]       = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');

  function defToForm(d) {
    return {
      client_type:        d.client_id ? 'contact' : 'organization',
      client_id:          d.client_id           ?? '',
      organization_id:    d.organization_id      ?? '',
      engagement_type_id: d.engagement_type_id   ?? '',
      frequency:          d.frequency            ?? 'monthly',
      due_day:            String(d.due_day        ?? 20),
      due_offset_months:  String(d.due_offset_months ?? 0),
      return_type:        d.return_type          ?? '',
      start_date:         d.start_date           ?? '',
      end_date:           d.end_date             ?? '',
      is_active:          d.is_active            ?? true,
      notes:              d.notes                ?? '',
    };
  }

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleClientOrgChange(changes) {
    setForm(prev => ({ ...prev, ...changes }));
  }

  async function handleSave() {
    setError('');
    setSaveProgress('');
    if (!form.engagement_type_id) { setError('Please select an engagement type.'); return; }
    if (!form.start_date)         { setError('Start date is required.'); return; }

    const isEdit = Boolean(editDef);

    if (isEdit) {
      if (form.client_type === 'contact' && !form.client_id)       { setError('Please select a client/contact.'); return; }
      if (form.client_type === 'organization' && !form.organization_id) { setError('Please select an organisation.'); return; }
    } else {
      if (multiClients.length === 0) { setError('Please select at least one client/organisation.'); return; }
    }

    setSaving(true);
    try {
      if (isEdit) {
        const payload = {
          engagement_type_id: Number(form.engagement_type_id),
          client_id:          form.client_type === 'contact'      ? Number(form.client_id)      : null,
          organization_id:    form.client_type === 'organization' ? Number(form.organization_id): null,
          frequency:          form.frequency,
          due_day:            Number(form.due_day)           || 20,
          due_offset_months:  Number(form.due_offset_months) || 0,
          return_type:        form.return_type,
          start_date:         form.start_date,
          end_date:           form.end_date || null,
          is_active:          form.is_active,
          notes:              form.notes || null,
        };
        const result = await updateRecurringService(editDef.id, payload);
        onSaved(result);
      } else {
        // Bulk create for multiple clients
        const results = [];
        const errors = [];
        for (let i = 0; i < multiClients.length; i++) {
          const client = multiClients[i];
          setSaveProgress(`Creating ${i + 1} of ${multiClients.length}…`);
          const payload = {
            engagement_type_id: Number(form.engagement_type_id),
            client_id:          form.client_type === 'contact'      ? Number(client.id) : null,
            organization_id:    form.client_type === 'organization' ? Number(client.id) : null,
            frequency:          form.frequency,
            due_day:            Number(form.due_day)           || 20,
            due_offset_months:  Number(form.due_offset_months) || 0,
            return_type:        form.return_type,
            start_date:         form.start_date,
            end_date:           form.end_date || null,
            is_active:          form.is_active,
            notes:              form.notes || null,
          };
          try {
            const result = await createRecurringService(payload);
            results.push(result);
          } catch (e) {
            errors.push(`${client.name}: ${e.message || 'Failed'}`);
          }
        }
        if (errors.length > 0 && results.length === 0) {
          setError('All creations failed:\n' + errors.join('\n'));
          setSaveProgress('');
          setSaving(false);
          return;
        }
        if (errors.length > 0) {
          setError(`${results.length} created, ${errors.length} failed: ${errors.join('; ')}`);
        }
        onSaved(results.length === 1 ? results[0] : results[results.length - 1], results.length);
      }
    } catch (e) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
      setSaveProgress('');
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.25)', zIndex: 999 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, height: '100vh', width: 520,
        background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,.12)',
        zIndex: 1000, display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
            {editDef ? 'Edit Recurring Schedule' : 'New Recurring Schedule'}
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#94a3b8' }}>&times;</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {/* Client type toggle */}
          <Field label="Client Type">
            <div style={{ display: 'flex', gap: 8 }}>
              {['contact', 'organization'].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { set('client_type', t); set('client_id', ''); set('organization_id', ''); setMultiClients([]); }}
                  style={{
                    flex: 1, padding: '7px 0', border: '2px solid',
                    borderColor: form.client_type === t ? '#2563eb' : '#e2e8f0',
                    borderRadius: 7, fontSize: 13, fontWeight: 600,
                    background: form.client_type === t ? '#eff6ff' : '#f8fafc',
                    color: form.client_type === t ? '#1d4ed8' : '#64748b',
                    cursor: 'pointer',
                  }}
                >
                  {t === 'contact' ? 'Contact' : 'Organisation'}
                </button>
              ))}
            </div>
          </Field>

          {/* Client / Org search — multi for create, single for edit */}
          <Field label={editDef
            ? (form.client_type === 'contact' ? 'Contact / Client' : 'Organisation')
            : (form.client_type === 'contact' ? 'Contacts / Clients (multi-select)' : 'Organisations (multi-select)')
          }>
            {editDef ? (
              <SingleClientOrgSearch
                key={`${editDef.id}-${form.client_type}`}
                clientType={form.client_type}
                clientId={form.client_id}
                orgId={form.organization_id}
                onChange={handleClientOrgChange}
                presetLabel={
                  editDef &&
                  ((form.client_type === 'contact' && editDef.client_id) ||
                    (form.client_type === 'organization' && editDef.organization_id))
                    ? (editDef.client_name || '')
                    : ''
                }
              />
            ) : (
              <MultiClientOrgSearch
                key={form.client_type}
                clientType={form.client_type}
                selectedItems={multiClients}
                onChange={setMultiClients}
              />
            )}
          </Field>

          {/* Service Catalog — Category / Subcategory / Engagement Type */}
          <ServiceCatalogSelector
            categoryId={categoryId}
            subcategoryId={subcategoryId}
            engagementTypeId={form.engagement_type_id}
            onCategoryChange={setCategoryId}
            onSubcategoryChange={setSubcategoryId}
            onEngagementTypeChange={v => set('engagement_type_id', v)}
          />

          {/* Return type label */}
          <Field label="Return Type Label (e.g. GSTR-3B, 26Q, ITR-6)">
            <input
              type="text"
              value={form.return_type}
              onChange={e => set('return_type', e.target.value)}
              style={inputStyle}
              placeholder="e.g. GSTR-3B"
            />
          </Field>

          {/* Frequency */}
          <Field label="Frequency *">
            <select value={form.frequency} onChange={e => set('frequency', e.target.value)} style={inputStyle}>
              {FREQUENCY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          {/* Due day + offset */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="Due Day (of month)">
                <input
                  type="number"
                  value={form.due_day}
                  onChange={e => set('due_day', e.target.value)}
                  style={inputStyle}
                  min="1" max="31"
                />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Months after period end">
                <input
                  type="number"
                  value={form.due_offset_months}
                  onChange={e => set('due_offset_months', e.target.value)}
                  style={inputStyle}
                  min="0" max="12"
                />
              </Field>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: -10, marginBottom: 14 }}>
            <strong>Example:</strong> GSTR-3B is due on the 20th of the <em>same</em> month (due_day=20, offset=0).&nbsp;
            TDS 26Q for Q4 is due 31 May (due_day=31, offset=2).
          </div>

          {/* Dates */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="Starts From *">
                <DateInput value={form.start_date} onChange={e => set('start_date', e.target.value)} style={inputStyle} />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Ends On (blank = indefinite)">
                <DateInput value={form.end_date} onChange={e => set('end_date', e.target.value)} style={inputStyle} />
              </Field>
            </div>
          </div>

          {/* Active toggle */}
          <Field label="">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => set('is_active', e.target.checked)}
                style={{ width: 15, height: 15 }}
              />
              <span style={{ fontWeight: 600, color: '#334155' }}>Active (will generate upcoming periods)</span>
            </label>
          </Field>

          {/* Notes */}
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Optional internal notes"
            />
          </Field>

          {error && (
            <div style={{ padding: '10px 12px', background: '#fef2f2', color: '#dc2626', borderRadius: 6, fontSize: 13, whiteSpace: 'pre-wrap' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
          {saveProgress && <span style={{ fontSize: 12, color: '#64748b', marginRight: 'auto' }}>{saveProgress}</span>}
          <button type="button" onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} style={saveBtnStyle(saving)}>
            {saving ? 'Saving…' : editDef ? 'Save Changes' : multiClients.length > 1 ? `Create ${multiClients.length} Schedules` : 'Create Schedule'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Generate confirm ──────────────────────────────────────────────────────────

function GenerateModal({ def, onClose, onDone }) {
  const defaultDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [upTo, setUpTo]       = useState(defaultDate);
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState('');

  async function handleGenerate() {
    setRunning(true);
    setError('');
    try {
      const res = await generatePeriods(def.id, upTo);
      setResult(res);
      onDone(res);
    } catch (e) {
      setError(e.message || 'Failed to generate periods');
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 1100 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        background: '#fff', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,.18)',
        zIndex: 1101, width: 400, padding: 28,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
          Generate Register Periods
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 18 }}>
          <strong>{def.client_name}</strong> &mdash; {def.return_type || def.engagement_type_name} ({FREQ_LABEL[def.frequency]})
          <br />Creates pending register rows for all missing periods up to the selected date.
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
          Generate up to
        </label>
        <DateInput value={upTo} onChange={e => setUpTo(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />

        {result && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: '#f0fdf4', color: '#16a34a', borderRadius: 7, fontSize: 13, fontWeight: 600 }}>
            ✅ {result.inserted} period{result.inserted !== 1 ? 's' : ''} created (up to {result.up_to_date})
          </div>
        )}
        {error && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: '#fef2f2', color: '#dc2626', borderRadius: 7, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" onClick={onClose} style={cancelBtnStyle}>Close</button>
          {!result && (
            <button type="button" onClick={handleGenerate} disabled={running} style={saveBtnStyle(running)}>
              {running ? 'Generating…' : 'Generate'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RecurringServices() {
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(1);
  const [lastPage, setLastPage]     = useState(1);
  const [total, setTotal]           = useState(0);

  // Filters
  const [filterSearch, setFilterSearch] = useState('');
  const [filterCat, setFilterCat]       = useState('');
  const [filterFreq, setFilterFreq]     = useState('');
  const [filterActive, setFilterActive] = useState('');

  // Modals
  const [showAdd, setShowAdd]         = useState(false);
  const [editDef, setEditDef]         = useState(null);
  const [generateDef, setGenerateDef] = useState(null);

  // Delete confirm
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (pg = 1, reset = false) => {
    setLoading(true);
    try {
      const params = { page: pg, per_page: 50 };
      if (filterSearch)  params.search            = filterSearch;
      if (filterCat)     params.register_category = filterCat;
      if (filterFreq)    params.frequency         = filterFreq;
      if (filterActive !== '') params.is_active   = filterActive === 'active';

      const { rows: newRows, pagination } = await getRecurringServices(params);
      setRows(prev => (pg === 1 || reset) ? newRows : [...prev, ...newRows]);
      setLastPage(pagination.last_page || 1);
      setTotal(pagination.total || 0);
    } catch {
      if (pg === 1) setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filterSearch, filterCat, filterFreq, filterActive]);

  useEffect(() => {
    setPage(1);
    load(1, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSearch, filterCat, filterFreq, filterActive]);

  useEffect(() => {
    if (page === 1) return;
    load(page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function handleToggleActive(def) {
    try {
      const updated = await updateRecurringService(def.id, { is_active: !def.is_active });
      setRows(prev => prev.map(r => r.id === def.id ? { ...r, ...(updated || {}), is_active: !def.is_active } : r));
    } catch (e) {
      alert('Failed to toggle: ' + e.message);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteRecurringService(deleteId);
      setRows(prev => prev.filter(r => r.id !== deleteId));
      setDeleteId(null);
    } catch (e) {
      alert('Failed to delete: ' + e.message);
    } finally {
      setDeleting(false);
    }
  }

  function handleSaved(def, bulkCount) {
    if (!def) return;
    setShowAdd(false);
    setEditDef(null);
    if (bulkCount && bulkCount > 1) {
      // Bulk creation — reload the list
      load(1, true);
    } else {
      setRows(prev => {
        const idx = prev.findIndex(r => r.id === def.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx]  = def;
          return next;
        }
        return [def, ...prev];
      });
    }
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Recurring Services</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Define per-client compliance schedules (GSTR-3B, 26Q, ITR, etc.) to auto-generate register due-date rows.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          style={{ padding: '9px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          + Add Schedule
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search client, return type…"
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          style={{ ...inputStyle, width: 220 }}
        />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...inputStyle, width: 140 }}>
          {REGISTER_CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <select value={filterFreq} onChange={e => setFilterFreq(e.target.value)} style={{ ...inputStyle, width: 140 }}>
          <option value="">All frequencies</option>
          {FREQUENCY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select value={filterActive} onChange={e => setFilterActive(e.target.value)} style={{ ...inputStyle, width: 120 }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        {(filterSearch || filterCat || filterFreq || filterActive) && (
          <button
            type="button"
            onClick={() => { setFilterSearch(''); setFilterCat(''); setFilterFreq(''); setFilterActive(''); }}
            style={{ padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer' }}
          >
            Clear filters
          </button>
        )}
        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>
          {total} schedule{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div style={cardStyle}>
        {loading && rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading schedules…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 52, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔁</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
              No recurring schedules yet
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 380, margin: '0 auto 16px' }}>
              Create a schedule for a client and engagement type (e.g. GSTR-3B monthly for Sunita Enterprises).
              Then click <strong>Generate</strong> to create all pending register rows up to a target date.
            </div>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              style={{ padding: '9px 22px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              + Add your first schedule
            </button>
          </div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Client / Organisation</th>
                <th style={thStyle}>Engagement Type</th>
                <th style={thStyle}>Return</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Frequency</th>
                <th style={thStyle}>Due Rule</th>
                <th style={thStyle}>From</th>
                <th style={thStyle}>Until</th>
                <th style={thStyle}>Active</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ ...trStyle, opacity: r.is_active ? 1 : 0.55 }}>
                  <td style={tdStyle}>
                    {Number(r.client_id) > 0 ? (
                      <Link
                        to={`/clients/contacts/${Number(r.client_id)}/edit`}
                        style={{ fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}
                      >
                        {r.client_name || '—'}
                      </Link>
                    ) : Number(r.organization_id) > 0 ? (
                      <Link
                        to={`/clients/organizations/${Number(r.organization_id)}/edit`}
                        style={{ fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}
                      >
                        {r.client_name || '—'}
                      </Link>
                    ) : (
                      <span style={{ fontWeight: 600 }}>{r.client_name || '—'}</span>
                    )}
                  </td>
                  <td style={tdStyle}>{r.engagement_type_name || '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{r.return_type || '—'}</td>
                  <td style={tdStyle}>
                    {r.register_category ? (
                      <span style={catBadgeStyle(r.register_category)}>
                        {CAT_LABEL[r.register_category] || r.register_category}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={tdStyle}>{FREQ_LABEL[r.frequency] || r.frequency}</td>
                  <td style={{ ...tdStyle, fontSize: 12, color: '#64748b' }}>
                    Day {r.due_day}
                    {r.due_offset_months > 0 ? ` (+${r.due_offset_months}m)` : ''}
                  </td>
                  <td style={tdStyle}>{r.start_date || '—'}</td>
                  <td style={{ ...tdStyle, color: '#94a3b8', fontSize: 12 }}>{r.end_date || 'Indefinite'}</td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(r)}
                      title={r.is_active ? 'Click to deactivate' : 'Click to activate'}
                      style={{
                        padding: '3px 10px', borderRadius: 12, border: 'none', cursor: 'pointer',
                        fontSize: 11, fontWeight: 700,
                        background: r.is_active ? '#dcfce7' : '#f1f5f9',
                        color:      r.is_active ? '#16a34a' : '#94a3b8',
                      }}
                    >
                      {r.is_active ? '● Active' : '○ Inactive'}
                    </button>
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => setGenerateDef(r)}
                        style={actionBtnStyle('#0ea5e9', '#e0f2fe')}
                        title="Generate register periods"
                      >
                        ⚡ Generate
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditDef(r)}
                        style={actionBtnStyle('#6366f1', '#eef2ff')}
                        title="Edit schedule"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId(r.id)}
                        style={actionBtnStyle('#dc2626', '#fef2f2')}
                        title="Delete schedule"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {page < lastPage && !loading && (
          <div style={{ padding: 16, textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
            <button
              type="button"
              onClick={() => setPage(p => p + 1)}
              style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Load more
            </button>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {(showAdd || editDef) && (
        <RecurringServiceModal
          editDef={editDef}
          onClose={() => { setShowAdd(false); setEditDef(null); }}
          onSaved={handleSaved}
        />
      )}

      {/* Generate modal */}
      {generateDef && (
        <GenerateModal
          def={generateDef}
          onClose={() => setGenerateDef(null)}
          onDone={() => {}}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <>
          <div onClick={() => setDeleteId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 1100 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: '#fff', borderRadius: 12, zIndex: 1101, padding: 28, width: 360,
            boxShadow: '0 8px 40px rgba(0,0,0,.18)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>Delete schedule?</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              This will permanently delete the recurring schedule. Existing register rows created from this schedule will be kept.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setDeleteId(null)} style={cancelBtnStyle}>Cancel</button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                style={{ ...saveBtnStyle(deleting), background: deleting ? '#fca5a5' : '#dc2626' }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Shared Field wrapper ──────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5 }}>
          {label}
        </label>
      )}
      {children}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle = {
  padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
  fontSize: 13, color: '#334155', background: '#fff',
};

const cancelBtnStyle = {
  padding: '8px 18px', background: '#f8fafc', border: '1px solid #e2e8f0',
  borderRadius: 7, fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer',
};

const saveBtnStyle = disabled => ({
  padding: '8px 22px', background: disabled ? '#93c5fd' : '#2563eb',
  border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600,
  color: '#fff', cursor: disabled ? 'wait' : 'pointer',
});

const actionBtnStyle = (color, bg) => ({
  padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
  fontSize: 11, fontWeight: 700, background: bg, color,
});

const catBadgeStyle = cat => {
  const colors = {
    gst: ['#0369a1', '#e0f2fe'],
    tds: ['#7c3aed', '#ede9fe'],
    it:  ['#b45309', '#fef3c7'],
    roc: ['#0f766e', '#ccfbf1'],
    pf:  ['#be185d', '#fce7f3'],
  };
  const [fg, bg] = colors[cat] || ['#475569', '#f1f5f9'];
  return {
    padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
    background: bg, color: fg,
  };
};

const dropdownStyle = {
  position: 'absolute', top: '100%', left: 0, right: 0,
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 7,
  boxShadow: '0 4px 12px rgba(0,0,0,.1)', zIndex: 100, maxHeight: 220, overflowY: 'auto',
};

const dropdownItemStyle = {
  padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: '#334155',
  borderBottom: '1px solid #f8fafc',
  ':hover': { background: '#f8fafc' },
};

const selectedChipStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '3px 8px', background: '#eff6ff', border: '1px solid #bfdbfe',
  borderRadius: 12, fontSize: 12, fontWeight: 600, color: '#1d4ed8',
};

const chipRemoveStyle = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#64748b', fontSize: 14, padding: 0, lineHeight: 1,
};

const clearBtnStyle = {
  padding: '0 10px', background: '#f8fafc', border: '1px solid #e2e8f0',
  borderRadius: 6, fontSize: 14, color: '#64748b', cursor: 'pointer',
};

const cardStyle = {
  background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,.08)', overflow: 'auto',
};

const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };

const thStyle = {
  textAlign: 'left', padding: '10px 12px', color: '#64748b', fontWeight: 600,
  fontSize: 12, borderBottom: '2px solid #f1f5f9', background: '#f8fafc', whiteSpace: 'nowrap',
};

const tdStyle = { padding: '10px 12px', color: '#334155', verticalAlign: 'middle' };
const trStyle = { borderBottom: '1px solid #f8fafc' };

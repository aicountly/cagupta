import {
  PRICING_MODELS,
  FEE_TYPES,
  computeTotal,
  pricingModelLabel,
  feeTypeLabel,
  normalizeAdditionalItem,
} from '../../utils/quotationPricing';

const inputStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 12,
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle = { fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 4 };

function NumInput({ value, onChange, placeholder, disabled, width = '100%' }) {
  return (
    <input
      type="number"
      min="0"
      step="0.01"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{ ...inputStyle, width }}
    />
  );
}

function AdditionalItemRow({
  item,
  index,
  mode,
  disabled,
  onChange,
  onRemove,
}) {
  const feeType = item.fee_type || FEE_TYPES.FIXED;
  const showFixed = feeType === FEE_TYPES.FIXED || feeType === FEE_TYPES.BOTH;
  const showHourly = feeType === FEE_TYPES.HOURLY || feeType === FEE_TYPES.BOTH;

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 10, marginBottom: 8, background: '#fafafa' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 140px' }}>
          <label style={labelStyle}>Event label</label>
          <input
            type="text"
            value={item.label || ''}
            disabled={disabled}
            onChange={(e) => onChange(index, { ...item, label: e.target.value })}
            style={inputStyle}
            placeholder="e.g. GST scrutiny notice"
          />
        </div>
        <div style={{ flex: '0 0 130px' }}>
          <label style={labelStyle}>Fee type</label>
          <select
            value={feeType}
            disabled={disabled}
            onChange={(e) => onChange(index, { ...item, fee_type: e.target.value })}
            style={inputStyle}
          >
            <option value={FEE_TYPES.FIXED}>{feeTypeLabel(FEE_TYPES.FIXED)}</option>
            <option value={FEE_TYPES.HOURLY}>{feeTypeLabel(FEE_TYPES.HOURLY)}</option>
            <option value={FEE_TYPES.BOTH}>{feeTypeLabel(FEE_TYPES.BOTH)}</option>
          </select>
        </div>
        {showFixed && (
          <div style={{ flex: '0 0 100px' }}>
            <label style={labelStyle}>Fixed ₹</label>
            <NumInput
              value={item.fixed_amount ?? ''}
              disabled={disabled}
              onChange={(v) => onChange(index, { ...item, fixed_amount: v })}
            />
          </div>
        )}
        {showHourly && (
          <>
            <div style={{ flex: '0 0 100px' }}>
              <label style={labelStyle}>Rate ₹/hr</label>
              <NumInput
                value={item.hourly_rate ?? ''}
                disabled={disabled}
                onChange={(v) => onChange(index, { ...item, hourly_rate: v })}
              />
            </div>
            {mode === 'quotation' && (
              <div style={{ flex: '0 0 88px' }}>
                <label style={labelStyle}>Hours</label>
                <NumInput
                  value={item.estimated_hours ?? ''}
                  disabled={disabled}
                  onChange={(v) => onChange(index, { ...item, estimated_hours: v })}
                />
              </div>
            )}
          </>
        )}
        {mode === 'quotation' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#475569', flex: '0 0 auto', paddingBottom: 6 }}>
            <input
              type="checkbox"
              checked={item.include_in_share !== false}
              disabled={disabled}
              onChange={(e) => onChange(index, { ...item, include_in_share: e.target.checked })}
            />
            Include in quote
          </label>
        )}
        {!disabled && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, padding: '4px 6px' }}
            title="Remove"
          >
            ✕
          </button>
        )}
      </div>
      {item.is_custom && mode === 'quotation' && (
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Custom event (this quotation only)</div>
      )}
    </div>
  );
}

/**
 * @param {{ mode: 'config' | 'quotation', value: object, onChange: function, disabled?: boolean }} props
 */
export default function QuotationPricingEditor({ mode = 'quotation', value, onChange, disabled = false }) {
  const snapshot = value || {};
  const model = snapshot.pricing_model || PRICING_MODELS.FIXED;
  const items = snapshot.additional_items || [];

  function patch(fields) {
    onChange({ ...snapshot, ...fields });
  }

  function setModel(nextModel) {
    const next = { ...snapshot, pricing_model: nextModel };
    if (nextModel !== PRICING_MODELS.FIXED_PLUS) {
      next.additional_items = [];
    }
    onChange(next);
  }

  function updateItem(index, item) {
    const next = [...items];
    next[index] = normalizeAdditionalItem(item);
    patch({ additional_items: next });
  }

  function removeItem(index) {
    patch({ additional_items: items.filter((_, i) => i !== index) });
  }

  function addItem(isCustom = false) {
    patch({
      additional_items: [
        ...items,
        normalizeAdditionalItem({
          label: '',
          fee_type: FEE_TYPES.FIXED,
          fixed_amount: null,
          hourly_rate: null,
          estimated_hours: null,
          include_in_share: !isCustom,
          is_custom: isCustom,
        }),
      ],
    });
  }

  const total = computeTotal(snapshot);

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Pricing model</label>
        <select
          value={model}
          disabled={disabled || mode === 'quotation'}
          onChange={(e) => setModel(e.target.value)}
          style={inputStyle}
        >
          <option value={PRICING_MODELS.FIXED}>{pricingModelLabel(PRICING_MODELS.FIXED)}</option>
          <option value={PRICING_MODELS.PER_HOUR}>{pricingModelLabel(PRICING_MODELS.PER_HOUR)}</option>
          <option value={PRICING_MODELS.FIXED_PLUS}>{pricingModelLabel(PRICING_MODELS.FIXED_PLUS)}</option>
        </select>
      </div>

      {(model === PRICING_MODELS.FIXED || model === PRICING_MODELS.FIXED_PLUS) && (
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>{model === PRICING_MODELS.FIXED ? 'Fee (₹)' : 'Base fee (₹)'}</label>
          <NumInput
            value={snapshot.base_amount ?? ''}
            disabled={disabled}
            onChange={(v) => patch({ base_amount: v === '' ? null : Number(v) })}
          />
        </div>
      )}

      {model === PRICING_MODELS.PER_HOUR && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 100 }}>
            <label style={labelStyle}>Hourly rate (₹)</label>
            <NumInput
              value={snapshot.hourly_rate ?? ''}
              disabled={disabled}
              onChange={(v) => patch({ hourly_rate: v === '' ? null : Number(v) })}
            />
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <label style={labelStyle}>Estimated hours</label>
            <NumInput
              value={snapshot.estimated_hours ?? ''}
              disabled={disabled}
              onChange={(v) => patch({ estimated_hours: v === '' ? null : Number(v) })}
            />
          </div>
        </div>
      )}

      {model === PRICING_MODELS.FIXED_PLUS && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>Additional events (if they occur)</span>
            {!disabled && mode === 'config' && (
              <button
                type="button"
                onClick={() => addItem(false)}
                style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 4, background: '#fff', cursor: 'pointer' }}
              >
                + Add event
              </button>
            )}
          </div>
          {items.length === 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>No additional events defined.</div>
          )}
          {items.map((item, i) => (
            <AdditionalItemRow
              key={`${item.template_id || 'c'}-${i}`}
              item={item}
              index={i}
              mode={mode}
              disabled={disabled}
              onChange={updateItem}
              onRemove={removeItem}
            />
          ))}
          {!disabled && mode === 'quotation' && (
            <button
              type="button"
              onClick={() => addItem(true)}
              style={{ fontSize: 11, padding: '4px 10px', border: '1px dashed #94a3b8', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#475569' }}
            >
              + Add custom event
            </button>
          )}
        </div>
      )}

      {total != null && (
        <div style={{ padding: '8px 10px', background: '#f0f9ff', borderRadius: 6, fontSize: 12, color: '#0369a1', fontWeight: 600 }}>
          Quoted total{model === PRICING_MODELS.FIXED_PLUS ? ' (included items)' : ''}: ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      )}
    </div>
  );
}

import {
  PRICING_MODELS,
  FEE_TYPES,
  pricingModelLabel,
  feeTypeLabel,
  computeTotal,
  snapshotFromDraftFields,
} from '../../utils/quotationPricing';

const inputStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  padding: '4px 6px',
  fontSize: 11,
  boxSizing: 'border-box',
};

const labelStyle = { fontSize: 10, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 };

function emptyTemplate() {
  return { label: '', fee_type: FEE_TYPES.FIXED, fixed_amount: '', hourly_rate: '' };
}

/**
 * Settings-row editor for engagement type quotation pricing (string draft values).
 */
export default function EngagementTypePricingConfig({ draft, onChange, disabled }) {
  const d = draft || {
    pricing_model: PRICING_MODELS.FIXED,
    base_amount: '',
    hourly_rate: '',
    estimated_hours: '',
    standard_fee: '',
    standard_hours: '',
    additional_templates: [],
  };

  function patch(fields) {
    onChange({ ...d, ...fields });
  }

  function setModel(model) {
    const next = { ...d, pricing_model: model };
    if (model !== PRICING_MODELS.FIXED_PLUS) {
      next.additional_templates = [];
    }
    onChange(next);
  }

  function updateTemplate(i, t) {
    const next = [...(d.additional_templates || [])];
    next[i] = t;
    patch({ additional_templates: next });
  }

  const total = computeTotal(snapshotFromDraftFields(d));

  return (
    <div style={{ marginTop: 8, padding: '8px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Quotation pricing
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={labelStyle}>
          Model
          <select
            value={d.pricing_model || PRICING_MODELS.FIXED}
            disabled={disabled}
            onChange={(e) => setModel(e.target.value)}
            style={{ ...inputStyle, width: 130 }}
          >
            <option value={PRICING_MODELS.FIXED}>{pricingModelLabel(PRICING_MODELS.FIXED)}</option>
            <option value={PRICING_MODELS.PER_HOUR}>{pricingModelLabel(PRICING_MODELS.PER_HOUR)}</option>
            <option value={PRICING_MODELS.FIXED_PLUS}>{pricingModelLabel(PRICING_MODELS.FIXED_PLUS)}</option>
          </select>
        </label>

        {(d.pricing_model === PRICING_MODELS.FIXED || d.pricing_model === PRICING_MODELS.FIXED_PLUS || !d.pricing_model) && (
          <label style={labelStyle}>
            {d.pricing_model === PRICING_MODELS.FIXED_PLUS ? 'Base ₹' : 'Fee ₹'}
            <input
              type="number"
              min="0"
              step="0.01"
              disabled={disabled}
              value={d.base_amount || ''}
              onChange={(e) => patch({ base_amount: e.target.value })}
              style={{ ...inputStyle, width: 90 }}
              placeholder="—"
            />
          </label>
        )}

        {d.pricing_model === PRICING_MODELS.PER_HOUR && (
          <>
            <label style={labelStyle}>
              Rate ₹/hr
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={disabled}
                value={d.hourly_rate || ''}
                onChange={(e) => patch({ hourly_rate: e.target.value })}
                style={{ ...inputStyle, width: 90 }}
                placeholder="—"
              />
            </label>
            <label style={labelStyle}>
              Est. hours
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={disabled}
                value={d.estimated_hours || ''}
                onChange={(e) => patch({ estimated_hours: e.target.value })}
                style={{ ...inputStyle, width: 72 }}
                placeholder="—"
              />
            </label>
          </>
        )}
      </div>

      {d.pricing_model === PRICING_MODELS.FIXED_PLUS && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: '#64748b' }}>Additional events (conditional)</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => patch({ additional_templates: [...(d.additional_templates || []), emptyTemplate()] })}
                style={{ fontSize: 10, padding: '2px 6px', border: '1px solid #cbd5e1', borderRadius: 4, background: '#fff', cursor: 'pointer' }}
              >
                + Event
              </button>
            )}
          </div>
          {(d.additional_templates || []).map((t, i) => {
            const ft = t.fee_type || FEE_TYPES.FIXED;
            return (
              <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                <input
                  type="text"
                  disabled={disabled}
                  value={t.label || ''}
                  placeholder="Event label"
                  onChange={(e) => updateTemplate(i, { ...t, label: e.target.value })}
                  style={{ ...inputStyle, flex: '1 1 100px', minWidth: 80 }}
                />
                <select
                  disabled={disabled}
                  value={ft}
                  onChange={(e) => updateTemplate(i, { ...t, fee_type: e.target.value })}
                  style={{ ...inputStyle, width: 110 }}
                >
                  <option value={FEE_TYPES.FIXED}>{feeTypeLabel(FEE_TYPES.FIXED)}</option>
                  <option value={FEE_TYPES.HOURLY}>{feeTypeLabel(FEE_TYPES.HOURLY)}</option>
                  <option value={FEE_TYPES.BOTH}>{feeTypeLabel(FEE_TYPES.BOTH)}</option>
                </select>
                {(ft === FEE_TYPES.FIXED || ft === FEE_TYPES.BOTH) && (
                  <input
                    type="number"
                    min="0"
                    disabled={disabled}
                    value={t.fixed_amount || ''}
                    placeholder="Fixed ₹"
                    onChange={(e) => updateTemplate(i, { ...t, fixed_amount: e.target.value })}
                    style={{ ...inputStyle, width: 72 }}
                  />
                )}
                {(ft === FEE_TYPES.HOURLY || ft === FEE_TYPES.BOTH) && (
                  <input
                    type="number"
                    min="0"
                    disabled={disabled}
                    value={t.hourly_rate || ''}
                    placeholder="₹/hr"
                    onChange={(e) => updateTemplate(i, { ...t, hourly_rate: e.target.value })}
                    style={{ ...inputStyle, width: 72 }}
                  />
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => patch({ additional_templates: d.additional_templates.filter((_, j) => j !== i) })}
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 11 }}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {total != null && (
        <div style={{ fontSize: 10, color: '#0369a1', marginBottom: 6 }}>
          Preview total: ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      )}

      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 4, marginTop: 4 }}>Invoice variance benchmark</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <label style={labelStyle}>
          Std fee ₹
          <input
            type="number"
            min="0"
            step="0.01"
            disabled={disabled}
            value={d.standard_fee || ''}
            onChange={(e) => patch({ standard_fee: e.target.value })}
            style={{ ...inputStyle, width: 90 }}
            placeholder="—"
          />
        </label>
        <label style={labelStyle}>
          Std hours
          <input
            type="number"
            min="0"
            step="0.01"
            disabled={disabled}
            value={d.standard_hours || ''}
            onChange={(e) => patch({ standard_hours: e.target.value })}
            style={{ ...inputStyle, width: 72 }}
            placeholder="—"
          />
        </label>
      </div>
    </div>
  );
}

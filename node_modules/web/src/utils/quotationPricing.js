export const PRICING_MODELS = {
  FIXED: 'fixed',
  PER_HOUR: 'per_hour',
  FIXED_PLUS: 'fixed_plus_additional',
};

export const FEE_TYPES = {
  FIXED: 'fixed_per_event',
  HOURLY: 'per_hour',
  BOTH: 'both',
};

export function emptySnapshot() {
  return {
    pricing_model: PRICING_MODELS.FIXED,
    base_amount: null,
    hourly_rate: null,
    estimated_hours: null,
    additional_items: [],
  };
}

export function nullableNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function normalizeSnapshot(raw, legacyPrice = null) {
  if (!raw || typeof raw !== 'object' || Object.keys(raw).length === 0) {
    if (legacyPrice != null && Number(legacyPrice) > 0) {
      return {
        pricing_model: PRICING_MODELS.FIXED,
        base_amount: Number(legacyPrice),
        hourly_rate: null,
        estimated_hours: null,
        additional_items: [],
      };
    }
    return emptySnapshot();
  }

  const model = Object.values(PRICING_MODELS).includes(raw.pricing_model)
    ? raw.pricing_model
    : PRICING_MODELS.FIXED;

  const items = Array.isArray(raw.additional_items)
    ? raw.additional_items.map(normalizeAdditionalItem)
    : [];

  return {
    pricing_model: model,
    base_amount: nullableNum(raw.base_amount),
    hourly_rate: nullableNum(raw.hourly_rate),
    estimated_hours: nullableNum(raw.estimated_hours),
    additional_items: items,
  };
}

export function normalizeAdditionalItem(item) {
  return {
    template_id: item.template_id != null && item.template_id !== '' ? Number(item.template_id) : null,
    label: String(item.label || '').trim(),
    fee_type: Object.values(FEE_TYPES).includes(item.fee_type) ? item.fee_type : FEE_TYPES.FIXED,
    fixed_amount: nullableNum(item.fixed_amount),
    hourly_rate: nullableNum(item.hourly_rate),
    estimated_hours: nullableNum(item.estimated_hours),
    include_in_share: item.include_in_share !== false,
    is_custom: Boolean(item.is_custom),
  };
}

export function templateToSnapshotItem(t) {
  return normalizeAdditionalItem({
    template_id: t.id,
    label: t.label,
    fee_type: t.fee_type,
    fixed_amount: t.fixed_amount,
    hourly_rate: t.hourly_rate,
    estimated_hours: t.estimated_hours,
    include_in_share: true,
    is_custom: false,
  });
}

export function buildSnapshotFromEngagementType(et, templates = []) {
  const model = et?.pricing_model || PRICING_MODELS.FIXED;
  const snapshot = {
    pricing_model: model,
    base_amount: nullableNum(et?.quotation_base_amount),
    hourly_rate: nullableNum(et?.quotation_hourly_rate),
    estimated_hours: nullableNum(et?.quotation_estimated_hours),
    additional_items: [],
  };
  if (model === PRICING_MODELS.FIXED_PLUS) {
    snapshot.additional_items = (templates || []).map(templateToSnapshotItem);
  }
  return snapshot;
}

export function computeAdditionalItemAmount(item) {
  let amount = 0;
  let has = false;
  const feeType = item.fee_type || FEE_TYPES.FIXED;

  if (feeType === FEE_TYPES.FIXED || feeType === FEE_TYPES.BOTH) {
    const fixed = nullableNum(item.fixed_amount);
    if (fixed != null && fixed > 0) {
      amount += fixed;
      has = true;
    }
  }
  if (feeType === FEE_TYPES.HOURLY || feeType === FEE_TYPES.BOTH) {
    const rate = nullableNum(item.hourly_rate);
    const hours = nullableNum(item.estimated_hours);
    if (rate != null && rate > 0 && hours != null && hours > 0) {
      amount += rate * hours;
      has = true;
    }
  }
  return has ? Math.round(amount * 100) / 100 : null;
}

export function computeTotal(snapshot) {
  if (!snapshot) return null;
  const model = snapshot.pricing_model || PRICING_MODELS.FIXED;

  if (model === PRICING_MODELS.FIXED) {
    const base = nullableNum(snapshot.base_amount);
    return base != null && base > 0 ? Math.round(base * 100) / 100 : null;
  }

  if (model === PRICING_MODELS.PER_HOUR) {
    const rate = nullableNum(snapshot.hourly_rate);
    const hours = nullableNum(snapshot.estimated_hours);
    if (rate != null && rate > 0 && hours != null && hours > 0) {
      return Math.round(rate * hours * 100) / 100;
    }
    return null;
  }

  if (model === PRICING_MODELS.FIXED_PLUS) {
    let total = 0;
    let has = false;
    const base = nullableNum(snapshot.base_amount);
    if (base != null && base > 0) {
      total += base;
      has = true;
    }
    for (const item of snapshot.additional_items || []) {
      if (!item.include_in_share) continue;
      const itemAmt = computeAdditionalItemAmount(item);
      if (itemAmt != null && itemAmt > 0) {
        total += itemAmt;
        has = true;
      }
    }
    return has ? Math.round(total * 100) / 100 : null;
  }

  return null;
}

function fmtCurrency(v) {
  if (v == null) return '—';
  return `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function describeAdditionalItem(item) {
  const parts = [];
  const feeType = item.fee_type || FEE_TYPES.FIXED;
  if (feeType === FEE_TYPES.FIXED || feeType === FEE_TYPES.BOTH) {
    const fixed = nullableNum(item.fixed_amount);
    if (fixed != null && fixed > 0) parts.push(`${fmtCurrency(fixed)} per event`);
  }
  if (feeType === FEE_TYPES.HOURLY || feeType === FEE_TYPES.BOTH) {
    const rate = nullableNum(item.hourly_rate);
    if (rate != null && rate > 0) parts.push(`${fmtCurrency(rate)}/hr`);
  }
  return parts.join(' + ');
}

export function formatShareText(contactName, snapshot, docs = []) {
  const lines = [`Quotation for ${contactName}`, ''];
  const model = snapshot?.pricing_model || PRICING_MODELS.FIXED;

  if (model === PRICING_MODELS.FIXED) {
    lines.push(`Professional fee: ${fmtCurrency(nullableNum(snapshot.base_amount))}`);
  } else if (model === PRICING_MODELS.PER_HOUR) {
    lines.push(`Hourly rate: ${fmtCurrency(nullableNum(snapshot.hourly_rate))}/hr`);
    const hours = nullableNum(snapshot.estimated_hours);
    if (hours != null && hours > 0) {
      lines.push(`Estimated hours: ${hours}`);
    }
    const total = computeTotal(snapshot);
    if (total != null) lines.push(`Estimated total: ${fmtCurrency(total)}`);
  } else if (model === PRICING_MODELS.FIXED_PLUS) {
    lines.push(`Base fee: ${fmtCurrency(nullableNum(snapshot.base_amount))}`);
    for (const item of snapshot.additional_items || []) {
      if (!item.label) continue;
      const desc = describeAdditionalItem(item);
      if (!desc) continue;
      if (item.include_in_share) {
        lines.push(`Included: ${desc} (${item.label})`);
      } else {
        lines.push(`Additional ${desc} if ${item.label} occurs`);
      }
    }
    const total = computeTotal(snapshot);
    if (total != null) {
      lines.push('');
      lines.push(`Quoted total (included items): ${fmtCurrency(total)}`);
    }
  }

  const docLines = (docs || []).map((d) => String(d).trim()).filter(Boolean);
  if (docLines.length) {
    lines.push('');
    lines.push('Documents required:');
    docLines.forEach((d) => lines.push(`- ${d}`));
  }

  return lines.join('\n');
}

export function pricingModelLabel(model) {
  switch (model) {
    case PRICING_MODELS.PER_HOUR: return 'Per hour';
    case PRICING_MODELS.FIXED_PLUS: return 'Fixed + additional';
    default: return 'Fixed fee';
  }
}

export function feeTypeLabel(feeType) {
  switch (feeType) {
    case FEE_TYPES.HOURLY: return 'Per hour';
    case FEE_TYPES.BOTH: return 'Fixed + per hour';
    default: return 'Fixed per event';
  }
}

export function draftFromEngagementType(et) {
  const templates = (et.additional_fee_templates || []).map((t) => ({
    label: t.label || '',
    fee_type: t.fee_type || FEE_TYPES.FIXED,
    fixed_amount: t.fixed_amount != null ? String(t.fixed_amount) : '',
    hourly_rate: t.hourly_rate != null ? String(t.hourly_rate) : '',
  }));
  return {
    pricing_model: et.pricing_model || PRICING_MODELS.FIXED,
    base_amount: et.quotation_base_amount != null ? String(et.quotation_base_amount) : '',
    hourly_rate: et.quotation_hourly_rate != null ? String(et.quotation_hourly_rate) : '',
    estimated_hours: et.quotation_estimated_hours != null ? String(et.quotation_estimated_hours) : '',
    standard_fee: et.standard_fee_amount != null ? String(et.standard_fee_amount) : '',
    standard_hours: et.standard_allowable_hours != null ? String(et.standard_allowable_hours) : '',
    additional_templates: templates,
  };
}

export function draftToApiPayload(draft) {
  const payload = {
    pricing_model: draft.pricing_model || PRICING_MODELS.FIXED,
    quotation_base_amount: draft.base_amount === '' ? null : draft.base_amount,
    quotation_hourly_rate: draft.hourly_rate === '' ? null : draft.hourly_rate,
    quotation_estimated_hours: draft.estimated_hours === '' ? null : draft.estimated_hours,
    standard_fee_amount: draft.standard_fee === '' ? null : draft.standard_fee,
    standard_allowable_hours: draft.standard_hours === '' ? null : draft.standard_hours,
  };
  if (draft.pricing_model === PRICING_MODELS.FIXED_PLUS) {
    payload.additional_fee_templates = (draft.additional_templates || [])
      .filter((t) => String(t.label || '').trim())
      .map((t, i) => ({
        label: String(t.label).trim(),
        fee_type: t.fee_type || FEE_TYPES.FIXED,
        fixed_amount: t.fixed_amount === '' ? null : t.fixed_amount,
        hourly_rate: t.hourly_rate === '' ? null : t.hourly_rate,
        sort_order: i,
      }));
  } else {
    payload.additional_fee_templates = [];
  }
  return payload;
}

export function snapshotFromDraftFields(draft) {
  const snap = {
    pricing_model: draft.pricing_model || PRICING_MODELS.FIXED,
    base_amount: nullableNum(draft.base_amount),
    hourly_rate: nullableNum(draft.hourly_rate),
    estimated_hours: nullableNum(draft.estimated_hours),
    additional_items: [],
  };
  if (draft.pricing_model === PRICING_MODELS.FIXED_PLUS) {
    snap.additional_items = (draft.additional_templates || [])
      .filter((t) => String(t.label || '').trim())
      .map((t) => normalizeAdditionalItem({
        label: t.label,
        fee_type: t.fee_type,
        fixed_amount: t.fixed_amount,
        hourly_rate: t.hourly_rate,
        include_in_share: true,
        is_custom: false,
      }));
  }
  return snap;
}

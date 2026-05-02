-- Invoice cost analysis: engagement-type standards, service overrides, invoice ack + aggregate snapshot

ALTER TABLE engagement_types
    ADD COLUMN IF NOT EXISTS standard_fee_amount NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS standard_allowable_hours NUMERIC(12,4);

COMMENT ON COLUMN engagement_types.standard_fee_amount IS
    'Default professional fee (₹) for this engagement type for invoice prefill / variance reporting.';
COMMENT ON COLUMN engagement_types.standard_allowable_hours IS
    'Default allowable hours (global per engagement type); used for caps in later tasks.';

ALTER TABLE services
    ADD COLUMN IF NOT EXISTS standard_fee_override NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS standard_allowable_hours_override NUMERIC(12,4);

COMMENT ON COLUMN services.standard_fee_override IS
    'When set, overrides engagement_types.standard_fee_amount for this service only.';
COMMENT ON COLUMN services.standard_allowable_hours_override IS
    'When set, overrides engagement_types.standard_allowable_hours for this service only.';

ALTER TABLE txn
    ADD COLUMN IF NOT EXISTS invoice_cost_analysis_ack_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS invoice_cost_analysis_ack_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS invoice_cost_analysis JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN txn.invoice_cost_analysis IS
    'Snapshot: standard vs planned-rate hours value for matching fee lines when service_id is set.';

CREATE INDEX IF NOT EXISTS idx_txn_invoice_cost_variance
    ON txn (txn_type, txn_date)
    WHERE txn_type = 'invoice' AND status = 'active';

INSERT INTO schema_migrations (version) VALUES ('055_invoice_cost_analysis');

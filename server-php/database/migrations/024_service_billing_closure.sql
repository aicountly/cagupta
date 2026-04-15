-- =============================================================================
-- Migration 024 — Service billing closure (queue / built / non-billable)
-- =============================================================================

ALTER TABLE services
    ADD COLUMN IF NOT EXISTS billing_closure VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS billing_built_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS billing_built_amount NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS non_billable_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS non_billable_reason TEXT;

ALTER TABLE services DROP CONSTRAINT IF EXISTS services_billing_closure_chk;
ALTER TABLE services ADD CONSTRAINT services_billing_closure_chk CHECK (
    billing_closure IS NULL OR billing_closure IN ('open', 'built', 'non_billable')
);

CREATE INDEX IF NOT EXISTS idx_services_billing_open
    ON services (billing_closure)
    WHERE billing_closure = 'open';

CREATE INDEX IF NOT EXISTS idx_txn_service_invoice
    ON txn (service_id)
    WHERE txn_type = 'invoice' AND service_id IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('024_service_billing_closure')
ON CONFLICT (version) DO NOTHING;

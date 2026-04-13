-- =============================================================================
-- Migration 017 — Invoice line items (non-inventory) on txn
-- JSON array: [{"description":"...","amount":123.45}, ...]
-- =============================================================================

ALTER TABLE txn ADD COLUMN IF NOT EXISTS line_items JSONB;

INSERT INTO schema_migrations (version) VALUES ('017_txn_invoice_line_items')
ON CONFLICT (version) DO NOTHING;

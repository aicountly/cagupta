-- =============================================================================
-- Migration 016 — Payment expense metadata on txn (purpose, paid-from account)
-- =============================================================================

ALTER TABLE txn ADD COLUMN IF NOT EXISTS expense_purpose VARCHAR(80);
ALTER TABLE txn ADD COLUMN IF NOT EXISTS paid_from VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_txn_expense_purpose ON txn (expense_purpose)
    WHERE expense_purpose IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('016_txn_payment_expense_fields')
ON CONFLICT (version) DO NOTHING;

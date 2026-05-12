-- =============================================================================
-- Migration 061 — Ledger class (regular / memorandum) and movement kind
-- (fees vs reimbursement for non-invoice txn rows)
-- =============================================================================

ALTER TABLE txn ADD COLUMN IF NOT EXISTS ledger_class VARCHAR(20) NOT NULL DEFAULT 'regular';
ALTER TABLE txn ADD COLUMN IF NOT EXISTS ledger_movement_kind VARCHAR(20) NULL;

UPDATE txn SET ledger_class = 'regular' WHERE ledger_class IS NULL OR ledger_class = '';

UPDATE txn
SET ledger_movement_kind = 'fees'
WHERE ledger_movement_kind IS NULL
  AND txn_type IN ('receipt', 'payment_expense', 'tds_provisional', 'tds_final', 'rebate');

CREATE INDEX IF NOT EXISTS idx_txn_client_ledger_class ON txn (client_id, ledger_class)
    WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_txn_org_ledger_class ON txn (organization_id, ledger_class)
    WHERE organization_id IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('061_txn_ledger_class');

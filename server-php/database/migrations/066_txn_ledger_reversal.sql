-- =============================================================================
-- Migration 066 — Ledger reversal (user OTP / compensating rows)
-- Adds txn.status value 'reversed' (original row retained, excluded from balances
-- like cancelled) and txn_type values receipt_reversal, payment_expense_reversal,
-- tds_reversal (linked_txn_id points at the original posting).
-- =============================================================================

COMMENT ON COLUMN txn.status IS
'active (default), cancelled, or reversed — reversed: original retained for audit; excluded from balance totals like cancelled; compensating row inserted with *_reversal txn_type.';

CREATE INDEX IF NOT EXISTS idx_txn_ledger_reversal_linked
    ON txn (linked_txn_id)
    WHERE txn_type IN ('receipt_reversal', 'payment_expense_reversal', 'tds_reversal');

INSERT INTO schema_migrations (version) VALUES ('066_txn_ledger_reversal');

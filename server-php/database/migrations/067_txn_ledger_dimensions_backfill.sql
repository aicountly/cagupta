-- =============================================================================
-- Migration 067 — Backfill ledger_class and ledger_movement_kind on txn
-- Defensive repair for environments where rows pre-date 061 or have blanks.
-- =============================================================================

UPDATE txn
SET ledger_class = 'regular'
WHERE ledger_class IS NULL OR TRIM(ledger_class) = '';

UPDATE txn
SET ledger_movement_kind = 'fees'
WHERE ledger_movement_kind IS NULL
  AND txn_type IN (
    'receipt',
    'receipt_reversal',
    'payment_expense',
    'payment_expense_reversal',
    'tds_provisional',
    'tds_final',
    'tds_reversal',
    'rebate'
  );

INSERT INTO schema_migrations (version) VALUES ('067_txn_ledger_dimensions_backfill')
ON CONFLICT (version) DO NOTHING;

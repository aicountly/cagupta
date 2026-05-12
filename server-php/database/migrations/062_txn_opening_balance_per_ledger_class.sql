-- =============================================================================
-- Migration 062 — At most one opening_balance txn per (client, profile, ledger_class)
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_ob_client_profile_ledger_class
ON txn (client_id, billing_profile_code, ledger_class)
WHERE txn_type = 'opening_balance'
  AND client_id IS NOT NULL
  AND billing_profile_code IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('062_txn_opening_balance_per_ledger_class');

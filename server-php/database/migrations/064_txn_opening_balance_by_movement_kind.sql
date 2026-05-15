-- =============================================================================
-- Migration 064 — Opening balance per ledger_movement_kind (fees / reimbursement)
-- =============================================================================

-- Legacy rows had ledger_movement_kind NULL; treat entire historical balance as fees
-- so users can add a reimbursement slice explicitly. (Review mixed balances manually.)
UPDATE txn
SET ledger_movement_kind = 'fees'
WHERE txn_type = 'opening_balance'
  AND ledger_movement_kind IS NULL;

-- Disambiguate invoice_number: was OB-{client}-{profile}-R|M ; extend to -RF|-MF
UPDATE txn
SET invoice_number = invoice_number || 'F'
WHERE txn_type = 'opening_balance'
  AND ledger_movement_kind = 'fees'
  AND billing_profile_code IS NOT NULL
  AND invoice_number IS NOT NULL
  AND invoice_number ~ '-[RM]$';

DROP INDEX IF EXISTS idx_txn_ob_client_profile_ledger_class;

CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_ob_client_profile_class_kind
ON txn (client_id, billing_profile_code, ledger_class, ledger_movement_kind)
WHERE txn_type = 'opening_balance'
  AND client_id IS NOT NULL
  AND billing_profile_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_ob_org_profile_class_kind
ON txn (organization_id, billing_profile_code, ledger_class, ledger_movement_kind)
WHERE txn_type = 'opening_balance'
  AND organization_id IS NOT NULL
  AND billing_profile_code IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('064_txn_opening_balance_by_movement_kind');

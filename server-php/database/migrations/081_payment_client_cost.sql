-- =============================================================================
-- Migration 081 — Client cost payments (non-recoverable; excluded from ledger/recovery)
-- txn_type: payment_client_cost, payment_client_cost_reversal,
--           payment_client_cost_bank_leg, payment_client_cost_bank_leg_reversal
-- ledger_class: client_costs (fixed on client leg; debit/credit = 0)
-- =============================================================================

UPDATE txn
SET ledger_movement_kind = 'fees'
WHERE ledger_movement_kind IS NULL
  AND txn_type IN (
    'payment_client_cost',
    'payment_client_cost_reversal',
    'payment_client_cost_bank_leg',
    'payment_client_cost_bank_leg_reversal'
  );

INSERT INTO schema_migrations (version) VALUES ('081_payment_client_cost');

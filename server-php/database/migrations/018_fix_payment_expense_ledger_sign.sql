-- =============================================================================
-- Migration 018 — Correct payment_expense ledger sign (recoverable from client)
--
-- Previously payment_expense rows used credit like a receipt, which reduced
-- receivable incorrectly. They must post as debit (same effect as a fee charge).
-- =============================================================================

UPDATE txn
SET debit = amount,
    credit = 0,
    updated_at = NOW()
WHERE txn_type = 'payment_expense'
  AND status != 'cancelled'
  AND COALESCE(debit, 0) = 0
  AND COALESCE(credit, 0) > 0;

INSERT INTO schema_migrations (version) VALUES ('018_fix_payment_expense_ledger_sign')
ON CONFLICT (version) DO NOTHING;

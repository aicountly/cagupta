-- =============================================================================
-- Migration 068 — Split firm cash legs (double-entry style): receipt_bank_leg,
-- payment_expense_bank_leg for existing rows that still hold firm_bank_account_id
-- on the client-ledger row.
-- =============================================================================

INSERT INTO txn (
    client_id, organization_id, txn_type, txn_date, narration,
    debit, credit, amount, billing_profile_code,
    invoice_number, service_id, due_date, subtotal, tax_percent, tax_amount, invoice_status,
    payment_method, reference_number, expense_purpose, paid_from,
    tds_status, tds_section, tds_rate, linked_txn_id, notes, status, created_by, updated_by,
    line_items, gst_breakdown, appointment_id,
    firm_bank_account_id, counterparty_firm_bank_account_id, firm_expense_category,
    invoice_cost_analysis_ack_user_id, invoice_cost_analysis_ack_at, invoice_cost_analysis,
    ledger_class, ledger_movement_kind, public_ref
)
SELECT
    NULL,
    NULL,
    'receipt_bank_leg',
    t.txn_date,
    'Cash in — ' || COALESCE(t.narration, 'Receipt'),
    0::NUMERIC(14, 2),
    t.credit,
    t.amount,
    t.billing_profile_code,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    t.payment_method,
    t.reference_number,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    t.id,
    NULL,
    t.status,
    t.created_by,
    t.created_by,
    '[]'::jsonb,
    NULL,
    NULL,
    t.firm_bank_account_id,
    NULL,
    NULL,
    NULL,
    NULL,
    '{}'::jsonb,
    COALESCE(NULLIF(TRIM(t.ledger_class), ''), 'regular'),
    t.ledger_movement_kind,
    NULL::varchar(40) AS public_ref
FROM txn t
WHERE t.txn_type = 'receipt'
  AND t.status NOT IN ('cancelled', 'reversed')
  AND t.firm_bank_account_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM txn b
      WHERE b.linked_txn_id = t.id AND b.txn_type = 'receipt_bank_leg'
  );

UPDATE txn t
SET firm_bank_account_id = NULL
WHERE t.txn_type = 'receipt'
  AND EXISTS (
      SELECT 1 FROM txn b WHERE b.linked_txn_id = t.id AND b.txn_type = 'receipt_bank_leg'
  );

INSERT INTO txn (
    client_id, organization_id, txn_type, txn_date, narration,
    debit, credit, amount, billing_profile_code,
    invoice_number, service_id, due_date, subtotal, tax_percent, tax_amount, invoice_status,
    payment_method, reference_number, expense_purpose, paid_from,
    tds_status, tds_section, tds_rate, linked_txn_id, notes, status, created_by, updated_by,
    line_items, gst_breakdown, appointment_id,
    firm_bank_account_id, counterparty_firm_bank_account_id, firm_expense_category,
    invoice_cost_analysis_ack_user_id, invoice_cost_analysis_ack_at, invoice_cost_analysis,
    ledger_class, ledger_movement_kind, public_ref
)
SELECT
    NULL,
    NULL,
    'payment_expense_bank_leg',
    t.txn_date,
    'Cash out — ' || COALESCE(t.narration, 'Payment'),
    t.debit,
    t.credit,
    t.amount,
    t.billing_profile_code,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    t.payment_method,
    t.reference_number,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    t.id,
    NULL,
    t.status,
    t.created_by,
    t.created_by,
    '[]'::jsonb,
    NULL,
    NULL,
    t.firm_bank_account_id,
    NULL,
    NULL,
    NULL,
    NULL,
    '{}'::jsonb,
    COALESCE(NULLIF(TRIM(t.ledger_class), ''), 'regular'),
    t.ledger_movement_kind,
    NULL::varchar(40) AS public_ref
FROM txn t
WHERE t.txn_type = 'payment_expense'
  AND t.status NOT IN ('cancelled', 'reversed')
  AND t.firm_bank_account_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM txn b
      WHERE b.linked_txn_id = t.id AND b.txn_type = 'payment_expense_bank_leg'
  );

UPDATE txn t
SET firm_bank_account_id = NULL
WHERE t.txn_type = 'payment_expense'
  AND EXISTS (
      SELECT 1 FROM txn b WHERE b.linked_txn_id = t.id AND b.txn_type = 'payment_expense_bank_leg'
  );

INSERT INTO schema_migrations (version) VALUES ('068_txn_double_entry_cash_legs')
ON CONFLICT (version) DO NOTHING;

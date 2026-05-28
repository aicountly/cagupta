-- Backfill bank/cash mirror legs so particulars and metadata match linked client receipt/payment rows.

UPDATE txn bl
SET narration = 'Cash in — ' || COALESCE(r.narration, 'Receipt')
    || CASE WHEN COALESCE(r.public_ref, '') <> '' THEN ' · ' || r.public_ref ELSE '' END,
    payment_method = r.payment_method,
    billing_profile_code = r.billing_profile_code
FROM txn r
WHERE bl.linked_txn_id = r.id
  AND bl.txn_type = 'receipt_bank_leg'
  AND r.txn_type = 'receipt'
  AND bl.status = 'active';

UPDATE txn bl
SET narration = 'Cash out — ' || COALESCE(p.narration, 'Payment')
    || CASE WHEN COALESCE(p.public_ref, '') <> '' THEN ' · ' || p.public_ref ELSE '' END,
    payment_method = p.payment_method,
    billing_profile_code = p.billing_profile_code
FROM txn p
WHERE bl.linked_txn_id = p.id
  AND bl.txn_type = 'payment_expense_bank_leg'
  AND p.txn_type = 'payment_expense'
  AND bl.status = 'active';

UPDATE txn bl
SET narration = 'Cash out — ' || COALESCE(p.narration, 'Client cost')
    || CASE WHEN COALESCE(p.public_ref, '') <> '' THEN ' · ' || p.public_ref ELSE '' END,
    payment_method = p.payment_method,
    billing_profile_code = p.billing_profile_code
FROM txn p
WHERE bl.linked_txn_id = p.id
  AND bl.txn_type = 'payment_client_cost_bank_leg'
  AND p.txn_type = 'payment_client_cost'
  AND bl.status = 'active';

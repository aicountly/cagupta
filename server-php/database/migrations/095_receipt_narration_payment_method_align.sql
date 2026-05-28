-- Align standard client narrations with payment_method, then rebuild bank-leg particulars.

UPDATE txn
SET narration = 'Receipt — ' || COALESCE(NULLIF(TRIM(payment_method), ''), 'Transfer')
WHERE txn_type = 'receipt'
  AND status = 'active'
  AND (
    TRIM(COALESCE(narration, '')) = ''
    OR narration ~ '^Receipt — .+$'
  );

UPDATE txn
SET narration = 'Payment — ' || COALESCE(NULLIF(TRIM(payment_method), ''), 'Transfer')
WHERE txn_type = 'payment_expense'
  AND status = 'active'
  AND (
    TRIM(COALESCE(narration, '')) = ''
    OR narration ~ '^Payment — .+$'
  );

UPDATE txn
SET narration = 'Client cost — ' || COALESCE(NULLIF(TRIM(payment_method), ''), 'Transfer')
WHERE txn_type = 'payment_client_cost'
  AND status = 'active'
  AND (
    TRIM(COALESCE(narration, '')) = ''
    OR narration ~ '^Client cost — .+$'
  );

UPDATE txn bl
SET narration = CASE LOWER(COALESCE(fba.account_type, ''))
        WHEN 'bank' THEN 'Bank in — '
        WHEN 'cash' THEN 'Cash in — '
        ELSE 'Receipt in — '
    END
    || 'Receipt — ' || COALESCE(NULLIF(TRIM(r.payment_method), ''), 'Transfer')
    || CASE WHEN COALESCE(r.public_ref, '') <> '' THEN ' · ' || r.public_ref ELSE '' END,
    payment_method = r.payment_method,
    billing_profile_code = r.billing_profile_code
FROM txn r
LEFT JOIN firm_bank_accounts fba ON fba.id = bl.firm_bank_account_id
WHERE bl.linked_txn_id = r.id
  AND bl.txn_type = 'receipt_bank_leg'
  AND r.txn_type = 'receipt'
  AND bl.status = 'active';

UPDATE txn bl
SET narration = CASE LOWER(COALESCE(fba.account_type, ''))
        WHEN 'bank' THEN 'Bank out — '
        WHEN 'cash' THEN 'Cash out — '
        ELSE 'Payment out — '
    END
    || 'Payment — ' || COALESCE(NULLIF(TRIM(p.payment_method), ''), 'Transfer')
    || CASE WHEN COALESCE(p.public_ref, '') <> '' THEN ' · ' || p.public_ref ELSE '' END,
    payment_method = p.payment_method,
    billing_profile_code = p.billing_profile_code
FROM txn p
LEFT JOIN firm_bank_accounts fba ON fba.id = bl.firm_bank_account_id
WHERE bl.linked_txn_id = p.id
  AND bl.txn_type = 'payment_expense_bank_leg'
  AND p.txn_type = 'payment_expense'
  AND bl.status = 'active';

UPDATE txn bl
SET narration = CASE LOWER(COALESCE(fba.account_type, ''))
        WHEN 'bank' THEN 'Bank out — '
        WHEN 'cash' THEN 'Cash out — '
        ELSE 'Payment out — '
    END
    || 'Client cost — ' || COALESCE(NULLIF(TRIM(p.payment_method), ''), 'Transfer')
    || CASE WHEN COALESCE(p.public_ref, '') <> '' THEN ' · ' || p.public_ref ELSE '' END,
    payment_method = p.payment_method,
    billing_profile_code = p.billing_profile_code
FROM txn p
LEFT JOIN firm_bank_accounts fba ON fba.id = bl.firm_bank_account_id
WHERE bl.linked_txn_id = p.id
  AND bl.txn_type = 'payment_client_cost_bank_leg'
  AND p.txn_type = 'payment_client_cost'
  AND bl.status = 'active';

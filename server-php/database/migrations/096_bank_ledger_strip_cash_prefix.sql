-- Bank-account ledger rows: remove misleading "Cash in/out" (and other mirror) prefixes from stored narration.
-- Cash-book accounts keep "Cash in —" / "Cash out —" prefixes.

UPDATE txn t
SET narration = REGEXP_REPLACE(
        t.narration,
        '^(?:Cash|Bank|Receipt|Payment)\s+(?:in|out)\s+—\s+',
        '',
        'i'
    )
FROM firm_bank_accounts fba
WHERE t.firm_bank_account_id = fba.id
  AND LOWER(fba.account_type) = 'bank'
  AND t.status = 'active'
  AND t.narration ~* '^(?:Cash|Bank|Receipt|Payment)\s+(?:in|out)\s+—\s+';

-- Rebuild receipt bank legs on bank accounts (payment_method-driven text, no bank prefix).
UPDATE txn AS bl
SET narration = 'Receipt — ' || COALESCE(NULLIF(TRIM(r.payment_method), ''), 'Transfer')
    || CASE WHEN COALESCE(r.public_ref, '') <> '' THEN ' · ' || r.public_ref ELSE '' END,
    payment_method = r.payment_method,
    billing_profile_code = r.billing_profile_code
FROM txn AS r,
     firm_bank_accounts AS fba
WHERE bl.linked_txn_id = r.id
  AND bl.firm_bank_account_id = fba.id
  AND LOWER(fba.account_type) = 'bank'
  AND bl.txn_type = 'receipt_bank_leg'
  AND r.txn_type = 'receipt'
  AND bl.status = 'active';

UPDATE txn AS bl
SET narration = CASE
        WHEN TRIM(COALESCE(p.narration, '')) = ''
          OR p.narration ~ '^Payment — .+$' THEN
            'Payment — ' || COALESCE(NULLIF(TRIM(p.payment_method), ''), 'Transfer')
        ELSE p.narration
    END
    || CASE WHEN COALESCE(p.public_ref, '') <> '' THEN ' · ' || p.public_ref ELSE '' END,
    payment_method = p.payment_method,
    billing_profile_code = p.billing_profile_code
FROM txn AS p,
     firm_bank_accounts AS fba
WHERE bl.linked_txn_id = p.id
  AND bl.firm_bank_account_id = fba.id
  AND LOWER(fba.account_type) = 'bank'
  AND bl.txn_type = 'payment_expense_bank_leg'
  AND p.txn_type = 'payment_expense'
  AND bl.status = 'active';

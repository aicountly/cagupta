-- =============================================================================
-- Migration 085 — Exclusive txn entity ownership (align ledger / recovery list)
--
-- Opening balances must belong to exactly one of client_id OR organization_id.
-- Dual-ID rows caused org ledgers to show balances that Recovery List attributed
-- to contacts (client_id wins). Fix OB rows by invoice_number prefix; leave other
-- txn types with both IDs for manual review.
-- =============================================================================

-- Org-owned opening balances (OB-O{orgId}-…): clear stray client_id
UPDATE txn
SET client_id = NULL,
    updated_at = NOW()
WHERE txn_type = 'opening_balance'
  AND client_id IS NOT NULL
  AND organization_id IS NOT NULL
  AND invoice_number ~ '^OB-O[0-9]+-'
  AND organization_id::text = substring(invoice_number FROM '^OB-O([0-9]+)-');

-- Contact-owned opening balances (OB-C{clientId}-…): clear stray organization_id
UPDATE txn
SET organization_id = NULL,
    updated_at = NOW()
WHERE txn_type = 'opening_balance'
  AND client_id IS NOT NULL
  AND organization_id IS NOT NULL
  AND invoice_number ~ '^OB-C[0-9]+-'
  AND client_id::text = substring(invoice_number FROM '^OB-C([0-9]+)-');

-- Dual-ID opening balances without invoice_number: org rows should not carry client_id
UPDATE txn
SET client_id = NULL,
    updated_at = NOW()
WHERE txn_type = 'opening_balance'
  AND client_id IS NOT NULL
  AND organization_id IS NOT NULL
  AND (invoice_number IS NULL OR TRIM(invoice_number) = '');

INSERT INTO schema_migrations (version) VALUES ('085_txn_exclusive_entity_ownership');

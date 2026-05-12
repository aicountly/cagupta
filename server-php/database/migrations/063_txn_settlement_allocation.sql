-- =============================================================================
-- Migration 063 — Public refs (RCP-/PAY-) and receipt settlement allocations
-- =============================================================================

ALTER TABLE txn ADD COLUMN IF NOT EXISTS public_ref VARCHAR(40) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_public_ref ON txn (public_ref) WHERE public_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS txn_settlement_allocation (
    id               SERIAL PRIMARY KEY,
    source_txn_id    INT NOT NULL REFERENCES txn (id) ON DELETE CASCADE,
    target_type      VARCHAR(32) NOT NULL,
    target_txn_id    INT NULL REFERENCES txn (id) ON DELETE RESTRICT,
    amount           NUMERIC(14, 2) NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_txn_settlement_target_type CHECK (
        target_type IN ('invoice', 'payment_expense', 'unallocated_advance')
    ),
    CONSTRAINT chk_txn_settlement_target_txn CHECK (
        (target_type = 'unallocated_advance' AND target_txn_id IS NULL)
        OR (target_type <> 'unallocated_advance' AND target_txn_id IS NOT NULL)
    ),
    CONSTRAINT chk_txn_settlement_amount_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_txn_settlement_source ON txn_settlement_allocation (source_txn_id);
CREATE INDEX IF NOT EXISTS idx_txn_settlement_target ON txn_settlement_allocation (target_txn_id)
    WHERE target_txn_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_numeric_sequence (
    seq_key    TEXT PRIMARY KEY,
    last_value BIGINT NOT NULL DEFAULT 0
);

-- Backfill public_ref for existing receipts and payment expenses (id-stable, unique).
UPDATE txn
SET public_ref = 'RCP-MIG-' || id::TEXT
WHERE txn_type = 'receipt'
  AND (public_ref IS NULL OR TRIM(public_ref) = '');

UPDATE txn
SET public_ref = 'PAY-MIG-' || id::TEXT
WHERE txn_type = 'payment_expense'
  AND (public_ref IS NULL OR TRIM(public_ref) = '');

-- Seed sequences from max numeric suffix if needed (optional; new refs use fresh counter).
-- Backfill allocations from legacy linked_txn_id (one row per receipt).
INSERT INTO txn_settlement_allocation (source_txn_id, target_type, target_txn_id, amount, created_at)
SELECT t.id,
       CASE
           WHEN t.linked_txn_id IS NOT NULL
                AND EXISTS (
                    SELECT 1 FROM txn i
                    WHERE i.id = t.linked_txn_id AND i.txn_type = 'invoice'
                ) THEN 'invoice'
           ELSE 'unallocated_advance'
       END,
       CASE
           WHEN t.linked_txn_id IS NOT NULL
                AND EXISTS (
                    SELECT 1 FROM txn i
                    WHERE i.id = t.linked_txn_id AND i.txn_type = 'invoice'
                ) THEN t.linked_txn_id
           ELSE NULL
       END,
       t.amount,
       COALESCE(t.created_at, NOW())
FROM txn t
WHERE t.txn_type = 'receipt'
  AND t.status IS DISTINCT FROM 'cancelled'
  AND NOT EXISTS (
      SELECT 1 FROM txn_settlement_allocation a WHERE a.source_txn_id = t.id
  );

INSERT INTO schema_migrations (version) VALUES ('063_txn_settlement_allocation');

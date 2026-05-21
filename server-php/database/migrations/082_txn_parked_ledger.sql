-- Migration 082 — Parked ledger assign traceability (082; 081 is payment_client_cost)
-- Links original parked txn to compensating reversal and target client ledger entry after assign.

ALTER TABLE txn ADD COLUMN IF NOT EXISTS parked_transfer_target_txn_id INTEGER REFERENCES txn(id);
ALTER TABLE txn ADD COLUMN IF NOT EXISTS parked_transfer_reversal_txn_id INTEGER REFERENCES txn(id);

CREATE INDEX IF NOT EXISTS idx_txn_parked_transfer_target ON txn(parked_transfer_target_txn_id);
CREATE INDEX IF NOT EXISTS idx_txn_parked_transfer_reversal ON txn(parked_transfer_reversal_txn_id);

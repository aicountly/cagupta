-- Pending Super Admin approval for protected ledger txn changes (edit, cancel, reverse, cancel reversal).

CREATE TABLE IF NOT EXISTS ledger_txn_change_requests (
    id                   SERIAL PRIMARY KEY,
    txn_id               INTEGER REFERENCES txn (id) ON DELETE CASCADE,
    action               VARCHAR(32) NOT NULL,
    status               VARCHAR(20) NOT NULL DEFAULT 'pending',
    payload              JSONB NOT NULL DEFAULT '{}'::jsonb,
    txn_snapshot         JSONB NOT NULL DEFAULT '{}'::jsonb,
    request_reason       TEXT,
    requested_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    decided_by_user_id   INTEGER REFERENCES users (id) ON DELETE SET NULL,
    decided_at           TIMESTAMPTZ,
    reject_reason        TEXT,
    decision_notes       TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ledger_txn_change_requests_status_chk
        CHECK (status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT ledger_txn_change_requests_action_chk
        CHECK (action IN ('update', 'reverse', 'cancel', 'cancel_reversal'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_txn_change_pending_txn
    ON ledger_txn_change_requests (txn_id)
    WHERE status = 'pending' AND txn_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_txn_change_pending_bulk_cancel
    ON ledger_txn_change_requests ((1))
    WHERE status = 'pending' AND action = 'cancel' AND txn_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_txn_change_status_created
    ON ledger_txn_change_requests (status, created_at DESC);

INSERT INTO schema_migrations (version) VALUES ('083_ledger_txn_change_requests')
ON CONFLICT (version) DO NOTHING;

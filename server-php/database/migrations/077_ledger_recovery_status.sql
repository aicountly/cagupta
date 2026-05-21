-- Migration 077: NPA / bad-debt classification per client or organization ledger entity.
-- Classification only — ledger txn balances are unchanged.

CREATE TABLE IF NOT EXISTS ledger_recovery_status (
    id                    SERIAL PRIMARY KEY,
    entity_type           VARCHAR(20)  NOT NULL CHECK (entity_type IN ('client', 'organization')),
    entity_id             INTEGER      NOT NULL,
    status                VARCHAR(20)  NOT NULL CHECK (status IN ('npa', 'bad_debt')),
    npa_reason            TEXT,
    npa_marked_at         TIMESTAMPTZ,
    npa_marked_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    bad_debt_reason       TEXT,
    bad_debt_marked_at    TIMESTAMPTZ,
    bad_debt_marked_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ  DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_recovery_status_entity
    ON ledger_recovery_status(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_ledger_recovery_status_status
    ON ledger_recovery_status(status);

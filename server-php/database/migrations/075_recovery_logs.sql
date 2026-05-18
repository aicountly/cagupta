-- Migration 075: Recovery logs for client/org receivable follow-up tracking
-- Each row is one follow-up event per entity (client or organization).
-- The latest row per entity drives the "Due Date" column in the Recovery List.

CREATE TABLE IF NOT EXISTS recovery_logs (
    id                    SERIAL PRIMARY KEY,
    entity_type           VARCHAR(20)  NOT NULL CHECK (entity_type IN ('client', 'organization')),
    entity_id             INTEGER      NOT NULL,
    log_date              DATE         NOT NULL DEFAULT CURRENT_DATE,
    followup_details      TEXT,
    client_response       TEXT,
    next_followup_date    DATE,
    next_followup_details TEXT,
    revised_due_date      DATE,
    created_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ  DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recovery_logs_entity
    ON recovery_logs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_recovery_logs_created_at
    ON recovery_logs(created_at DESC);

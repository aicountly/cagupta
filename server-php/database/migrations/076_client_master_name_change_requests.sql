-- Pending Super Admin approval for client master name changes (contacts, organizations, groups).

CREATE TABLE IF NOT EXISTS client_master_name_change_requests (
    id                   SERIAL PRIMARY KEY,
    entity_type          VARCHAR(32) NOT NULL,
    entity_id            INTEGER NOT NULL,
    status               VARCHAR(20) NOT NULL DEFAULT 'pending',
    current_name         TEXT NOT NULL,
    proposed_values      JSONB NOT NULL DEFAULT '{}'::jsonb,
    request_reason       TEXT,
    requested_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    decided_by_user_id   INTEGER REFERENCES users (id) ON DELETE SET NULL,
    decided_at           TIMESTAMPTZ,
    reject_reason        TEXT,
    decision_notes       TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT client_master_name_change_requests_status_chk
        CHECK (status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT client_master_name_change_requests_entity_type_chk
        CHECK (entity_type IN ('contact', 'organization', 'client_group'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_master_name_change_pending
    ON client_master_name_change_requests (entity_type, entity_id)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_client_master_name_change_status_created
    ON client_master_name_change_requests (status, created_at DESC);

INSERT INTO schema_migrations (version) VALUES ('076_client_master_name_change_requests')
ON CONFLICT (version) DO NOTHING;

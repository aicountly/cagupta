-- Pending Super Admin approval for Accounts team client master edits (contacts, organizations).

CREATE TABLE IF NOT EXISTS client_master_edit_requests (
    id                   SERIAL PRIMARY KEY,
    entity_type          VARCHAR(32) NOT NULL,
    entity_id            INTEGER NOT NULL,
    status               VARCHAR(20) NOT NULL DEFAULT 'pending',
    current_snapshot     JSONB NOT NULL DEFAULT '{}'::jsonb,
    proposed_payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    request_reason       TEXT,
    requested_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    decided_by_user_id   INTEGER REFERENCES users (id) ON DELETE SET NULL,
    decided_at           TIMESTAMPTZ,
    reject_reason        TEXT,
    decision_notes       TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT client_master_edit_requests_status_chk
        CHECK (status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT client_master_edit_requests_entity_type_chk
        CHECK (entity_type IN ('contact', 'organization'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_master_edit_pending
    ON client_master_edit_requests (entity_type, entity_id)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_client_master_edit_status_created
    ON client_master_edit_requests (status, created_at DESC);

UPDATE roles SET permissions = jsonb_set(
    permissions,
    '{permissions}',
    COALESCE(permissions->'permissions', '[]'::jsonb) || '["clients.edit"]'::jsonb
)
WHERE name = 'accounts'
  AND NOT (COALESCE(permissions->'permissions', '[]'::jsonb) @> '["clients.edit"]'::jsonb);

INSERT INTO schema_migrations (version) VALUES ('088_client_master_edit_requests')
ON CONFLICT (version) DO NOTHING;

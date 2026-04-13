-- Audit trail for sensitive admin actions (e.g. service engagement changes).

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id               BIGSERIAL PRIMARY KEY,
    actor_user_id    INTEGER REFERENCES users (id) ON DELETE SET NULL,
    action           VARCHAR(64) NOT NULL,
    entity_type      VARCHAR(64) NOT NULL,
    entity_id        BIGINT NOT NULL,
    metadata         JSONB DEFAULT '{}'::jsonb,
    before_snapshot  JSONB,
    after_snapshot   JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_entity ON admin_audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log (created_at DESC);

INSERT INTO schema_migrations (version) VALUES ('022_admin_audit_log')
ON CONFLICT (version) DO NOTHING;

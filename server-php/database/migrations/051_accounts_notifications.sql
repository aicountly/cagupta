-- Accounts role, billing_open_since, in-app notifications

ALTER TABLE services ADD COLUMN IF NOT EXISTS billing_open_since TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_notifications (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind         VARCHAR(64) NOT NULL,
    title        VARCHAR(255) NOT NULL,
    body         TEXT,
    entity_type  VARCHAR(64),
    entity_id    INTEGER,
    read_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
    ON user_notifications (user_id, created_at DESC);

INSERT INTO roles (name, display_name, permissions, is_system) VALUES
(
    'accounts',
    'Accounts',
    '{"permissions": [
        "dashboard.view",
        "clients.view",
        "services.view",
        "documents.view",
        "calendar.view",
        "registers.view",
        "invoices.view",
        "invoices.create",
        "invoices.edit",
        "invoices.delete",
        "settings.view",
        "affiliates.manage",
        "partners.manage"
    ]}',
    TRUE
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('051_accounts_notifications');

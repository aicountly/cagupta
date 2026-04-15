-- Many-to-many staff assignees per service engagement (team that owns the work).

CREATE TABLE IF NOT EXISTS service_assignees (
    service_id INTEGER NOT NULL REFERENCES services (id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (service_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_service_assignees_user ON service_assignees (user_id);

-- Backfill from legacy assigned_to
INSERT INTO service_assignees (service_id, user_id)
SELECT id, assigned_to FROM services
WHERE assigned_to IS NOT NULL AND assigned_to > 0
ON CONFLICT (service_id, user_id) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('028_service_assignees')
ON CONFLICT (version) DO NOTHING;

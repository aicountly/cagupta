-- Per-service temporary charge assignments linked to a leave record.
-- Allows partial allotment: different services from the same leave can go to
-- different substitute users.  The UNIQUE constraint on (leave_id, service_id)
-- guarantees at most one active temp owner per service per leave.

CREATE TABLE IF NOT EXISTS service_temporary_assignments (
    id               SERIAL PRIMARY KEY,
    leave_id         INTEGER NOT NULL REFERENCES user_leaves(id) ON DELETE CASCADE,
    service_id       INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    original_user_id INTEGER NOT NULL REFERENCES users(id),
    temp_user_id     INTEGER NOT NULL REFERENCES users(id),
    start_date       DATE    NOT NULL,
    end_date         DATE    NOT NULL,
    revoked_at       TIMESTAMPTZ,
    revoked_by       INTEGER REFERENCES users(id),
    created_by       INTEGER REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (leave_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_sta_leave     ON service_temporary_assignments(leave_id);
CREATE INDEX IF NOT EXISTS idx_sta_service   ON service_temporary_assignments(service_id);
CREATE INDEX IF NOT EXISTS idx_sta_temp_user ON service_temporary_assignments(temp_user_id);
-- Efficient lookup for the "my-charges" endpoint (date range + no revocation)
CREATE INDEX IF NOT EXISTS idx_sta_active    ON service_temporary_assignments(temp_user_id, start_date, end_date)
    WHERE revoked_at IS NULL;

INSERT INTO schema_migrations (version) VALUES ('039_service_temporary_assignments')
ON CONFLICT (version) DO NOTHING;

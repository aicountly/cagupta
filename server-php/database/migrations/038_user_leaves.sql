-- Leave period tracking for staff users.
-- Stores when an employee is on leave so temporary service handovers can be
-- scoped to a defined date range.

CREATE TABLE IF NOT EXISTS user_leaves (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_date  DATE    NOT NULL,
    end_date    DATE    NOT NULL,
    reason      TEXT,
    status      VARCHAR(20) NOT NULL DEFAULT 'active', -- active | cancelled
    created_by  INTEGER REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_leaves_dates_check CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_user_leaves_user  ON user_leaves(user_id);
CREATE INDEX IF NOT EXISTS idx_user_leaves_dates ON user_leaves(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_user_leaves_status ON user_leaves(status);

INSERT INTO schema_migrations (version) VALUES ('038_user_leaves')
ON CONFLICT (version) DO NOTHING;

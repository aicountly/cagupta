-- =============================================================================
-- Migration 025 — Time entries, per-user planned billable rate, billing snapshot
-- =============================================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS planned_billable_rate_per_hour NUMERIC(12,2);

COMMENT ON COLUMN users.planned_billable_rate_per_hour IS
    'Planned average billable rate (₹/hr) for time-value vs invoice comparison.';

ALTER TABLE services
    ADD COLUMN IF NOT EXISTS billing_planned_value_at_close NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS billing_billable_hours_at_close NUMERIC(14,4),
    ADD COLUMN IF NOT EXISTS billing_avg_achieved_rate_per_hour NUMERIC(14,2);

COMMENT ON COLUMN services.billing_planned_value_at_close IS
    'Σ (user billable hours × user planned rate) when marked built.';
COMMENT ON COLUMN services.billing_billable_hours_at_close IS
    'Total billable hours on engagement when marked built.';
COMMENT ON COLUMN services.billing_avg_achieved_rate_per_hour IS
    'Invoiced subtotal ÷ billable hours when marked built (₹/hr).';

CREATE TABLE IF NOT EXISTS time_entries (
    id                SERIAL PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_id        INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    task_id           TEXT,
    work_date         DATE NOT NULL,
    duration_minutes  INTEGER NOT NULL,
    activity_type     VARCHAR(80) NOT NULL,
    is_billable       BOOLEAN NOT NULL DEFAULT TRUE,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT time_entries_duration_chk CHECK (
        duration_minutes > 0 AND duration_minutes <= 1440
    )
);

CREATE INDEX IF NOT EXISTS idx_time_entries_service ON time_entries (service_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_date ON time_entries (user_id, work_date);

INSERT INTO schema_migrations (version) VALUES ('025_time_entries_user_rates')
ON CONFLICT (version) DO NOTHING;

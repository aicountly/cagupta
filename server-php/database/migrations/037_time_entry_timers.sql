-- =============================================================================
-- Migration 037 — Time entry timer lifecycle support
-- =============================================================================

ALTER TABLE time_entries
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS timer_status VARCHAR(20) NOT NULL DEFAULT 'submitted',
    ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual';

UPDATE time_entries
SET timer_status = 'submitted',
    source = COALESCE(NULLIF(source, ''), 'manual')
WHERE timer_status IS NULL OR timer_status = '';

ALTER TABLE time_entries
    DROP CONSTRAINT IF EXISTS time_entries_timer_status_chk;
ALTER TABLE time_entries
    ADD CONSTRAINT time_entries_timer_status_chk
    CHECK (timer_status IN ('running', 'stopped', 'submitted'));

ALTER TABLE time_entries
    DROP CONSTRAINT IF EXISTS time_entries_source_chk;
ALTER TABLE time_entries
    ADD CONSTRAINT time_entries_source_chk
    CHECK (source IN ('manual', 'timer'));

ALTER TABLE time_entries
    DROP CONSTRAINT IF EXISTS time_entries_started_ended_chk;
ALTER TABLE time_entries
    ADD CONSTRAINT time_entries_started_ended_chk
    CHECK (
        started_at IS NULL
        OR ended_at IS NULL
        OR ended_at >= started_at
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_one_running_per_user
    ON time_entries (user_id)
    WHERE timer_status = 'running';

INSERT INTO schema_migrations (version) VALUES ('037_time_entry_timers')
ON CONFLICT (version) DO NOTHING;

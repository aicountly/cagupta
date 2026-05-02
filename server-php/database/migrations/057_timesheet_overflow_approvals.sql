-- PR3: Cap logged time at 3 × standard_allowable_hours (engagement type / service override).
-- Require superadmin approval to exceed (manual entry, timer stop, or duration increase).

CREATE TABLE IF NOT EXISTS timesheet_overflow_requests (
    id                       SERIAL PRIMARY KEY,
    service_id               INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    time_entry_id            INTEGER REFERENCES time_entries(id) ON DELETE SET NULL,
    source_kind              VARCHAR(24) NOT NULL,
    status                   VARCHAR(24) NOT NULL DEFAULT 'pending',
    duration_minutes_requested INTEGER NOT NULL,
    approved_duration_minutes INTEGER,
    work_date                DATE NOT NULL,
    activity_type            VARCHAR(80) NOT NULL,
    is_billable              BOOLEAN NOT NULL DEFAULT TRUE,
    notes                    TEXT,
    task_id                  TEXT,
    decided_by               INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_at               TIMESTAMPTZ,
    decision_notes           TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ts_oflow_source_chk CHECK (source_kind IN ('manual_create', 'timer_stop', 'entry_edit')),
    CONSTRAINT ts_oflow_status_chk CHECK (status IN ('pending', 'approved', 'approved_modified', 'rejected')),
    CONSTRAINT ts_oflow_dur_chk CHECK (
        duration_minutes_requested > 0 AND duration_minutes_requested <= 1440
    )
);

CREATE INDEX IF NOT EXISTS idx_ts_oflow_service ON timesheet_overflow_requests (service_id);
CREATE INDEX IF NOT EXISTS idx_ts_oflow_pending ON timesheet_overflow_requests (status) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS timesheet_overflow_audit (
    id              BIGSERIAL PRIMARY KEY,
    request_id      INTEGER NOT NULL REFERENCES timesheet_overflow_requests(id) ON DELETE CASCADE,
    action          VARCHAR(48) NOT NULL,
    actor_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ts_oflow_audit_req ON timesheet_overflow_audit (request_id, id DESC);

ALTER TABLE time_entries
    ADD COLUMN IF NOT EXISTS cap_overflow_request_id INTEGER REFERENCES timesheet_overflow_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_cap_overflow ON time_entries (cap_overflow_request_id)
    WHERE cap_overflow_request_id IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('057_timesheet_overflow_approvals');

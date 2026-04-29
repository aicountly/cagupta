-- =============================================================================
-- Migration 040 — Service activity logs
--
-- Adds a user-facing activity log to each service engagement.
-- Staff can post notes, follow-ups, document requests, and internal messages.
-- Each entry carries a visibility flag controlling who can read it.
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '040_service_logs') THEN
        RAISE NOTICE 'Migration 040_service_logs already applied — skipping.';
        RETURN;
    END IF;

    CREATE TABLE IF NOT EXISTS service_logs (
        id               BIGSERIAL PRIMARY KEY,
        service_id       INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,

        -- Type of log entry
        log_type         VARCHAR(25) NOT NULL DEFAULT 'note',

        -- The log message / body
        message          TEXT NOT NULL,

        -- Visibility: who can see this entry
        --   internal  → staff only (super_admin, admin, manager, staff, viewer)
        --   affiliate → staff + affiliated partners
        --   client    → everyone including client portal users
        visibility       VARCHAR(20) NOT NULL DEFAULT 'internal',

        -- Follow-up tracking (optional)
        follow_up_date   DATE,
        reminder_sent_at TIMESTAMPTZ,
        is_resolved      BOOLEAN NOT NULL DEFAULT FALSE,
        resolved_at      TIMESTAMPTZ,
        resolved_by      INTEGER REFERENCES users(id),

        -- Pin important entries to the top
        is_pinned        BOOLEAN NOT NULL DEFAULT FALSE,

        created_by       INTEGER REFERENCES users(id),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT service_logs_visibility_check
            CHECK (visibility IN ('internal', 'affiliate', 'client')),
        CONSTRAINT service_logs_type_check
            CHECK (log_type IN (
                'note', 'status_change', 'follow_up', 'document_request',
                'internal_message', 'reminder', 'system'
            ))
    );

    -- Primary lookup: logs for a service, newest first
    CREATE INDEX IF NOT EXISTS idx_service_logs_service
        ON service_logs(service_id, created_at DESC);

    -- Partial index for cross-service pending follow-up dashboard
    CREATE INDEX IF NOT EXISTS idx_service_logs_followup
        ON service_logs(follow_up_date ASC)
        WHERE is_resolved = FALSE AND follow_up_date IS NOT NULL;

    INSERT INTO schema_migrations (version) VALUES ('040_service_logs')
    ON CONFLICT (version) DO NOTHING;

    RAISE NOTICE 'Migration 040_service_logs applied successfully.';
END;
$$;

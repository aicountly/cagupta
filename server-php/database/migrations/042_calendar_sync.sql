-- =============================================================================
-- Migration 042 — Calendar sync: OAuth tokens, sync accounts, settings,
--                 and external event ID tracking on calendar_events
-- =============================================================================

-- Per-user OAuth credentials for each calendar provider.
-- Apple CalDAV: access_token is NULL; refresh_token holds the app-specific password.
CREATE TABLE IF NOT EXISTS calendar_oauth_tokens (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider       VARCHAR(20)  NOT NULL CHECK (provider IN ('google', 'outlook', 'apple')),
    access_token   TEXT,
    refresh_token  TEXT         NOT NULL,
    expires_at     TIMESTAMPTZ,
    scope          TEXT,
    provider_email VARCHAR(255) NOT NULL,
    raw_profile    JSONB,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, provider, provider_email)
);

CREATE INDEX IF NOT EXISTS idx_calendar_oauth_tokens_user
    ON calendar_oauth_tokens(user_id);

-- One row per external calendar the user has opted in to sync.
-- A single Google account may expose several calendars (work, personal, etc.).
CREATE TABLE IF NOT EXISTS calendar_sync_accounts (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider       VARCHAR(20)  NOT NULL CHECK (provider IN ('google', 'outlook', 'apple')),
    provider_email VARCHAR(255) NOT NULL,
    calendar_id    TEXT         NOT NULL,
    calendar_name  VARCHAR(255),
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    sync_enabled   BOOLEAN      NOT NULL DEFAULT TRUE,
    sync_direction VARCHAR(20)  NOT NULL DEFAULT 'two_way'
        CHECK (sync_direction IN ('push_only', 'pull_only', 'two_way')),
    last_synced_at TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, provider, provider_email, calendar_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_sync_accounts_user
    ON calendar_sync_accounts(user_id);

-- Per-user global sync preferences.
CREATE TABLE IF NOT EXISTS calendar_sync_settings (
    user_id             INTEGER     PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    default_provider    VARCHAR(20),
    conflict_resolution VARCHAR(20) NOT NULL DEFAULT 'local_wins'
        CHECK (conflict_resolution IN ('local_wins', 'remote_wins')),
    auto_sync_enabled   BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track which external calendar events this app event has been pushed to.
-- e.g. {"google": "abc123", "outlook": "AAMkAD..."}
ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS external_event_ids JSONB NOT NULL DEFAULT '{}';

ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) NOT NULL DEFAULT 'local';

ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

DO $$
BEGIN
    ALTER TABLE calendar_events
        ADD CONSTRAINT calendar_events_sync_status_check
            CHECK (sync_status IN ('local', 'synced', 'conflict', 'error'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO schema_migrations (version) VALUES ('042_calendar_sync')
ON CONFLICT (version) DO NOTHING;

-- Queue rows for superadmin daily digest (contacts / organizations activity).

CREATE TABLE IF NOT EXISTS superadmin_digest_queue (
    id            BIGSERIAL PRIMARY KEY,
    digest_date   DATE         NOT NULL,
    occurred_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    entity_type   VARCHAR(16)  NOT NULL,
    bucket        VARCHAR(16)  NOT NULL,
    entity_id     INTEGER      NOT NULL,
    display_name  TEXT         NOT NULL,
    action_label  VARCHAR(128) NOT NULL,
    status        VARCHAR(16)  NOT NULL,
    actor_name    TEXT         NOT NULL,
    actor_email   TEXT         NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_superadmin_digest_queue_date
    ON superadmin_digest_queue (digest_date);

CREATE INDEX IF NOT EXISTS idx_superadmin_digest_queue_date_entity
    ON superadmin_digest_queue (digest_date, entity_type, bucket);

INSERT INTO schema_migrations (version) VALUES ('031_superadmin_daily_digest')
ON CONFLICT (version) DO NOTHING;

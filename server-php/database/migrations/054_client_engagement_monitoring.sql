-- Memorandum / group billing monitoring (engagement types that count as memorandum revenue)

CREATE TABLE IF NOT EXISTS memorandum_revenue_engagement_types (
    engagement_type_id  INTEGER PRIMARY KEY REFERENCES engagement_types(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version) VALUES ('054_client_engagement_monitoring');

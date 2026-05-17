-- 072_analytics_cache.sql
-- Caching tables for GA4 report data and AI-generated marketing insights.

CREATE TABLE IF NOT EXISTS analytics_cache (
    id          SERIAL       PRIMARY KEY,
    report_key  VARCHAR(120) NOT NULL,
    params_hash VARCHAR(64)  NOT NULL DEFAULT '',
    data_json   TEXT         NOT NULL DEFAULT '{}',
    fetched_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMP    NOT NULL,

    CONSTRAINT analytics_cache_key_params_uniq UNIQUE (report_key, params_hash)
);

CREATE INDEX IF NOT EXISTS idx_analytics_cache_expires ON analytics_cache (expires_at);

-- ── AI insights ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analytics_ai_insights (
    id             SERIAL    PRIMARY KEY,
    insights_json  TEXT      NOT NULL DEFAULT '[]',
    generated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMP NOT NULL,
    generated_by   INTEGER   REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_generated ON analytics_ai_insights (generated_at DESC);

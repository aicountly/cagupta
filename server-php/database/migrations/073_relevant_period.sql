-- =============================================================================
-- Migration 073 — Relevant Period on services
--
-- Adds relevant_period_frequency, relevant_period_from, relevant_period_to,
-- and relevant_period_label to the services table. Replaces the free-text
-- financial_year for structured period identification.
-- =============================================================================

ALTER TABLE services
    ADD COLUMN IF NOT EXISTS relevant_period_frequency VARCHAR(20)  DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS relevant_period_from      DATE         DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS relevant_period_to        DATE         DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS relevant_period_label     VARCHAR(120) DEFAULT NULL;

COMMENT ON COLUMN services.relevant_period_frequency IS
    'Period type: month | months | quarter | quarters | year | years | custom';
COMMENT ON COLUMN services.relevant_period_from IS
    'Start date of the relevant period';
COMMENT ON COLUMN services.relevant_period_to IS
    'End date of the relevant period';
COMMENT ON COLUMN services.relevant_period_label IS
    'Pre-computed display label (e.g. "April 2026", "Q1 (Apr - Jun 2026)", "FY 2025-26")';

CREATE INDEX IF NOT EXISTS idx_services_relevant_period
    ON services (relevant_period_from, relevant_period_to)
    WHERE relevant_period_from IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('073_relevant_period')
ON CONFLICT (version) DO NOTHING;

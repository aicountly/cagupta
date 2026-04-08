-- =============================================================================
-- Migration 013 — Add subcategory_id to engagement_types
-- Makes engagement types children of subcategories instead of just categories.
-- subcategory_id is nullable so existing data is preserved.
-- =============================================================================

ALTER TABLE engagement_types
    ADD COLUMN IF NOT EXISTS subcategory_id INTEGER REFERENCES service_subcategories(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_engagement_types_subcategory ON engagement_types(subcategory_id);

INSERT INTO schema_migrations (version) VALUES ('013_engagement_type_subcategory')
ON CONFLICT (version) DO NOTHING;

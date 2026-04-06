-- =============================================================================
-- Migration 004 — Service categories, subcategories, and engagement types
-- =============================================================================

-- service_categories
CREATE TABLE IF NOT EXISTS service_categories (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ  DEFAULT NOW(),
    updated_at TIMESTAMPTZ  DEFAULT NOW()
);

-- service_subcategories
CREATE TABLE IF NOT EXISTS service_subcategories (
    id          SERIAL PRIMARY KEY,
    category_id INTEGER      NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
    name        VARCHAR(200) NOT NULL,
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- engagement_types
CREATE TABLE IF NOT EXISTS engagement_types (
    id          SERIAL PRIMARY KEY,
    category_id INTEGER      NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
    name        VARCHAR(200) NOT NULL,
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Add extra columns to services table to store catalog metadata
ALTER TABLE services
    ADD COLUMN IF NOT EXISTS client_type         VARCHAR(20)  DEFAULT 'contact',
    ADD COLUMN IF NOT EXISTS client_name         VARCHAR(255),
    ADD COLUMN IF NOT EXISTS staff_name          VARCHAR(255),
    ADD COLUMN IF NOT EXISTS category_id         INTEGER,
    ADD COLUMN IF NOT EXISTS category_name       VARCHAR(200),
    ADD COLUMN IF NOT EXISTS subcategory_id      INTEGER,
    ADD COLUMN IF NOT EXISTS subcategory_name    VARCHAR(200),
    ADD COLUMN IF NOT EXISTS engagement_type_id  INTEGER,
    ADD COLUMN IF NOT EXISTS engagement_type_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS tasks               JSONB        DEFAULT '[]';

-- Add extra columns to calendar_events for appointments
ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS client_name  VARCHAR(255),
    ADD COLUMN IF NOT EXISTS staff_name   VARCHAR(255),
    ADD COLUMN IF NOT EXISTS status       VARCHAR(30)  DEFAULT 'scheduled';

-- Add extra columns to invoices for billing profile tracking
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS billing_profile_code VARCHAR(50);

-- Add company column to leads (UI uses it)
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS company     VARCHAR(200),
    ADD COLUMN IF NOT EXISTS probability INTEGER      DEFAULT 50;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_categories_name   ON service_categories(name);
CREATE INDEX IF NOT EXISTS idx_service_subcats_category  ON service_subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_engagement_types_category ON engagement_types(category_id);

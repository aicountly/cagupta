-- ── Migration 009: Reference Field on Contacts & Organizations ───────────────
-- Adds a free-text reference field for internal notes/labelling

ALTER TABLE clients       ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS reference TEXT;

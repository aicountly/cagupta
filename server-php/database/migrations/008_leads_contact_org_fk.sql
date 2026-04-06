-- ── Migration 008: Leads — Contact & Organization FK ─────────────────────────
-- Adds foreign key columns so leads can reference existing contacts/organizations

ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_id      INT REFERENCES clients(id)       ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS organization_id INT REFERENCES organizations(id) ON DELETE SET NULL;

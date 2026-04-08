-- =============================================================================
-- Migration 012 — Contact-Organization Linking
-- Adds primary_contact_id FK to organizations and creates a junction table
-- for many-to-many contact-organization relationships.
-- =============================================================================

-- Add primary_contact_id to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS primary_contact_id INT REFERENCES clients(id) ON DELETE SET NULL;

-- Create junction table for many-to-many contact-organization linking
CREATE TABLE IF NOT EXISTS contact_organization (
    id              SERIAL PRIMARY KEY,
    contact_id      INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role            VARCHAR(50) DEFAULT 'member',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(contact_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_org_contact ON contact_organization(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_org_org ON contact_organization(organization_id);

INSERT INTO schema_migrations (version) VALUES ('012_contact_org_linking')
ON CONFLICT (version) DO NOTHING;

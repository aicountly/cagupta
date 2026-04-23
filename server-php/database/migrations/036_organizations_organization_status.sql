-- Migration 036: Organization lifecycle status (active / inactive / prospect)
-- Aligns with admin UI; `is_active` stays false only when organization_status = 'inactive'.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS organization_status VARCHAR(20);

UPDATE organizations
SET organization_status = CASE WHEN is_active IS FALSE THEN 'inactive' ELSE 'active' END
WHERE organization_status IS NULL OR TRIM(organization_status) = '';

ALTER TABLE organizations ALTER COLUMN organization_status SET DEFAULT 'active';

UPDATE organizations SET organization_status = 'active' WHERE organization_status IS NULL;

ALTER TABLE organizations ALTER COLUMN organization_status SET NOT NULL;

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_organization_status_chk;

ALTER TABLE organizations
    ADD CONSTRAINT organizations_organization_status_chk
    CHECK (organization_status IN ('active', 'inactive', 'prospect'));

CREATE INDEX IF NOT EXISTS idx_organizations_organization_status ON organizations (organization_status);

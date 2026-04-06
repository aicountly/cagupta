-- ── Migration 007: Client Groups ──────────────────────────────────────────────
-- Groups master table (shared between contacts and organizations)

CREATE TABLE IF NOT EXISTS client_groups (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,
    description TEXT,
    color       VARCHAR(7) DEFAULT '#6366f1',
    created_by  INT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Add group_id to clients (contacts)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS group_id INT REFERENCES client_groups(id) ON DELETE SET NULL;

-- Add group_id to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS group_id INT REFERENCES client_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_group_id ON clients(group_id);
CREATE INDEX IF NOT EXISTS idx_organizations_group_id ON organizations(group_id);

-- Optional default billing firm per client master (contact / organization).
-- Pre-fills Raise Invoice; nullable FK to billing_firms.

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS default_billing_profile_code VARCHAR(50)
        REFERENCES billing_firms (code) ON DELETE SET NULL;

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS default_billing_profile_code VARCHAR(50)
        REFERENCES billing_firms (code) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_default_billing_profile
    ON clients (default_billing_profile_code)
    WHERE default_billing_profile_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_default_billing_profile
    ON organizations (default_billing_profile_code)
    WHERE default_billing_profile_code IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('079_client_master_default_billing_profile')
ON CONFLICT (version) DO NOTHING;

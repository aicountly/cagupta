-- Accounts-driven work hold on contacts (clients) and organizations: block new services & timesheets unless exempt.

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS work_hold_active BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS work_hold_notes TEXT,
    ADD COLUMN IF NOT EXISTS work_hold_set_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS work_hold_set_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN clients.work_hold_active IS 'When true, new engagements and time entries are blocked unless a work_hold_exceptions row applies.';

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS work_hold_active BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS work_hold_notes TEXT,
    ADD COLUMN IF NOT EXISTS work_hold_set_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS work_hold_set_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS work_hold_exceptions (
    id                  SERIAL PRIMARY KEY,
    client_id           INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    organization_id     INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    exception_kind      VARCHAR(16) NOT NULL,
    service_id          INTEGER REFERENCES services(id) ON DELETE CASCADE,
    expires_at          TIMESTAMPTZ,
    notes               TEXT,
    created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT work_hold_exc_entity_chk CHECK (
        (client_id IS NOT NULL AND organization_id IS NULL)
        OR (client_id IS NULL AND organization_id IS NOT NULL)
    ),
    CONSTRAINT work_hold_exc_kind_chk CHECK (
        (exception_kind = 'service' AND service_id IS NOT NULL AND expires_at IS NULL)
        OR (exception_kind = 'window' AND expires_at IS NOT NULL AND service_id IS NULL)
    ),
    CONSTRAINT work_hold_exc_kind_enum_chk CHECK (exception_kind IN ('service', 'window'))
);

CREATE INDEX IF NOT EXISTS idx_work_hold_exc_client ON work_hold_exceptions (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_hold_exc_org ON work_hold_exceptions (organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_hold_exc_expires ON work_hold_exceptions (expires_at) WHERE exception_kind = 'window';

CREATE TABLE IF NOT EXISTS work_hold_audit_log (
    id                  BIGSERIAL PRIMARY KEY,
    client_id           INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    organization_id     INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    action              VARCHAR(48) NOT NULL,
    actor_user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT work_hold_audit_entity_chk CHECK (
        (client_id IS NOT NULL AND organization_id IS NULL)
        OR (client_id IS NULL AND organization_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_work_hold_audit_client ON work_hold_audit_log (client_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_work_hold_audit_org ON work_hold_audit_log (organization_id, id DESC);

INSERT INTO schema_migrations (version) VALUES ('056_client_work_hold');

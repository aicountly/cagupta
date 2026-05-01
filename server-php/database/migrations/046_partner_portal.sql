-- =============================================================================
-- Migration 046 — Partner portal: profiles, assignments, payouts, bank details
-- =============================================================================

-- Partner role (permissions for portal users)
INSERT INTO roles (name, display_name, permissions, is_system) VALUES
(
    'partner',
    'Partner',
    '{"permissions": ["partner.portal","partner.profile","partner.assignments.view","partner.assignments.manage","partner.payouts.request","partner.bank.manage"]}',
    TRUE
)
ON CONFLICT (name) DO NOTHING;

-- Admin permission for managing partners
DO $$
BEGIN
    UPDATE roles
    SET permissions = jsonb_set(
        permissions::jsonb,
        '{permissions}',
        (permissions::jsonb -> 'permissions') || '["partners.manage"]'::jsonb
    )
    WHERE name IN ('super_admin', 'admin')
      AND NOT (permissions::jsonb -> 'permissions') @> '["partners.manage"]'::jsonb;
END $$;

-- Partner profiles
CREATE TABLE IF NOT EXISTS partner_profiles (
    user_id              INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    status               VARCHAR(20)  NOT NULL DEFAULT 'pending',
    specialty            VARCHAR(255),
    bio                  TEXT,
    approved_by          INTEGER REFERENCES users (id) ON DELETE SET NULL,
    approved_at          TIMESTAMPTZ,
    notes                TEXT,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT partner_profiles_status_chk CHECK (status IN ('pending', 'approved', 'suspended'))
);

CREATE INDEX IF NOT EXISTS idx_partner_profiles_status ON partner_profiles (status);

-- Partner payout rates per engagement type
CREATE TABLE IF NOT EXISTS partner_payout_rates (
    id                   SERIAL PRIMARY KEY,
    partner_user_id      INTEGER      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    engagement_type_id   INTEGER      REFERENCES engagement_types (id) ON DELETE SET NULL,
    rate_type            VARCHAR(20)  NOT NULL DEFAULT 'percentage',
    rate_value           NUMERIC(8,4) NOT NULL,
    effective_from       DATE         NOT NULL DEFAULT CURRENT_DATE,
    effective_to         DATE,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT partner_rates_type_chk CHECK (rate_type IN ('percentage', 'flat'))
);

CREATE INDEX IF NOT EXISTS idx_partner_rates_user ON partner_payout_rates (partner_user_id, effective_from DESC);

-- Partner bank details
CREATE TABLE IF NOT EXISTS partner_bank_details (
    id                   SERIAL PRIMARY KEY,
    user_id              INTEGER      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    account_holder_name  VARCHAR(200) NOT NULL,
    bank_name            VARCHAR(200),
    account_number_last4 VARCHAR(4),
    account_number_enc   TEXT,
    ifsc                 VARCHAR(20)  NOT NULL,
    is_primary           BOOLEAN      NOT NULL DEFAULT FALSE,
    verification_status  VARCHAR(20)  NOT NULL DEFAULT 'pending',
    verified_by          INTEGER REFERENCES users (id) ON DELETE SET NULL,
    verified_at          TIMESTAMPTZ,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT partner_bank_verification_chk CHECK (verification_status IN ('pending', 'verified', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_partner_bank_user ON partner_bank_details (user_id);

-- Partner work assignments (links a service to a partner)
CREATE TABLE IF NOT EXISTS partner_assignments (
    id                   SERIAL PRIMARY KEY,
    service_id           INTEGER      NOT NULL REFERENCES services (id) ON DELETE CASCADE,
    partner_user_id      INTEGER      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    assigned_by          INTEGER      REFERENCES users (id) ON DELETE SET NULL,
    assigned_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    status               VARCHAR(20)  NOT NULL DEFAULT 'assigned',
    partner_payout_pct   NUMERIC(8,4),
    partner_payout_flat  NUMERIC(14,2),
    notes                TEXT,
    completed_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT partner_assignments_status_chk CHECK (status IN ('assigned', 'in_progress', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_partner_assignments_partner ON partner_assignments (partner_user_id, status);
CREATE INDEX IF NOT EXISTS idx_partner_assignments_service ON partner_assignments (service_id);

-- Partner payout accruals (earned amounts per assignment)
CREATE TABLE IF NOT EXISTS partner_payout_accruals (
    id                   BIGSERIAL PRIMARY KEY,
    partner_user_id      INTEGER      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    assignment_id        INTEGER      REFERENCES partner_assignments (id) ON DELETE SET NULL,
    service_id           INTEGER      REFERENCES services (id) ON DELETE SET NULL,
    accrual_date         DATE         NOT NULL,
    fee_base             NUMERIC(14,2) NOT NULL DEFAULT 0,
    rate_percent         NUMERIC(8,4),
    amount               NUMERIC(14,2) NOT NULL,
    currency             VARCHAR(8)   NOT NULL DEFAULT 'INR',
    status               VARCHAR(20)  NOT NULL DEFAULT 'accrued',
    metadata             JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT partner_accruals_status_chk CHECK (status IN ('accrued', 'in_payout', 'paid', 'reversed'))
);

CREATE INDEX IF NOT EXISTS idx_partner_accruals_user ON partner_payout_accruals (partner_user_id, accrual_date DESC);
CREATE INDEX IF NOT EXISTS idx_partner_accruals_assignment ON partner_payout_accruals (assignment_id);

-- Partner payout requests
CREATE TABLE IF NOT EXISTS partner_payout_requests (
    id                   SERIAL PRIMARY KEY,
    partner_user_id      INTEGER      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    requested_amount     NUMERIC(14,2) NOT NULL,
    status               VARCHAR(20)  NOT NULL DEFAULT 'pending',
    admin_notes          TEXT,
    decided_by           INTEGER REFERENCES users (id) ON DELETE SET NULL,
    decided_at           TIMESTAMPTZ,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT partner_payout_requests_status_chk CHECK (status IN ('pending', 'approved', 'paid', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_partner_payout_requests_user ON partner_payout_requests (partner_user_id, created_at DESC);

-- Partner payout request line items
CREATE TABLE IF NOT EXISTS partner_payout_request_lines (
    id                   SERIAL PRIMARY KEY,
    payout_request_id    INTEGER NOT NULL REFERENCES partner_payout_requests (id) ON DELETE CASCADE,
    accrual_id           BIGINT  NOT NULL REFERENCES partner_payout_accruals (id) ON DELETE RESTRICT,
    amount               NUMERIC(14,2) NOT NULL,
    UNIQUE (accrual_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_payout_lines_request ON partner_payout_request_lines (payout_request_id);

INSERT INTO schema_migrations (version) VALUES ('046_partner_portal')
ON CONFLICT (version) DO NOTHING;

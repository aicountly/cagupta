-- =============================================================================
-- Migration 023 — Affiliate portal, commissions, payouts, invoice commission base
-- =============================================================================

-- Affiliate role (permissions for portal users)
INSERT INTO roles (name, display_name, permissions, is_system) VALUES
(
    'affiliate',
    'Affiliate',
    '{"permissions": ["affiliate.portal","affiliate.profile","affiliate.payouts.request","affiliate.sub_affiliates.create","affiliate.bank.manage"]}',
    TRUE
)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS firm_commission_defaults (
    id                          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    referral_year1_pct          NUMERIC(8,4) NOT NULL DEFAULT 10,
    referral_year2_pct          NUMERIC(8,4) NOT NULL DEFAULT 7,
    referral_year3_plus_pct     NUMERIC(8,4) NOT NULL DEFAULT 5,
    direct_affiliate_pct        NUMERIC(8,4) NOT NULL DEFAULT 50,
    direct_firm_pct             NUMERIC(8,4) NOT NULL DEFAULT 50,
    upline_sub_threshold_amount NUMERIC(14,2) NOT NULL DEFAULT 5000,
    upline_sub_bonus_amount     NUMERIC(14,2) NOT NULL DEFAULT 500,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO firm_commission_defaults (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS affiliate_profiles (
    user_id                    INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    status                     VARCHAR(20) NOT NULL DEFAULT 'pending',
    approved_by                INTEGER REFERENCES users (id) ON DELETE SET NULL,
    approved_at                TIMESTAMPTZ,
    parent_affiliate_user_id   INTEGER REFERENCES users (id) ON DELETE SET NULL,
    notes                      TEXT,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT affiliate_profiles_status_chk CHECK (status IN ('pending', 'approved', 'suspended'))
);

CREATE INDEX IF NOT EXISTS idx_affiliate_profiles_parent ON affiliate_profiles (parent_affiliate_user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_profiles_status ON affiliate_profiles (status);

CREATE TABLE IF NOT EXISTS affiliate_commission_rates (
    id                  SERIAL PRIMARY KEY,
    affiliate_user_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    tier                SMALLINT NOT NULL CHECK (tier IN (1, 2, 3)),
    percent             NUMERIC(8,4) NOT NULL,
    effective_from      DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to        DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_rates_user ON affiliate_commission_rates (affiliate_user_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS affiliate_upline_sub_tracker (
    parent_user_id              INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    child_user_id               INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    cumulative_child_commission NUMERIC(14,2) NOT NULL DEFAULT 0,
    blocks_paid                 INT NOT NULL DEFAULT 0,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (parent_user_id, child_user_id)
);

ALTER TABLE services ADD COLUMN IF NOT EXISTS referring_affiliate_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE services ADD COLUMN IF NOT EXISTS referral_start_date DATE;
ALTER TABLE services ADD COLUMN IF NOT EXISTS commission_mode VARCHAR(32) DEFAULT 'referral_only';
ALTER TABLE services ADD COLUMN IF NOT EXISTS client_facing_restricted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS commission_accruals (
    id                      BIGSERIAL PRIMARY KEY,
    affiliate_user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    invoice_txn_id          INTEGER REFERENCES txn (id) ON DELETE SET NULL,
    service_id              INTEGER REFERENCES services (id) ON DELETE SET NULL,
    accrual_type            VARCHAR(32) NOT NULL,
    accrual_date            DATE NOT NULL,
    commission_mode         VARCHAR(32),
    tier_used               SMALLINT,
    net_fee_base            NUMERIC(14,2) NOT NULL DEFAULT 0,
    rate_percent            NUMERIC(8,4),
    amount                  NUMERIC(14,2) NOT NULL,
    currency                VARCHAR(8) NOT NULL DEFAULT 'INR',
    status                  VARCHAR(20) NOT NULL DEFAULT 'accrued',
    child_affiliate_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT commission_accruals_type_chk CHECK (accrual_type IN ('invoice_commission', 'upline_sub_bonus', 'adjustment')),
    CONSTRAINT commission_accruals_status_chk CHECK (status IN ('accrued', 'in_payout', 'paid', 'reversed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_invoice_primary
    ON commission_accruals (invoice_txn_id, affiliate_user_id)
    WHERE accrual_type = 'invoice_commission' AND invoice_txn_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commission_accruals_affiliate ON commission_accruals (affiliate_user_id, accrual_date DESC);
CREATE INDEX IF NOT EXISTS idx_commission_accruals_invoice ON commission_accruals (invoice_txn_id);

CREATE TABLE IF NOT EXISTS affiliate_bank_details (
    id                   SERIAL PRIMARY KEY,
    user_id              INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    account_holder_name  VARCHAR(200) NOT NULL,
    bank_name            VARCHAR(200),
    account_number_last4 VARCHAR(4),
    account_number_enc   TEXT,
    ifsc                 VARCHAR(20) NOT NULL,
    is_primary           BOOLEAN NOT NULL DEFAULT FALSE,
    verification_status  VARCHAR(20) NOT NULL DEFAULT 'pending',
    verified_by          INTEGER REFERENCES users (id) ON DELETE SET NULL,
    verified_at          TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT affiliate_bank_verification_chk CHECK (verification_status IN ('pending', 'verified', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_affiliate_bank_user ON affiliate_bank_details (user_id);

CREATE TABLE IF NOT EXISTS payout_requests (
    id                   SERIAL PRIMARY KEY,
    affiliate_user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    requested_amount     NUMERIC(14,2) NOT NULL,
    status               VARCHAR(20) NOT NULL DEFAULT 'pending',
    fast_track           BOOLEAN NOT NULL DEFAULT FALSE,
    admin_notes          TEXT,
    decided_by           INTEGER REFERENCES users (id) ON DELETE SET NULL,
    decided_at           TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payout_requests_status_chk CHECK (status IN ('pending', 'approved', 'paid', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_payout_requests_affiliate ON payout_requests (affiliate_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payout_request_lines (
    id                     SERIAL PRIMARY KEY,
    payout_request_id      INTEGER NOT NULL REFERENCES payout_requests (id) ON DELETE CASCADE,
    commission_accrual_id  BIGINT NOT NULL REFERENCES commission_accruals (id) ON DELETE RESTRICT,
    amount                 NUMERIC(14,2) NOT NULL,
    UNIQUE (commission_accrual_id)
);

CREATE INDEX IF NOT EXISTS idx_payout_lines_payout ON payout_request_lines (payout_request_id);

INSERT INTO schema_migrations (version) VALUES ('023_affiliate_commissions')
ON CONFLICT (version) DO NOTHING;

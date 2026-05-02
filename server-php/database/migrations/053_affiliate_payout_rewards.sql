-- Affiliate payout_model (active/passive), active fee map, reward ledger, redemptions

ALTER TABLE affiliate_profiles
    ADD COLUMN IF NOT EXISTS payout_model VARCHAR(16) NOT NULL DEFAULT 'passive';

CREATE TABLE IF NOT EXISTS affiliate_active_fee_map (
    id                  SERIAL PRIMARY KEY,
    affiliate_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id           INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    service_id          INTEGER REFERENCES services(id) ON DELETE CASCADE,
    fixed_amount        NUMERIC(14,2) NOT NULL CHECK (fixed_amount >= 0),
    effective_from      DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to        DATE,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_active_fee_map_affiliate
    ON affiliate_active_fee_map (affiliate_user_id, client_id, service_id);

CREATE TABLE IF NOT EXISTS affiliate_reward_ledger (
    id                  BIGSERIAL PRIMARY KEY,
    affiliate_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta_points        INTEGER NOT NULL,
    kind                VARCHAR(24) NOT NULL,
    ref_type            VARCHAR(48),
    ref_id              BIGINT,
    label               VARCHAR(255),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT affiliate_reward_ledger_kind_chk CHECK (kind IN ('earn', 'redeem', 'adjust', 'reversal'))
);

CREATE INDEX IF NOT EXISTS idx_affiliate_reward_ledger_user
    ON affiliate_reward_ledger (affiliate_user_id, id DESC);

CREATE TABLE IF NOT EXISTS affiliate_redemption_requests (
    id                  SERIAL PRIMARY KEY,
    affiliate_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    catalog_key         VARCHAR(64) NOT NULL,
    points              INTEGER NOT NULL CHECK (points > 0),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',
    admin_notes         TEXT,
    fulfilled_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT affiliate_redemption_requests_status_chk CHECK (status IN ('pending', 'approved', 'rejected', 'fulfilled'))
);

CREATE INDEX IF NOT EXISTS idx_affiliate_redemption_user
    ON affiliate_redemption_requests (affiliate_user_id, created_at DESC);

INSERT INTO schema_migrations (version) VALUES ('053_affiliate_payout_rewards');

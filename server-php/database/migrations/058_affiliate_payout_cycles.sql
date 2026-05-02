-- Affiliate payout cycles (8th / 15th / 23rd / month-end), finalisation, disbursement SLA.

CREATE TABLE IF NOT EXISTS affiliate_payout_cycles (
    id                       SERIAL PRIMARY KEY,
    period_start             DATE NOT NULL,
    period_end               DATE NOT NULL,
    cycle_anchor             VARCHAR(12) NOT NULL,
    disbursal_due_on         DATE NOT NULL,
    status                   VARCHAR(20) NOT NULL DEFAULT 'open',
    total_system_amount      NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_final_amount       NUMERIC(14, 2) NOT NULL DEFAULT 0,
    finalised_at             TIMESTAMPTZ,
    finalised_by_user_id     INTEGER REFERENCES users (id) ON DELETE SET NULL,
    disbursed_at             TIMESTAMPTZ,
    disbursed_by_user_id     INTEGER REFERENCES users (id) ON DELETE SET NULL,
    accounts_notes           TEXT,
    sla_reminder_48h_at      TIMESTAMPTZ,
    sla_reminder_24h_at      TIMESTAMPTZ,
    sla_overdue_notified_at  TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT affiliate_payout_cycles_status_chk
        CHECK (status IN ('open', 'finalised', 'disbursed')),
    CONSTRAINT affiliate_payout_cycles_anchor_chk
        CHECK (cycle_anchor IN ('d08', 'd15', 'd23', 'eom')),
    CONSTRAINT affiliate_payout_cycles_period_chk CHECK (period_start <= period_end)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_payout_cycles_period
    ON affiliate_payout_cycles (period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_affiliate_payout_cycles_status_due
    ON affiliate_payout_cycles (status, disbursal_due_on);

ALTER TABLE commission_accruals
    ADD COLUMN IF NOT EXISTS affiliate_payout_cycle_id INTEGER REFERENCES affiliate_payout_cycles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commission_accruals_payout_cycle
    ON commission_accruals (affiliate_payout_cycle_id)
    WHERE affiliate_payout_cycle_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS affiliate_payout_cycle_lines (
    id                          BIGSERIAL PRIMARY KEY,
    affiliate_payout_cycle_id   INTEGER NOT NULL REFERENCES affiliate_payout_cycles (id) ON DELETE CASCADE,
    commission_accrual_id       BIGINT NOT NULL REFERENCES commission_accruals (id) ON DELETE RESTRICT,
    affiliate_user_id           INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    amount_system               NUMERIC(14, 2) NOT NULL,
    amount_final                NUMERIC(14, 2) NOT NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_affiliate_payout_cycle_line_accrual UNIQUE (commission_accrual_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_payout_cycle_lines_cycle
    ON affiliate_payout_cycle_lines (affiliate_payout_cycle_id);

CREATE TABLE IF NOT EXISTS affiliate_payout_cycle_amendments (
    id                          SERIAL PRIMARY KEY,
    affiliate_payout_cycle_id   INTEGER NOT NULL REFERENCES affiliate_payout_cycles (id) ON DELETE CASCADE,
    status                      VARCHAR(20) NOT NULL DEFAULT 'pending',
    adjustments_json          JSONB NOT NULL DEFAULT '[]'::jsonb,
    requested_by_user_id        INTEGER REFERENCES users (id) ON DELETE SET NULL,
    decided_by_user_id          INTEGER REFERENCES users (id) ON DELETE SET NULL,
    decided_at                  TIMESTAMPTZ,
    reject_reason               TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT affiliate_payout_cycle_amendments_status_chk
        CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_affiliate_payout_cycle_amendments_cycle
    ON affiliate_payout_cycle_amendments (affiliate_payout_cycle_id, status);

INSERT INTO schema_migrations (version) VALUES ('058_affiliate_payout_cycles');

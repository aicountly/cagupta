-- =============================================================================
-- Migration 026 — Appointment fee rules, billing columns on calendar_events,
--                 txn.appointment_id, Zoom OAuth tokens, Razorpay idempotency
-- =============================================================================

-- Fee rule templates (no services linkage)
CREATE TABLE IF NOT EXISTS appointment_fee_rules (
    id                         SERIAL PRIMARY KEY,
    name                       VARCHAR(200) NOT NULL,
    pricing_model              VARCHAR(20)  NOT NULL
        CHECK (pricing_model IN ('fixed_meeting', 'per_hour')),
    amount                     NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    default_billing_profile_code VARCHAR(50),
    default_line_description   VARCHAR(500),
    default_line_kind          VARCHAR(30) DEFAULT 'professional_fee'
        CHECK (default_line_kind IN ('professional_fee', 'cost_recovery')),
    is_active                  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointment_fee_rules_active ON appointment_fee_rules(is_active);

-- Zoom OAuth tokens per user (super-admin first)
CREATE TABLE IF NOT EXISTS zoom_oauth_tokens (
    user_id        INTEGER NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token   TEXT NOT NULL,
    refresh_token  TEXT NOT NULL,
    expires_at     TIMESTAMPTZ NOT NULL,
    scope          TEXT,
    account_id     VARCHAR(64),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Razorpay webhook idempotency
CREATE TABLE IF NOT EXISTS razorpay_webhook_events (
    id                   SERIAL PRIMARY KEY,
    razorpay_payment_id  VARCHAR(64),
    razorpay_order_id    VARCHAR(64),
    event_id             VARCHAR(64),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT razorpay_webhook_events_payment_or_order
        CHECK (razorpay_payment_id IS NOT NULL OR razorpay_order_id IS NOT NULL OR event_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_razorpay_webhook_payment
    ON razorpay_webhook_events(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_razorpay_webhook_event
    ON razorpay_webhook_events(event_id) WHERE event_id IS NOT NULL;

-- txn: link to appointment (invoice / receipt rows)
ALTER TABLE txn ADD COLUMN IF NOT EXISTS appointment_id INTEGER REFERENCES calendar_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_txn_appointment_id ON txn(appointment_id) WHERE appointment_id IS NOT NULL;

-- calendar_events: billing + Zoom + Razorpay + workflow
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS fee_rule_id INTEGER REFERENCES appointment_fee_rules(id) ON DELETE SET NULL;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS pricing_model VARCHAR(20);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS unit_amount NUMERIC(12,2);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS billable_hours NUMERIC(10,4);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS fee_subtotal NUMERIC(12,2);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS billing_profile_code VARCHAR(50);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS billing_profile_snapshot JSONB;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS billing_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(20);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(12,2);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS advance_percent NUMERIC(8,4);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS amount_due_now NUMERIC(12,2);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS amount_collected NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS appointment_status VARCHAR(30) NOT NULL DEFAULT 'confirmed';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(100);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS invoice_txn_id INTEGER REFERENCES txn(id) ON DELETE SET NULL;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS zoom_meeting_id VARCHAR(80);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS zoom_join_url TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS zoom_password VARCHAR(128);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS zoom_last_synced_at TIMESTAMPTZ;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS zoom_sync_error TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS invoice_line_description VARCHAR(500);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS invoice_line_kind VARCHAR(30)
    DEFAULT 'professional_fee';

DO $$
BEGIN
    ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_appointment_status_check
        CHECK (appointment_status IN ('draft', 'pending_payment', 'confirmed', 'cancelled'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_payment_terms_check
        CHECK (payment_terms IS NULL OR payment_terms IN ('full_advance', 'partial_advance', 'pay_later'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO schema_migrations (version) VALUES ('026_appointments_billing_zoom_razorpay')
ON CONFLICT (version) DO NOTHING;

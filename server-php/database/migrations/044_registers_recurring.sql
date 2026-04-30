-- =============================================================================
-- Migration 044 — Registers & Recurring Service Definitions
--
-- 1. Add `register_category` to engagement_types so each engagement type
--    knows which compliance register tab it belongs to (gst/tds/it/roc/pf).
--
-- 2. Create `recurring_service_definitions` — per-client compliance schedules
--    that drive expected register rows and due dates.
--
-- 3. Extend `registers` with all fields needed for live compliance tracking:
--    engagement_type_id, register_category, return_type, period_label,
--    period_start/end, filed_by, service_id, acknowledgment_number,
--    error_number, late_fee, recurring_definition_id.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. engagement_types — add register_category tag
-- ---------------------------------------------------------------------------
ALTER TABLE engagement_types
    ADD COLUMN IF NOT EXISTS register_category VARCHAR(20) DEFAULT NULL;

COMMENT ON COLUMN engagement_types.register_category IS
    'Maps this engagement type to a compliance register tab: gst | tds | it | roc | pf | payment. NULL = no register.';

CREATE INDEX IF NOT EXISTS idx_engagement_types_register_category
    ON engagement_types (register_category)
    WHERE register_category IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. recurring_service_definitions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recurring_service_definitions (
    id                  SERIAL          PRIMARY KEY,

    -- One of client_id or organization_id must be set
    client_id           INTEGER         REFERENCES clients(id) ON DELETE CASCADE,
    organization_id     INTEGER         REFERENCES organizations(id) ON DELETE CASCADE,

    engagement_type_id  INTEGER         NOT NULL REFERENCES engagement_types(id) ON DELETE RESTRICT,

    -- Recurrence schedule
    -- frequency: monthly | quarterly | half_yearly | annual
    frequency           VARCHAR(20)     NOT NULL DEFAULT 'monthly',

    -- Day-of-month the return is due (after the period ends)
    due_day             INTEGER         NOT NULL DEFAULT 20
                        CHECK (due_day BETWEEN 1 AND 31),

    -- Number of full months after the period end that due_day falls in.
    -- e.g. GSTR-3B: period = Mar, due_day = 20 in SAME month → due_offset_months = 0
    --       TDS 26Q: Q4 ends Mar, due = 31 May → due_offset_months = 2
    due_offset_months   INTEGER         NOT NULL DEFAULT 0,

    -- The return type label shown in the register (e.g. GSTR-3B, 26Q, ITR-6)
    return_type         VARCHAR(100)    NOT NULL DEFAULT '',

    start_date          DATE            NOT NULL,
    end_date            DATE            DEFAULT NULL,  -- NULL = indefinite

    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    notes               TEXT            DEFAULT NULL,

    created_by          INTEGER         REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rsd_client
    ON recurring_service_definitions (client_id)
    WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rsd_org
    ON recurring_service_definitions (organization_id)
    WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rsd_engagement_type
    ON recurring_service_definitions (engagement_type_id);

CREATE INDEX IF NOT EXISTS idx_rsd_active
    ON recurring_service_definitions (is_active, frequency);

-- ---------------------------------------------------------------------------
-- 3. registers — extend with compliance tracking columns
-- ---------------------------------------------------------------------------
ALTER TABLE registers
    ADD COLUMN IF NOT EXISTS engagement_type_id     INTEGER     REFERENCES engagement_types(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS register_category      VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS return_type            VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS period_label           VARCHAR(50)  DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS period_start           DATE         DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS period_end             DATE         DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS filed_by               INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS service_id             INTEGER      REFERENCES services(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS acknowledgment_number  VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS error_number           VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS late_fee               NUMERIC(10,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS recurring_definition_id INTEGER     REFERENCES recurring_service_definitions(id) ON DELETE SET NULL;

-- Unique constraint: one register row per (client/org + engagement_type + period_start)
-- so the completion hook can safely upsert without duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_registers_client_et_period
    ON registers (client_id, engagement_type_id, period_start)
    WHERE client_id IS NOT NULL AND engagement_type_id IS NOT NULL AND period_start IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_registers_org_et_period
    ON registers (organization_id, engagement_type_id, period_start)
    WHERE organization_id IS NOT NULL AND engagement_type_id IS NOT NULL AND period_start IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registers_category_status
    ON registers (register_category, status);

CREATE INDEX IF NOT EXISTS idx_registers_due_date
    ON registers (due_date, status);

CREATE INDEX IF NOT EXISTS idx_registers_service_id
    ON registers (service_id)
    WHERE service_id IS NOT NULL;

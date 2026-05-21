-- =============================================================================
-- Migration 080 — Flexible quotation pricing on engagement types
-- =============================================================================

ALTER TABLE engagement_types
    ADD COLUMN IF NOT EXISTS pricing_model VARCHAR(30) NOT NULL DEFAULT 'fixed',
    ADD COLUMN IF NOT EXISTS quotation_base_amount NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS quotation_hourly_rate NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS quotation_estimated_hours NUMERIC(12,4);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'engagement_types_pricing_model_chk'
    ) THEN
        ALTER TABLE engagement_types
            ADD CONSTRAINT engagement_types_pricing_model_chk
            CHECK (pricing_model IN ('fixed', 'per_hour', 'fixed_plus_additional'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS engagement_type_additional_fee_templates (
    id                  SERIAL PRIMARY KEY,
    engagement_type_id  INTEGER      NOT NULL REFERENCES engagement_types(id) ON DELETE CASCADE,
    label               VARCHAR(200) NOT NULL,
    fee_type            VARCHAR(20)  NOT NULL
        CHECK (fee_type IN ('fixed_per_event', 'per_hour', 'both')),
    fixed_amount        NUMERIC(14,2),
    hourly_rate         NUMERIC(14,2),
    sort_order          SMALLINT     NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_et_additional_fee_templates_et
    ON engagement_type_additional_fee_templates(engagement_type_id);

ALTER TABLE lead_quotations
    ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB NOT NULL DEFAULT '{}';

-- Migrate existing quotation default prices into engagement type fixed pricing
UPDATE engagement_types et
SET pricing_model = 'fixed',
    quotation_base_amount = d.default_price
FROM engagement_type_quotation_defaults d
WHERE d.engagement_type_id = et.id
  AND d.default_price IS NOT NULL
  AND et.quotation_base_amount IS NULL;

-- Backfill pricing_snapshot for existing lead quotations
UPDATE lead_quotations
SET pricing_snapshot = jsonb_build_object(
    'pricing_model', 'fixed',
    'base_amount', price
)
WHERE (pricing_snapshot IS NULL OR pricing_snapshot = '{}'::jsonb)
  AND price IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('080_engagement_type_quotation_pricing')
ON CONFLICT (version) DO NOTHING;

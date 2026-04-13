-- =============================================================================
-- Migration 015 — Quotation defaults per engagement type, lead quotations, lead FK
-- =============================================================================

CREATE TABLE IF NOT EXISTS engagement_type_quotation_defaults (
    engagement_type_id  INTEGER PRIMARY KEY REFERENCES engagement_types(id) ON DELETE CASCADE,
    default_price       NUMERIC(12,2),
    documents_required  JSONB        NOT NULL DEFAULT '[]',
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by          INTEGER      REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS lead_quotations (
    id                  SERIAL PRIMARY KEY,
    lead_id             INTEGER      NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    engagement_type_id  INTEGER      REFERENCES engagement_types(id) ON DELETE SET NULL,
    price               NUMERIC(12,2),
    documents_required  JSONB        NOT NULL DEFAULT '[]',
    status              VARCHAR(20)  NOT NULL DEFAULT 'draft',
    created_by          INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT lead_quotations_status_chk CHECK (status IN ('draft', 'final', 'sent'))
);

CREATE INDEX IF NOT EXISTS idx_lead_quotations_lead ON lead_quotations(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_quotations_status ON lead_quotations(lead_id, status);

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS engagement_type_id INTEGER REFERENCES engagement_types(id) ON DELETE SET NULL;
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS engagement_type_name VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_leads_engagement_type ON leads(engagement_type_id);

INSERT INTO schema_migrations (version) VALUES ('015_quotation_setup')
ON CONFLICT (version) DO NOTHING;

-- Grant quotation permissions (safe to run once; may duplicate if re-applied manually)
UPDATE roles SET permissions = jsonb_set(
    permissions,
    '{permissions}',
    COALESCE(permissions->'permissions', '[]'::jsonb) || '["quotations.setup","quotations.manage"]'::jsonb
) WHERE name = 'admin';

UPDATE roles SET permissions = jsonb_set(
    permissions,
    '{permissions}',
    COALESCE(permissions->'permissions', '[]'::jsonb) || '["quotations.manage"]'::jsonb
) WHERE name = 'manager';

-- =============================================================================
-- Migration 093 — Quotation document finalize state + share log
-- =============================================================================

ALTER TABLE lead_quotations
    ADD COLUMN IF NOT EXISTS documents_status VARCHAR(20) NOT NULL DEFAULT 'draft';

ALTER TABLE lead_quotations
    DROP CONSTRAINT IF EXISTS lead_quotations_documents_status_chk;

ALTER TABLE lead_quotations
    ADD CONSTRAINT lead_quotations_documents_status_chk
        CHECK (documents_status IN ('draft', 'final'));

CREATE TABLE IF NOT EXISTS quotation_shares (
    id                  SERIAL PRIMARY KEY,
    lead_quotation_id   INTEGER      NOT NULL REFERENCES lead_quotations(id) ON DELETE CASCADE,
    shared_by           INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    channel             VARCHAR(32)  NOT NULL,
    recipient_name      VARCHAR(200),
    recipient_email     VARCHAR(320),
    recipient_mobile    VARCHAR(30),
    share_token         VARCHAR(128) UNIQUE NOT NULL,
    pdf_path            VARCHAR(500) NOT NULL,
    expires_at          TIMESTAMPTZ  NOT NULL,
    status              VARCHAR(32)  NOT NULL DEFAULT 'sent',
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotation_shares_token ON quotation_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_quotation_shares_quotation ON quotation_shares(lead_quotation_id);

INSERT INTO schema_migrations (version) VALUES ('093_quotation_share')
ON CONFLICT (version) DO NOTHING;

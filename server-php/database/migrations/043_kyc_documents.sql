-- =============================================================================
-- Migration 042 — KYC Document Bank
--
-- Creates two tables:
--   kyc_documents      — one row per uploaded file (with versioning support)
--   kyc_document_audit — full activity log for every document action
--
-- Storage conventions
--   entity_type = 'contact'      → folder prefix CLT-{id:3d}
--   entity_type = 'organization' → folder prefix ORG-{id:3d}
--   doc_folder  = KYC  (uppercase category bucket for Phase 1)
--   Full path on disk: docu_bank/{KEY}/{doc_folder}/{stored_file_name}
-- =============================================================================

-- ---------------------------------------------------------------------------
-- kyc_documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kyc_documents (
    id                  SERIAL          PRIMARY KEY,

    -- Entity link
    entity_type         VARCHAR(20)     NOT NULL CHECK (entity_type IN ('contact','organization')),
    entity_id           INTEGER         NOT NULL,

    -- Document classification
    doc_folder          VARCHAR(50)     NOT NULL DEFAULT 'KYC',
    doc_category        VARCHAR(60)     NOT NULL,   -- e.g. 'pan', 'aadhaar', 'bank_proof'
    doc_label           VARCHAR(255)    NOT NULL DEFAULT '',  -- user-supplied e.g. "HDFC Savings"

    -- Versioning — version_number is 1-based; is_latest maintained by app
    version_number      INTEGER         NOT NULL DEFAULT 1,
    is_latest           BOOLEAN         NOT NULL DEFAULT TRUE,

    -- File metadata
    original_file_name  VARCHAR(512)    NOT NULL,
    stored_file_name    VARCHAR(512)    NOT NULL,   -- UUID-based, extension preserved
    file_path           TEXT            NOT NULL,   -- relative: docu_bank/CLT-001/KYC/…
    file_size           BIGINT          NOT NULL DEFAULT 0,
    original_size       BIGINT          NOT NULL DEFAULT 0,  -- before compression
    mime_type           VARCHAR(120)    NOT NULL DEFAULT '',
    is_compressed       BOOLEAN         NOT NULL DEFAULT TRUE,

    -- Soft-delete
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    deleted_at          TIMESTAMPTZ     NULL,
    deleted_by          INTEGER         REFERENCES users(id) ON DELETE SET NULL,

    -- Meta
    notes               TEXT            NULL,
    uploaded_by         INTEGER         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kyc_docs_entity
    ON kyc_documents (entity_type, entity_id, is_active);

CREATE INDEX IF NOT EXISTS idx_kyc_docs_category
    ON kyc_documents (entity_type, entity_id, doc_category, is_latest, is_active);

CREATE INDEX IF NOT EXISTS idx_kyc_docs_latest
    ON kyc_documents (entity_type, entity_id, doc_category, doc_label, is_latest)
    WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- kyc_document_audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kyc_document_audit (
    id              SERIAL          PRIMARY KEY,
    document_id     INTEGER         NOT NULL REFERENCES kyc_documents(id) ON DELETE CASCADE,

    -- Action: uploaded | viewed | downloaded | soft_deleted | restored |
    --          hard_deleted | label_updated | new_version_uploaded
    action          VARCHAR(60)     NOT NULL,

    actor_user_id   INTEGER         REFERENCES users(id) ON DELETE SET NULL,
    actor_name      VARCHAR(255)    NOT NULL DEFAULT '',
    ip_address      VARCHAR(45)     NULL,
    user_agent      TEXT            NULL,
    notes           TEXT            NULL,

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kyc_audit_document
    ON kyc_document_audit (document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kyc_audit_actor
    ON kyc_document_audit (actor_user_id, created_at DESC);

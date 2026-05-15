-- Track who last modified a txn row for listings and audit UX.

ALTER TABLE txn
    ADD COLUMN IF NOT EXISTS updated_by INT REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_txn_updated_by ON txn (updated_by) WHERE updated_by IS NOT NULL;

UPDATE txn
SET updated_by = created_by
WHERE updated_by IS NULL AND created_by IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('065_txn_updated_by')
ON CONFLICT (version) DO NOTHING;

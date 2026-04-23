-- ── Migration 033: Contact lifecycle status (active / inactive / prospect) ───
-- Persists the status chosen in the admin UI; `is_active` remains for legacy
-- queries and stays false only when contact_status = 'inactive'.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_status VARCHAR(20);

UPDATE clients
SET contact_status = CASE WHEN is_active IS FALSE THEN 'inactive' ELSE 'active' END
WHERE contact_status IS NULL OR TRIM(contact_status) = '';

ALTER TABLE clients ALTER COLUMN contact_status SET DEFAULT 'active';

UPDATE clients SET contact_status = 'active' WHERE contact_status IS NULL;

ALTER TABLE clients ALTER COLUMN contact_status SET NOT NULL;

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_contact_status_chk;

ALTER TABLE clients
    ADD CONSTRAINT clients_contact_status_chk
    CHECK (contact_status IN ('active', 'inactive', 'prospect'));

CREATE INDEX IF NOT EXISTS idx_clients_contact_status ON clients (contact_status);

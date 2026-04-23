-- CIN (Company Identification Number) for organizations + duplicate checks (PAN/GSTIN/CIN) enforced in application code.
-- Optional partial unique indexes can be added later after deduplicating any existing rows.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cin VARCHAR(25);

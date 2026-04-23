-- Optional website URL for contacts (clients), aligned with organizations for exception reporting.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS website VARCHAR(255);

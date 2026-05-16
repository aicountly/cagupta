-- Migration 070: Master Service Links
-- Adds is_master_service flag and self-referential master_service_id FK to services table.
-- A master service acts as an umbrella engagement; linked children are excluded from the
-- billing queue and their time/cost is rolled up to the master for invoicing.

ALTER TABLE services
  ADD COLUMN is_master_service  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN master_service_id  INTEGER REFERENCES services(id) ON DELETE SET NULL;

-- Prevent a service from being both a master and a child simultaneously.
ALTER TABLE services
  ADD CONSTRAINT chk_no_circular_master
    CHECK (NOT (is_master_service = TRUE AND master_service_id IS NOT NULL));

-- Fast lookup: all children of a given master.
CREATE INDEX idx_services_master_id ON services(master_service_id)
  WHERE master_service_id IS NOT NULL;

-- Fast lookup: all master services per client (used in billing report + linkable dropdown).
CREATE INDEX idx_services_is_master ON services(client_id, is_master_service)
  WHERE is_master_service = TRUE;

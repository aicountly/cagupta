-- Speed up Services & Tasks list filters and default sort at scale.

CREATE INDEX IF NOT EXISTS idx_services_status_due_date
    ON services (status, due_date);

CREATE INDEX IF NOT EXISTS idx_services_created_at_desc
    ON services (created_at DESC);

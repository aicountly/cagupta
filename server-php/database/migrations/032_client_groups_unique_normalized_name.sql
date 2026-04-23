-- ── Migration 032: Unique client group name (case-insensitive, trimmed) ─────
-- Merges any existing duplicates into the lowest id per normalized name, then
-- enforces uniqueness at the database level.

WITH ranked AS (
    SELECT id,
           MIN(id) OVER (PARTITION BY LOWER(TRIM(name))) AS keep_id
    FROM client_groups
)
UPDATE clients c
SET group_id = r.keep_id
FROM ranked r
WHERE c.group_id = r.id
  AND r.id <> r.keep_id;

WITH ranked AS (
    SELECT id,
           MIN(id) OVER (PARTITION BY LOWER(TRIM(name))) AS keep_id
    FROM client_groups
)
UPDATE organizations o
SET group_id = r.keep_id
FROM ranked r
WHERE o.group_id = r.id
  AND r.id <> r.keep_id;

WITH ranked AS (
    SELECT id,
           MIN(id) OVER (PARTITION BY LOWER(TRIM(name))) AS keep_id
    FROM client_groups
)
DELETE FROM client_groups cg
USING ranked r
WHERE cg.id = r.id
  AND r.id <> r.keep_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_groups_name_normalized
    ON client_groups (LOWER(TRIM(name)));

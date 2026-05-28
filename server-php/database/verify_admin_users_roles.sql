-- =============================================================================
-- Verify DB state for GET /api/admin/users and GET /api/admin/roles
-- Run in phpPgAdmin or psql against production database (cagupta_db).
-- =============================================================================

-- 1) Core tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('users', 'roles', 'schema_migrations')
ORDER BY table_name;

-- 2) Migrations required for user list (and delegate permissions)
SELECT version, applied_at
FROM schema_migrations
WHERE version IN (
    '001_initial_schema',
    '020_user_delegate_permissions',
    '025_time_entries_user_rates',
    '041_user_shift_target_minutes',
    '060_user_shift_target_disabled'
)
ORDER BY version;

-- Expected: 5 rows. Any missing version → run migrate.php or apply DDL below.

-- 3) Latest applied migrations (sanity check deploy runner)
SELECT version, applied_at
FROM schema_migrations
ORDER BY applied_at DESC
LIMIT 20;

-- 4) users columns (compare to app expectations)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
ORDER BY ordinal_position;

-- Must include at minimum:
--   id, name, email, role_id, is_active, is_email_verified, created_at, created_by
-- Optional but used by User Management UI:
--   planned_billable_rate_per_hour, shift_target_minutes, shift_target_disabled

-- 5) Quick check: optional user columns present?
SELECT
    EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'
          AND column_name = 'planned_billable_rate_per_hour'
    ) AS has_planned_rate,
    EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'
          AND column_name = 'shift_target_minutes'
    ) AS has_shift_target_minutes,
    EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'
          AND column_name = 'shift_target_disabled'
    ) AS has_shift_target_disabled;

-- 6) Same query the roles API runs (should return rows, no error)
SELECT id, name, display_name, permissions, is_system, created_at
FROM roles
ORDER BY id;

-- 7) Admin/manager roles have user-management permissions (migration 020)
SELECT
    name,
    permissions->'permissions' AS permission_list,
    (permissions->'permissions') @> '["users.manage"]'::jsonb AS has_users_manage,
    (permissions->'permissions') @> '["users.delegate"]'::jsonb AS has_users_delegate
FROM roles
WHERE name IN ('admin', 'manager', 'super_admin')
ORDER BY name;

-- 8) User list query (mirrors API paginate) — run as app DB user if possible
SELECT COUNT(*) AS user_count
FROM users u
LEFT JOIN roles r ON r.id = u.role_id
WHERE 1 = 1;

SELECT u.id, u.name, u.email, u.role_id, u.is_active, u.is_email_verified,
       u.avatar_url, u.last_login_at, u.login_provider, u.created_at,
       u.planned_billable_rate_per_hour, u.shift_target_minutes, u.shift_target_disabled,
       r.name AS role_name, r.display_name AS role_display_name
FROM users u
LEFT JOIN roles r ON r.id = u.role_id
WHERE 1 = 1
ORDER BY u.created_at DESC
LIMIT 20 OFFSET 0;

-- If step 8 errors on unknown column, apply fixes (safe to re-run):
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS planned_billable_rate_per_hour NUMERIC(12,2);
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS shift_target_minutes INTEGER NOT NULL DEFAULT 510;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS shift_target_disabled BOOLEAN NOT NULL DEFAULT FALSE;
-- Then record migrations (if not already):
-- INSERT INTO schema_migrations (version) VALUES ('025_time_entries_user_rates') ON CONFLICT DO NOTHING;
-- INSERT INTO schema_migrations (version) VALUES ('041_user_shift_target_minutes') ON CONFLICT DO NOTHING;
-- INSERT INTO schema_migrations (version) VALUES ('060_user_shift_target_disabled') ON CONFLICT DO NOTHING;

-- 9) Delegate filter column (used when user has users.delegate only)
SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'created_by'
) AS has_created_by;

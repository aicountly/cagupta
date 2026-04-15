-- =============================================================================
-- Migration 029 — PostgreSQL privileges for application DB user
-- =============================================================================
-- Replace cagupta_app below with the same name as DB_USER in server-php/.env
-- (must be an existing PostgreSQL role). If the role name needs double-quotes
-- (mixed case, hyphens, etc.), use: php database/print_app_grants.php
-- and run that output instead of this file.
--
-- Plain GRANT only (no DO block) so GUI clients cannot drop a leading "D".

GRANT USAGE ON SCHEMA public TO cagupta_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cagupta_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cagupta_app;

INSERT INTO schema_migrations (version) VALUES ('029_app_pg_grants')
ON CONFLICT (version) DO NOTHING;

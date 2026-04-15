-- =============================================================================
-- Migration 029 — PostgreSQL privileges for application DB user
-- =============================================================================
-- If PHP connects as a non-owner role (common in production), that role needs
-- USAGE on schema public plus DML on tables/sequences. Migrations run as the
-- owner (e.g. postgres) do not grant those to other roles automatically.
--
-- Edit `app_role` below to match DB_USER in server-php/.env (e.g. cagupta_app).
-- If that role does not exist yet, this block only logs a NOTICE and skips
-- (typical local dev using superuser-only). Create the role, adjust `app_role`,
-- then run the GRANT section manually or re-apply this file in psql.

DO $grant$
DECLARE
    app_role CONSTANT text := 'cagupta_app';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
        RAISE NOTICE '029_app_pg_grants: role % not found — skipping GRANT (create role or change app_role in 029_app_pg_grants.sql).', app_role;
        RETURN;
    END IF;

    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app_role);
    EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I',
        app_role
    );
    EXECUTE format(
        'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I',
        app_role
    );
END $grant$;

INSERT INTO schema_migrations (version) VALUES ('029_app_pg_grants')
ON CONFLICT (version) DO NOTHING;

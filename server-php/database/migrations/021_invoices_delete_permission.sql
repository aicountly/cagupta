-- Grant invoices.delete to admin role (ledger invoice txn deletion + OTP flow).
-- super_admin uses "*" and already passes PermissionFilter.

UPDATE roles SET permissions = jsonb_set(
    permissions,
    '{permissions}',
    COALESCE(permissions->'permissions', '[]'::jsonb) || '["invoices.delete"]'::jsonb
) WHERE name = 'admin'
  AND NOT (COALESCE(permissions->'permissions', '[]'::jsonb) @> '["invoices.delete"]'::jsonb);

INSERT INTO schema_migrations (version) VALUES ('021_invoices_delete_permission')
ON CONFLICT (version) DO NOTHING;

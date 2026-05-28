-- Portal types and register types: grantable via Settings > Roles & Permissions.
-- super_admin uses "*" and already passes PermissionFilter without explicit keys.

UPDATE roles SET permissions = jsonb_set(
    permissions,
    '{permissions}',
    COALESCE(permissions->'permissions', '[]'::jsonb) || '["portal_types.manage"]'::jsonb
) WHERE name = 'admin'
  AND NOT (COALESCE(permissions->'permissions', '[]'::jsonb) @> '["portal_types.manage"]'::jsonb);

UPDATE roles SET permissions = jsonb_set(
    permissions,
    '{permissions}',
    COALESCE(permissions->'permissions', '[]'::jsonb) || '["register_types.manage"]'::jsonb
) WHERE name = 'admin'
  AND NOT (COALESCE(permissions->'permissions', '[]'::jsonb) @> '["register_types.manage"]'::jsonb);

INSERT INTO schema_migrations (version) VALUES ('098_portal_register_types_permissions')
ON CONFLICT (version) DO NOTHING;

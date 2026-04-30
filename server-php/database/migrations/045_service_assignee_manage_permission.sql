-- Grant services.assignees.manage to admin role.
-- This permission controls who can add, replace, or remove assignees on service engagements.
-- Manager does not receive it by default; it can be toggled via Settings > Roles & Permissions.
-- super_admin uses "*" and already passes PermissionFilter without needing explicit keys.

UPDATE roles SET permissions = jsonb_set(
    permissions,
    '{permissions}',
    COALESCE(permissions->'permissions', '[]'::jsonb) || '["services.assignees.manage"]'::jsonb
) WHERE name = 'admin'
  AND NOT (COALESCE(permissions->'permissions', '[]'::jsonb) @> '["services.assignees.manage"]'::jsonb);

INSERT INTO schema_migrations (version) VALUES ('045_service_assignee_manage_permission')
ON CONFLICT (version) DO NOTHING;

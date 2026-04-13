-- Team permissions: full user admin vs delegate (subordinates created_by acting user).
-- Admin role gets users.manage; manager gets users.delegate for hierarchy delegation.

UPDATE roles SET permissions = jsonb_set(
    permissions,
    '{permissions}',
    COALESCE(permissions->'permissions', '[]'::jsonb) || '["users.manage","users.delegate"]'::jsonb
) WHERE name = 'admin'
  AND NOT (COALESCE(permissions->'permissions', '[]'::jsonb) @> '["users.manage"]'::jsonb);

UPDATE roles SET permissions = jsonb_set(
    permissions,
    '{permissions}',
    COALESCE(permissions->'permissions', '[]'::jsonb) || '["users.delegate"]'::jsonb
) WHERE name = 'manager'
  AND NOT (COALESCE(permissions->'permissions', '[]'::jsonb) @> '["users.delegate"]'::jsonb);

INSERT INTO schema_migrations (version) VALUES ('020_user_delegate_permissions')
ON CONFLICT (version) DO NOTHING;

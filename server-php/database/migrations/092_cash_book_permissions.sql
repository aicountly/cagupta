-- Cash book permissions: staff may maintain petty / counter cash (cash accounts only).

UPDATE roles SET permissions = jsonb_set(
    permissions,
    '{permissions}',
    COALESCE(permissions->'permissions', '[]'::jsonb) || '["cash_book.view"]'::jsonb
)
WHERE name = 'staff'
  AND NOT (COALESCE(permissions->'permissions', '[]'::jsonb) @> '["cash_book.view"]'::jsonb);

UPDATE roles SET permissions = jsonb_set(
    permissions,
    '{permissions}',
    COALESCE(permissions->'permissions', '[]'::jsonb) || '["cash_book.create"]'::jsonb
)
WHERE name = 'staff'
  AND NOT (COALESCE(permissions->'permissions', '[]'::jsonb) @> '["cash_book.create"]'::jsonb);

UPDATE roles SET permissions = jsonb_set(
    permissions,
    '{permissions}',
    COALESCE(permissions->'permissions', '[]'::jsonb) || '["cash_book.edit"]'::jsonb
)
WHERE name = 'staff'
  AND NOT (COALESCE(permissions->'permissions', '[]'::jsonb) @> '["cash_book.edit"]'::jsonb);

INSERT INTO schema_migrations (version) VALUES ('092_cash_book_permissions')
ON CONFLICT (version) DO NOTHING;

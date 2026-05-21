-- Team chat: DMs, group channels, append-only messages, audit events.

CREATE TABLE IF NOT EXISTS chat_conversations (
    id                  SERIAL PRIMARY KEY,
    type                VARCHAR(10) NOT NULL,
    title               VARCHAR(255),
    created_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    dm_user_a_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    dm_user_b_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    last_message_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chat_conversations_type_chk CHECK (type IN ('dm', 'channel')),
    CONSTRAINT chat_conversations_dm_pair_chk CHECK (
        (type = 'dm' AND dm_user_a_id IS NOT NULL AND dm_user_b_id IS NOT NULL AND dm_user_a_id < dm_user_b_id)
        OR (type = 'channel' AND dm_user_a_id IS NULL AND dm_user_b_id IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_conversations_dm_pair
    ON chat_conversations (dm_user_a_id, dm_user_b_id)
    WHERE type = 'dm';

CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_message
    ON chat_conversations (last_message_at DESC);

CREATE TABLE IF NOT EXISTS chat_conversation_members (
    id                      BIGSERIAL PRIMARY KEY,
    conversation_id         INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    user_id                 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_message_id    BIGINT,
    joined_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at                 TIMESTAMPTZ,
    CONSTRAINT uq_chat_conversation_members UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_conversation_members_user
    ON chat_conversation_members (user_id)
    WHERE left_at IS NULL;

CREATE TABLE IF NOT EXISTS chat_messages (
    id                  BIGSERIAL PRIMARY KEY,
    conversation_id     INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body_text           TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
    ON chat_messages (conversation_id, id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created
    ON chat_messages (created_at DESC);

CREATE TABLE IF NOT EXISTS chat_message_events (
    id                  BIGSERIAL PRIMARY KEY,
    message_id          BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    conversation_id     INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    sender_name         VARCHAR(255) NOT NULL DEFAULT '',
    body_text           TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_message_events_created
    ON chat_message_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_message_events_conversation
    ON chat_message_events (conversation_id, id);

-- chat.use permission for staff, affiliates, and partners
UPDATE roles SET permissions = jsonb_set(
    permissions,
    '{permissions}',
    COALESCE(permissions->'permissions', '[]'::jsonb) || '["chat.use"]'::jsonb
)
WHERE name IN ('super_admin', 'admin', 'manager', 'staff', 'viewer', 'accounts', 'affiliate', 'partner')
  AND NOT (COALESCE(permissions->'permissions', '[]'::jsonb) @> '["chat.use"]'::jsonb);

-- Default General channel
INSERT INTO chat_conversations (type, title, created_by_user_id, last_message_at)
SELECT 'channel', 'General', u.id, NOW()
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM chat_conversations WHERE type = 'channel' AND title = 'General')
ORDER BY u.id
LIMIT 1;

INSERT INTO chat_conversation_members (conversation_id, user_id, joined_at)
SELECT c.id, u.id, NOW()
FROM chat_conversations c
CROSS JOIN users u
JOIN roles r ON r.id = u.role_id
WHERE c.type = 'channel' AND c.title = 'General'
  AND u.is_active = true
  AND (
    COALESCE(r.permissions->'permissions', '[]'::jsonb) @> '["chat.use"]'::jsonb
    OR COALESCE(r.permissions->'permissions', '[]'::jsonb) @> '["*"]'::jsonb
  )
ON CONFLICT (conversation_id, user_id) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('086_team_chat')
ON CONFLICT (version) DO NOTHING;

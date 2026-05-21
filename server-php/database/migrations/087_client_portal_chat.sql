-- Client portal chat: extend team chat for client_support threads + bot/staff/client messages.

ALTER TABLE chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_type_chk;
ALTER TABLE chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_dm_pair_chk;

ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS client_entity_type VARCHAR(20);
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS client_contact_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS client_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS client_last_read_message_id BIGINT;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS staff_last_read_message_id BIGINT;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS needs_attention BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS last_escalated_at TIMESTAMPTZ;

ALTER TABLE chat_conversations ADD CONSTRAINT chat_conversations_type_chk
    CHECK (type IN ('dm', 'channel', 'client_support'));

ALTER TABLE chat_conversations ADD CONSTRAINT chat_conversations_shape_chk CHECK (
    (type = 'dm' AND dm_user_a_id IS NOT NULL AND dm_user_b_id IS NOT NULL AND dm_user_a_id < dm_user_b_id)
    OR (type = 'channel' AND dm_user_a_id IS NULL AND dm_user_b_id IS NULL
        AND client_entity_type IS NULL AND client_contact_id IS NULL AND client_organization_id IS NULL)
    OR (type = 'client_support' AND dm_user_a_id IS NULL AND dm_user_b_id IS NULL
        AND client_entity_type IN ('contact', 'organization')
        AND (
            (client_entity_type = 'contact' AND client_contact_id IS NOT NULL)
            OR (client_entity_type = 'organization' AND client_organization_id IS NOT NULL)
        ))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_client_support_contact
    ON chat_conversations (client_contact_id)
    WHERE type = 'client_support' AND client_entity_type = 'contact';

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_client_support_org
    ON chat_conversations (client_organization_id)
    WHERE type = 'client_support' AND client_entity_type = 'organization';

CREATE INDEX IF NOT EXISTS idx_chat_conversations_client_support
    ON chat_conversations (last_message_at DESC)
    WHERE type = 'client_support';

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_kind VARCHAR(20) NOT NULL DEFAULT 'staff';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_display_name VARCHAR(255);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_kind_chk;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_sender_kind_chk
    CHECK (sender_kind IN ('staff', 'client', 'bot'));

ALTER TABLE chat_message_events ADD COLUMN IF NOT EXISTS sender_kind VARCHAR(20) NOT NULL DEFAULT 'staff';

CREATE TABLE IF NOT EXISTS client_chat_rate_limits (
    conversation_id INTEGER PRIMARY KEY REFERENCES chat_conversations(id) ON DELETE CASCADE,
    window_start    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    message_count   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS client_assistant_faq (
    id          SERIAL PRIMARY KEY,
    question    TEXT NOT NULL,
    answer      TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO client_assistant_faq (question, answer, sort_order) VALUES
('What services does your CA firm offer?', 'We offer tax filing, GST compliance, audit support, company incorporation, bookkeeping, payroll, and advisory services for individuals and businesses across India.', 1),
('How do I share documents with the firm?', 'You can upload documents through the Documents section in your service engagement, or email them to our office address shown on your profile. For sensitive files, use the secure portal upload where available.', 2),
('When is the income tax return due date?', 'Individual and non-audit cases typically fall due on 31 July (extendable by government notification). Audit cases and businesses often have 31 October deadlines. Always check the latest CBDT notifications for the current assessment year.', 3),
('How can I track my service status?', 'Open Active services in My CA to see ongoing engagements, pending tasks, and follow-ups from our team.', 4),
('Is chat advice legally binding?', 'Messages from the CA Assistant are general information only and not formal tax or legal advice. For decisions affecting your affairs, please consult our team directly.', 5);

UPDATE roles SET permissions = jsonb_set(
    permissions,
    '{permissions}',
    COALESCE(permissions->'permissions', '[]'::jsonb) || '["client.chat.use"]'::jsonb
)
WHERE name = 'client'
  AND NOT (COALESCE(permissions->'permissions', '[]'::jsonb) @> '["client.chat.use"]'::jsonb);

UPDATE roles SET permissions = jsonb_set(
    permissions,
    '{permissions}',
    COALESCE(permissions->'permissions', '[]'::jsonb) || '["client.chat.manage"]'::jsonb
)
WHERE name IN ('super_admin', 'admin', 'manager', 'staff', 'accounts')
  AND NOT (COALESCE(permissions->'permissions', '[]'::jsonb) @> '["client.chat.manage"]'::jsonb);

INSERT INTO schema_migrations (version) VALUES ('087_client_portal_chat')
ON CONFLICT (version) DO NOTHING;

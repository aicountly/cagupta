-- Inbound email + support tickets (Brevo inbound webhook)

CREATE TABLE IF NOT EXISTS inbound_emails (
    id              SERIAL PRIMARY KEY,
    message_id      VARCHAR(512),
    from_email      VARCHAR(320) NOT NULL,
    from_name       VARCHAR(255),
    to_emails       TEXT NOT NULL DEFAULT '',
    subject         TEXT,
    body_text       TEXT,
    body_html       TEXT,
    raw_payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at         TIMESTAMPTZ,
    archived_at     TIMESTAMPTZ,
    matched_client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inbound_emails_message_id
    ON inbound_emails (message_id) WHERE message_id IS NOT NULL AND message_id <> '';

CREATE INDEX IF NOT EXISTS idx_inbound_emails_received ON inbound_emails (received_at DESC);

CREATE TABLE IF NOT EXISTS inbound_email_attachments (
    id                 SERIAL PRIMARY KEY,
    inbound_email_id   INTEGER NOT NULL REFERENCES inbound_emails(id) ON DELETE CASCADE,
    filename           VARCHAR(512),
    content_type       VARCHAR(128),
    size_bytes         INTEGER,
    external_ref       VARCHAR(256),
    stored_url         TEXT
);

CREATE TABLE IF NOT EXISTS support_tickets (
    id                       SERIAL PRIMARY KEY,
    public_id                VARCHAR(32) NOT NULL UNIQUE,
    status                   VARCHAR(20) NOT NULL DEFAULT 'open',
    subject                  TEXT,
    primary_inbound_email_id INTEGER REFERENCES inbound_emails(id) ON DELETE SET NULL,
    created_from             VARCHAR(20) NOT NULL DEFAULT 'email',
    picked_by_user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    picked_at                TIMESTAMPTZ,
    resolution_notes         TEXT,
    related_client_id        INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT support_tickets_status_chk CHECK (status IN ('open', 'picked', 'resolved', 'closed')),
    CONSTRAINT support_tickets_created_from_chk CHECK (created_from IN ('email', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id                 BIGSERIAL PRIMARY KEY,
    support_ticket_id  INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    direction          VARCHAR(10) NOT NULL,
    body_text          TEXT,
    body_html          TEXT,
    sent_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    email_message_id   VARCHAR(512),
    CONSTRAINT support_ticket_messages_direction_chk CHECK (direction IN ('inbound', 'outbound', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON support_ticket_messages (support_ticket_id, id);

CREATE TABLE IF NOT EXISTS ticket_routing_settings (
    id                         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    default_assignee_user_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
    monitored_inbox_email      VARCHAR(320) NOT NULL DEFAULT 'office@carahulgupta.in',
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ticket_routing_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE services ADD COLUMN IF NOT EXISTS source_support_ticket_id INTEGER REFERENCES support_tickets(id) ON DELETE SET NULL;

INSERT INTO schema_migrations (version) VALUES ('052_inbound_support');

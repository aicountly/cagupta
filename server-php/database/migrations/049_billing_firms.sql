-- Server-side billing firms (replaces browser-only localStorage as source of truth).

CREATE TABLE IF NOT EXISTS billing_firms (
    code                VARCHAR(50) PRIMARY KEY,
    name                VARCHAR(255) NOT NULL,
    gst_registered      BOOLEAN NOT NULL DEFAULT FALSE,
    gstin               VARCHAR(20),
    state_code          VARCHAR(2),
    default_gst_rate    NUMERIC(5,2) NOT NULL DEFAULT 18 CHECK (default_gst_rate >= 0 AND default_gst_rate <= 40),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_firms_name ON billing_firms (name);

INSERT INTO billing_firms (code, name, gst_registered, gstin, state_code, default_gst_rate)
VALUES
    ('RBGC-CHD', 'RAHUL B GUPTA & CO. CHD', FALSE, '', '', 18),
    ('RBGC-JAL', 'RAHUL B GUPTA & CO. JAL', FALSE, '', '', 18),
    ('PROFS', 'PROFSINDIA VIRTUAL SERVICES LLP', FALSE, '', '', 18),
    ('TEFL', 'TRADE ERA FILINGS LLP', FALSE, '', '', 18)
ON CONFLICT (code) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('049_billing_firms');

-- Migration: create_payments_table
-- Creates a `payments` table for recording individual invoice payments.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'payments'
    ) THEN
        CREATE TABLE payments (
            id                   SERIAL PRIMARY KEY,
            invoice_id           INT            NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
            amount               NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
            payment_date         DATE           NOT NULL DEFAULT CURRENT_DATE,
            payment_method       VARCHAR(50),
            reference_number     VARCHAR(255),
            billing_profile_code VARCHAR(50),
            notes                TEXT,
            created_by           INT            REFERENCES users(id) ON DELETE SET NULL,
            created_at           TIMESTAMP      NOT NULL DEFAULT NOW()
        );

        CREATE INDEX idx_payments_invoice_id ON payments (invoice_id);
        CREATE INDEX idx_payments_payment_date ON payments (payment_date);

        INSERT INTO schema_migrations (version) VALUES ('005_create_payments_table')
        ON CONFLICT (version) DO NOTHING;
    END IF;
END;
$$;

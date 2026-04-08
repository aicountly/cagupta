-- =============================================================================
-- Migration 011 — Unified Transaction (txn) Table
-- Consolidates opening_balances, payments, invoices into a single txn table
-- and adds support for receipts, TDS, rebate/discount, and credit notes.
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'txn'
    ) THEN

        CREATE TABLE txn (
            id              SERIAL PRIMARY KEY,
            client_id       INT REFERENCES clients(id) ON DELETE CASCADE,
            organization_id INT REFERENCES organizations(id) ON DELETE SET NULL,
            txn_type        VARCHAR(30) NOT NULL,
            -- txn_type values: 'opening_balance', 'payment_expense', 'invoice',
            --                  'receipt', 'tds_provisional', 'tds_final',
            --                  'rebate', 'credit_note'
            txn_date        DATE NOT NULL DEFAULT CURRENT_DATE,
            narration       TEXT,
            debit           NUMERIC(14,2) NOT NULL DEFAULT 0,
            credit          NUMERIC(14,2) NOT NULL DEFAULT 0,
            amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
            billing_profile_code VARCHAR(50),

            -- Invoice-specific fields (nullable for non-invoice rows)
            invoice_number  VARCHAR(50),
            service_id      INT REFERENCES services(id) ON DELETE SET NULL,
            due_date        DATE,
            subtotal        NUMERIC(14,2),
            tax_percent     NUMERIC(5,2),
            tax_amount      NUMERIC(14,2),
            invoice_status  VARCHAR(20), -- draft, sent, partially_paid, paid, cancelled

            -- Payment/Receipt fields
            payment_method  VARCHAR(50),
            reference_number VARCHAR(100),

            -- TDS-specific fields
            tds_status      VARCHAR(20), -- 'provisional' or 'final'
            tds_section     VARCHAR(20), -- e.g., '194J', '194C', etc.
            tds_rate        NUMERIC(5,2),

            -- Credit Note / Linking
            linked_txn_id   INT REFERENCES txn(id) ON DELETE SET NULL,

            -- Common
            notes           TEXT,
            status          VARCHAR(20) NOT NULL DEFAULT 'active', -- active, cancelled, reversed
            created_by      INT REFERENCES users(id) ON DELETE SET NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX idx_txn_client ON txn(client_id);
        CREATE INDEX idx_txn_type   ON txn(txn_type);
        CREATE INDEX idx_txn_date   ON txn(txn_date);
        CREATE INDEX idx_txn_tds_status ON txn(tds_status) WHERE tds_status IS NOT NULL;

        -- ── Data migration: opening_balances ──────────────────────────────────
        INSERT INTO txn (
            client_id, txn_type, txn_date, narration,
            debit, credit, amount,
            billing_profile_code, status, created_at, updated_at
        )
        SELECT
            ob.client_id,
            'opening_balance'              AS txn_type,
            CURRENT_DATE                   AS txn_date,
            'Opening Balance'              AS narration,
            CASE WHEN ob.type = 'debit'  THEN ob.amount ELSE 0 END AS debit,
            CASE WHEN ob.type = 'credit' THEN ob.amount ELSE 0 END AS credit,
            ob.amount,
            ob.billing_profile_code,
            'active'                       AS status,
            ob.created_at,
            ob.updated_at
        FROM opening_balances ob;

        -- ── Data migration: invoices ──────────────────────────────────────────
        INSERT INTO txn (
            client_id, organization_id, txn_type, txn_date, narration,
            debit, credit, amount,
            billing_profile_code, invoice_number, service_id,
            due_date, subtotal, tax_percent, tax_amount, invoice_status,
            notes, status, created_by, created_at, updated_at
        )
        SELECT
            i.client_id,
            i.organization_id,
            'invoice'                      AS txn_type,
            i.invoice_date                 AS txn_date,
            i.invoice_number               AS narration,
            COALESCE(i.total, 0)           AS debit,
            0                              AS credit,
            COALESCE(i.total, 0)           AS amount,
            i.billing_profile_code,
            i.invoice_number,
            i.service_id,
            i.due_date,
            i.subtotal,
            i.tax_percent,
            i.tax_amount,
            i.status                       AS invoice_status,
            i.notes,
            'active'                       AS status,
            i.created_by,
            i.created_at,
            i.updated_at
        FROM invoices i;

        -- ── Data migration: payments ──────────────────────────────────────────
        INSERT INTO txn (
            client_id, organization_id, txn_type, txn_date, narration,
            debit, credit, amount,
            billing_profile_code, payment_method, reference_number,
            notes, status, created_by, created_at
        )
        SELECT
            i.client_id,
            i.organization_id,
            'payment_expense'              AS txn_type,
            p.payment_date                 AS txn_date,
            CONCAT('Payment — ', COALESCE(p.payment_method, 'Transfer')) AS narration,
            0                              AS debit,
            p.amount                       AS credit,
            p.amount,
            p.billing_profile_code,
            p.payment_method,
            p.reference_number,
            p.notes,
            'active'                       AS status,
            p.created_by,
            p.created_at
        FROM payments p
        JOIN invoices i ON i.id = p.invoice_id;

        INSERT INTO schema_migrations (version) VALUES ('011_create_txn_table')
        ON CONFLICT (version) DO NOTHING;
    END IF;
END;
$$;

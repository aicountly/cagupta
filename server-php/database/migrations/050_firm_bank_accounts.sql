-- Bank / cash accounts per billing firm; link receipts & payments to bank account.

CREATE TABLE IF NOT EXISTS firm_bank_accounts (
    id                       SERIAL PRIMARY KEY,
    billing_firm_code        VARCHAR(50) NOT NULL REFERENCES billing_firms(code) ON DELETE RESTRICT,
    name                     VARCHAR(200) NOT NULL,
    account_type             VARCHAR(20) NOT NULL CHECK (account_type IN ('bank', 'cash')),
    currency                 VARCHAR(8) NOT NULL DEFAULT 'INR',
    is_active                BOOLEAN NOT NULL DEFAULT TRUE,
    opening_balance          NUMERIC(14,2) NOT NULL DEFAULT 0,
    opening_balance_date     DATE,
    account_number_last4     VARCHAR(4),
    ifsc                     VARCHAR(20),
    notes                    TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_firm_bank_accounts_firm ON firm_bank_accounts (billing_firm_code);
CREATE INDEX IF NOT EXISTS idx_firm_bank_accounts_active ON firm_bank_accounts (billing_firm_code) WHERE is_active = TRUE;

ALTER TABLE txn ADD COLUMN IF NOT EXISTS firm_bank_account_id INTEGER REFERENCES firm_bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE txn ADD COLUMN IF NOT EXISTS counterparty_firm_bank_account_id INTEGER REFERENCES firm_bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE txn ADD COLUMN IF NOT EXISTS firm_expense_category VARCHAR(64);

INSERT INTO schema_migrations (version) VALUES ('050_firm_bank_accounts');

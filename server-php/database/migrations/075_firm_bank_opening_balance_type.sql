-- Opening balance Dr/Cr for firm bank/cash accounts (amount stored unsigned).

ALTER TABLE firm_bank_accounts
    ADD COLUMN IF NOT EXISTS opening_balance_type VARCHAR(10) NOT NULL DEFAULT 'debit';

ALTER TABLE firm_bank_accounts
    DROP CONSTRAINT IF EXISTS firm_bank_accounts_opening_balance_type_check;

ALTER TABLE firm_bank_accounts
    ADD CONSTRAINT firm_bank_accounts_opening_balance_type_check
    CHECK (opening_balance_type IN ('debit', 'credit'));

UPDATE firm_bank_accounts
SET opening_balance_type = 'debit'
WHERE opening_balance_type IS NULL OR opening_balance_type NOT IN ('debit', 'credit');

INSERT INTO schema_migrations (version) VALUES ('075_firm_bank_opening_balance_type');

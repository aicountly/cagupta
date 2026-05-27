-- Allow reinstate action on ledger txn change approval requests.

ALTER TABLE ledger_txn_change_requests
    DROP CONSTRAINT IF EXISTS ledger_txn_change_requests_action_chk;

ALTER TABLE ledger_txn_change_requests
    ADD CONSTRAINT ledger_txn_change_requests_action_chk
        CHECK (action IN ('update', 'reverse', 'cancel', 'cancel_reversal', 'reinstate'));

INSERT INTO schema_migrations (version) VALUES ('092_ledger_txn_reinstate_action')
ON CONFLICT (version) DO NOTHING;

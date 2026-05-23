-- Submission reason for payout cycle amendments (Team Approvals context).

ALTER TABLE affiliate_payout_cycle_amendments
    ADD COLUMN IF NOT EXISTS request_reason TEXT;

ALTER TABLE partner_payout_cycle_amendments
    ADD COLUMN IF NOT EXISTS request_reason TEXT;

INSERT INTO schema_migrations (version) VALUES ('091_payout_amendment_request_reason');

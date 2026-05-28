-- =============================================================================
-- Migration 099 — Rename Affiliate terminology to Associate (full schema rename)
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '099_rename_affiliate_to_associate') THEN
        RAISE NOTICE 'Migration 099_rename_affiliate_to_associate already applied — skipping.';
        RETURN;
    END IF;

    -- ── Role slug, display name, and permission keys ───────────────────────
    UPDATE roles
    SET permissions = replace(
            replace(
                replace(
                    replace(
                        replace(
                            replace(
                                replace(permissions::text, 'affiliates.manage', 'associates.manage'),
                                'affiliate.sub_affiliates.create', 'associate.sub_associates.create'),
                            'affiliate.payouts.request', 'associate.payouts.request'),
                        'affiliate.bank.manage', 'associate.bank.manage'),
                    'affiliate.profile', 'associate.profile'),
                'affiliate.portal', 'associate.portal')
        )::jsonb
    WHERE permissions::text LIKE '%affiliate%';

    UPDATE roles
    SET name = 'associate', display_name = 'Associate'
    WHERE name = 'affiliate';

    -- ── Firm commission defaults column ────────────────────────────────────────
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'firm_commission_defaults' AND column_name = 'direct_affiliate_pct'
    ) THEN
        ALTER TABLE firm_commission_defaults RENAME COLUMN direct_affiliate_pct TO direct_associate_pct;
    END IF;

    -- ── Referring associate on master records ────────────────────────────────
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'referring_affiliate_user_id'
    ) THEN
        ALTER TABLE clients RENAME COLUMN referring_affiliate_user_id TO referring_associate_user_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'referring_affiliate_user_id'
    ) THEN
        ALTER TABLE organizations RENAME COLUMN referring_affiliate_user_id TO referring_associate_user_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'services' AND column_name = 'referring_affiliate_user_id'
    ) THEN
        ALTER TABLE services RENAME COLUMN referring_affiliate_user_id TO referring_associate_user_id;
    END IF;

    -- ── Commission accruals columns ──────────────────────────────────────────
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'commission_accruals' AND column_name = 'affiliate_user_id'
    ) THEN
        ALTER TABLE commission_accruals RENAME COLUMN affiliate_user_id TO associate_user_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'commission_accruals' AND column_name = 'child_affiliate_user_id'
    ) THEN
        ALTER TABLE commission_accruals RENAME COLUMN child_affiliate_user_id TO child_associate_user_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'commission_accruals' AND column_name = 'affiliate_payout_cycle_id'
    ) THEN
        ALTER TABLE commission_accruals RENAME COLUMN affiliate_payout_cycle_id TO associate_payout_cycle_id;
    END IF;

    -- ── Payout requests ──────────────────────────────────────────────────────
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payout_requests' AND column_name = 'affiliate_user_id'
    ) THEN
        ALTER TABLE payout_requests RENAME COLUMN affiliate_user_id TO associate_user_id;
    END IF;

    -- ── Service log visibility enum value ────────────────────────────────────
    UPDATE service_logs SET visibility = 'associate' WHERE visibility = 'affiliate';

    ALTER TABLE service_logs DROP CONSTRAINT IF EXISTS service_logs_visibility_check;
    ALTER TABLE service_logs ADD CONSTRAINT service_logs_visibility_check
        CHECK (visibility IN ('internal', 'associate', 'client'));

    -- ── Rename affiliate tables to associate ─────────────────────────────────
    IF to_regclass('public.affiliate_profiles') IS NOT NULL THEN
        ALTER TABLE affiliate_profiles RENAME TO associate_profiles;
    END IF;

    IF to_regclass('public.affiliate_commission_rates') IS NOT NULL THEN
        ALTER TABLE affiliate_commission_rates RENAME TO associate_commission_rates;
    END IF;

    IF to_regclass('public.affiliate_upline_sub_tracker') IS NOT NULL THEN
        ALTER TABLE affiliate_upline_sub_tracker RENAME TO associate_upline_sub_tracker;
    END IF;

    IF to_regclass('public.affiliate_bank_details') IS NOT NULL THEN
        ALTER TABLE affiliate_bank_details RENAME TO associate_bank_details;
    END IF;

    IF to_regclass('public.affiliate_active_fee_map') IS NOT NULL THEN
        ALTER TABLE affiliate_active_fee_map RENAME TO associate_active_fee_map;
    END IF;

    IF to_regclass('public.affiliate_reward_ledger') IS NOT NULL THEN
        ALTER TABLE affiliate_reward_ledger RENAME TO associate_reward_ledger;
    END IF;

    IF to_regclass('public.affiliate_redemption_requests') IS NOT NULL THEN
        ALTER TABLE affiliate_redemption_requests RENAME TO associate_redemption_requests;
    END IF;

    IF to_regclass('public.affiliate_payout_cycles') IS NOT NULL THEN
        ALTER TABLE affiliate_payout_cycles RENAME TO associate_payout_cycles;
    END IF;

    IF to_regclass('public.affiliate_payout_cycle_lines') IS NOT NULL THEN
        ALTER TABLE affiliate_payout_cycle_lines RENAME TO associate_payout_cycle_lines;
    END IF;

    IF to_regclass('public.affiliate_payout_cycle_amendments') IS NOT NULL THEN
        ALTER TABLE affiliate_payout_cycle_amendments RENAME TO associate_payout_cycle_amendments;
    END IF;

    IF to_regclass('public.marketing_affiliate_prospects') IS NOT NULL THEN
        ALTER TABLE marketing_affiliate_prospects RENAME TO marketing_associate_prospects;
    END IF;

    -- ── Rename columns inside associate tables ───────────────────────────────
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'associate_profiles' AND column_name = 'parent_affiliate_user_id'
    ) THEN
        ALTER TABLE associate_profiles RENAME COLUMN parent_affiliate_user_id TO parent_associate_user_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'associate_commission_rates' AND column_name = 'affiliate_user_id'
    ) THEN
        ALTER TABLE associate_commission_rates RENAME COLUMN affiliate_user_id TO associate_user_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'associate_active_fee_map' AND column_name = 'affiliate_user_id'
    ) THEN
        ALTER TABLE associate_active_fee_map RENAME COLUMN affiliate_user_id TO associate_user_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'associate_reward_ledger' AND column_name = 'affiliate_user_id'
    ) THEN
        ALTER TABLE associate_reward_ledger RENAME COLUMN affiliate_user_id TO associate_user_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'associate_redemption_requests' AND column_name = 'affiliate_user_id'
    ) THEN
        ALTER TABLE associate_redemption_requests RENAME COLUMN affiliate_user_id TO associate_user_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'associate_payout_cycle_lines' AND column_name = 'affiliate_payout_cycle_id'
    ) THEN
        ALTER TABLE associate_payout_cycle_lines RENAME COLUMN affiliate_payout_cycle_id TO associate_payout_cycle_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'associate_payout_cycle_lines' AND column_name = 'affiliate_user_id'
    ) THEN
        ALTER TABLE associate_payout_cycle_lines RENAME COLUMN affiliate_user_id TO associate_user_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'associate_payout_cycle_amendments' AND column_name = 'affiliate_payout_cycle_id'
    ) THEN
        ALTER TABLE associate_payout_cycle_amendments RENAME COLUMN affiliate_payout_cycle_id TO associate_payout_cycle_id;
    END IF;

    -- ── Audit / notification entity types ────────────────────────────────────
    IF to_regclass('public.admin_audit_log') IS NOT NULL THEN
        UPDATE admin_audit_log
        SET action = replace(action, 'affiliate_', 'associate_')
        WHERE action LIKE '%affiliate_%';
    END IF;

    UPDATE user_notifications
    SET entity_type = replace(entity_type, 'affiliate_', 'associate_')
    WHERE entity_type LIKE '%affiliate_%';

    UPDATE user_notifications
    SET kind = replace(kind, 'affiliate_', 'associate_')
    WHERE kind LIKE '%affiliate_%';

    INSERT INTO schema_migrations (version) VALUES ('099_rename_affiliate_to_associate')
    ON CONFLICT (version) DO NOTHING;

    RAISE NOTICE 'Migration 099_rename_affiliate_to_associate applied successfully.';
END;
$$;

-- Migration 027 — Referral master on contacts (clients) and organizations
-- Commission tier "referral start" is resolved from client master first, then legacy services.referral_start_date.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS referring_affiliate_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS referral_start_date DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS commission_mode VARCHAR(32) DEFAULT 'referral_only';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_facing_restricted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS referring_affiliate_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS referral_start_date DATE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS commission_mode VARCHAR(32) DEFAULT 'referral_only';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS client_facing_restricted BOOLEAN NOT NULL DEFAULT FALSE;

-- Conservative backfill: copy from the latest service per contact/org only when master affiliate is still null
UPDATE clients c
SET
    referring_affiliate_user_id = s.referring_affiliate_user_id,
    referral_start_date = COALESCE(c.referral_start_date, s.referral_start_date),
    commission_mode = s.commission_mode
FROM (
    SELECT DISTINCT ON (client_id)
        client_id,
        referring_affiliate_user_id,
        referral_start_date,
        commission_mode
    FROM services
    WHERE client_id IS NOT NULL
      AND COALESCE(client_type, 'contact') = 'contact'
    ORDER BY client_id, id DESC
) s
WHERE c.id = s.client_id
  AND c.referring_affiliate_user_id IS NULL
  AND s.referring_affiliate_user_id IS NOT NULL;

UPDATE organizations o
SET
    referring_affiliate_user_id = s.referring_affiliate_user_id,
    referral_start_date = COALESCE(o.referral_start_date, s.referral_start_date),
    commission_mode = s.commission_mode
FROM (
    SELECT DISTINCT ON (organization_id)
        organization_id,
        referring_affiliate_user_id,
        referral_start_date,
        commission_mode
    FROM services
    WHERE organization_id IS NOT NULL
      AND COALESCE(client_type, 'contact') = 'organization'
    ORDER BY organization_id, id DESC
) s
WHERE o.id = s.organization_id
  AND o.referring_affiliate_user_id IS NULL
  AND s.referring_affiliate_user_id IS NOT NULL;

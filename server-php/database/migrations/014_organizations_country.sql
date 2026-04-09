-- Country for organizations (aligned with clients / contact address UX)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'India';

-- Legacy rows that stored non-India as state label
UPDATE organizations SET country = 'Other' WHERE state = 'Outside India';

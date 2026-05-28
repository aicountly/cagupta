-- ============================================================
-- 097 · Office calendar (weekly off days + holidays for shift targets)
-- ============================================================
-- weekly_off_days bitmask: Sun=1, Mon=2, Tue=4, Wed=8, Thu=16, Fri=32, Sat=64

CREATE TABLE IF NOT EXISTS office_calendar_settings (
    id              SERIAL PRIMARY KEY,
    weekly_off_days SMALLINT NOT NULL DEFAULT 1,
    updated_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO office_calendar_settings (weekly_off_days)
SELECT 1
WHERE NOT EXISTS (SELECT 1 FROM office_calendar_settings LIMIT 1);

CREATE TABLE IF NOT EXISTS office_holidays (
    id           SERIAL PRIMARY KEY,
    holiday_date DATE NOT NULL UNIQUE,
    name         VARCHAR(120) NOT NULL,
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_office_holidays_date ON office_holidays (holiday_date);

INSERT INTO schema_migrations (version) VALUES ('097_office_calendar')
ON CONFLICT (version) DO NOTHING;

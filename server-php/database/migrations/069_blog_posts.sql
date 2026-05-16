-- ============================================================
-- 069 · Blog Posts & AI Draft Management
-- ============================================================

-- ── Blog Posts (published content) ───────────────────────────
CREATE TABLE IF NOT EXISTS blog_posts (
    id               SERIAL PRIMARY KEY,
    title            VARCHAR(500) NOT NULL,
    slug             VARCHAR(500) NOT NULL UNIQUE,
    excerpt          TEXT,
    content          TEXT NOT NULL,
    cover_image_path VARCHAR(500),
    category         VARCHAR(50)  NOT NULL DEFAULT 'laws', -- laws | tax_saving
    status           VARCHAR(32)  NOT NULL DEFAULT 'draft', -- draft | published
    source           VARCHAR(32)  NOT NULL DEFAULT 'manual', -- manual | ai
    created_by       INTEGER REFERENCES users(id),
    approved_by      INTEGER REFERENCES users(id),
    published_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status    ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category  ON blog_posts(category);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug      ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published_at DESC);

-- ── AI Draft Options (awaiting human approval) ────────────────
CREATE TABLE IF NOT EXISTS blog_ai_drafts (
    id               SERIAL PRIMARY KEY,
    topic            TEXT         NOT NULL,
    category         VARCHAR(50)  NOT NULL DEFAULT 'laws', -- laws | tax_saving
    option_index     SMALLINT     NOT NULL DEFAULT 1,       -- 1 or 2 (which AI option)
    title            VARCHAR(500) NOT NULL,
    excerpt          TEXT,
    content          TEXT         NOT NULL,
    cover_image_path VARCHAR(500),
    status           VARCHAR(32)  NOT NULL DEFAULT 'pending', -- pending | approved | rejected
    blog_post_id     INTEGER REFERENCES blog_posts(id),       -- set on approval
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blog_ai_drafts_status   ON blog_ai_drafts(status);
CREATE INDEX IF NOT EXISTS idx_blog_ai_drafts_category ON blog_ai_drafts(category);

-- ── Blog Email Logs (per-publish send tracking) ───────────────
CREATE TABLE IF NOT EXISTS blog_email_logs (
    id               SERIAL PRIMARY KEY,
    blog_post_id     INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recipients_count INTEGER NOT NULL DEFAULT 0,
    success_count    INTEGER NOT NULL DEFAULT 0,
    status           VARCHAR(32) NOT NULL DEFAULT 'sent' -- sent | partial | failed
);
CREATE INDEX IF NOT EXISTS idx_blog_email_logs_post ON blog_email_logs(blog_post_id);

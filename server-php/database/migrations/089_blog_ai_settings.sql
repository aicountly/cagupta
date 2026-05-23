-- ============================================================
-- 089 · Blog AI provider settings (text + image generation)
-- ============================================================

CREATE TABLE IF NOT EXISTS blog_ai_settings (
    id             SERIAL PRIMARY KEY,
    text_provider  VARCHAR(32) NOT NULL DEFAULT 'openai',
    image_provider VARCHAR(32) NOT NULL DEFAULT 'dalle',
    updated_by     INTEGER REFERENCES users(id),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO blog_ai_settings (text_provider, image_provider)
SELECT 'openai', 'dalle'
WHERE NOT EXISTS (SELECT 1 FROM blog_ai_settings LIMIT 1);

ALTER TABLE blog_ai_drafts
    ADD COLUMN IF NOT EXISTS text_provider  VARCHAR(32),
    ADD COLUMN IF NOT EXISTS image_provider VARCHAR(32);

INSERT INTO schema_migrations (version) VALUES ('089_blog_ai_settings')
ON CONFLICT (version) DO NOTHING;

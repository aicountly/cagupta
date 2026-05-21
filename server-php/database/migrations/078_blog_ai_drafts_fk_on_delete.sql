-- ============================================================
-- 078 · Allow blog post delete when linked from AI drafts
-- ============================================================
-- blog_ai_drafts.blog_post_id blocked DELETE on blog_posts because the FK
-- had no ON DELETE action. SET NULL preserves draft history after post removal.

ALTER TABLE blog_ai_drafts
    DROP CONSTRAINT IF EXISTS blog_ai_drafts_blog_post_id_fkey;

ALTER TABLE blog_ai_drafts
    ADD CONSTRAINT blog_ai_drafts_blog_post_id_fkey
    FOREIGN KEY (blog_post_id) REFERENCES blog_posts(id) ON DELETE SET NULL;

INSERT INTO schema_migrations (version) VALUES ('078_blog_ai_drafts_fk_on_delete')
ON CONFLICT (version) DO NOTHING;

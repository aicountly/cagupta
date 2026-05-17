<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Libraries\BlogAiGenerator;
use App\Libraries\BrevoMailer;

/**
 * BlogController — Blog Posts & AI Draft Management
 *
 * Routes prefix: /api/marketing/blog  (authenticated)
 *                /api/public/blogs    (unauthenticated, for marketing site)
 *
 * Blog posts:
 *   GET    /api/marketing/blog/posts              — list all posts
 *   POST   /api/marketing/blog/posts              — create manual post
 *   PUT    /api/marketing/blog/posts/:id          — update post
 *   DELETE /api/marketing/blog/posts/:id          — delete post
 *   POST   /api/marketing/blog/posts/:id/publish  — publish + email blast
 *
 * AI drafts:
 *   GET    /api/marketing/blog/drafts             — list drafts (pending)
 *   PUT    /api/marketing/blog/drafts/:id         — edit draft
 *   POST   /api/marketing/blog/drafts/:id/approve — approve → publishes post
 *   POST   /api/marketing/blog/drafts/:id/reject  — reject draft
 *   POST   /api/marketing/blog/generate-ai-drafts — run daily AI generator (same as cron)
 *
 * Uploads:
 *   POST   /api/marketing/blog/upload-image       — upload cover image
 *
 * Public (no auth):
 *   GET    /api/public/blogs                      — published posts (for marketing site)
 *   GET    /api/public/blogs/:slug                — single published post
 *   GET    /api/public/blog-covers/:file          — cover image bytes (storage outside public_html)
 */
class BlogController extends BaseController
{
    private ?\PDO $db = null;

    private function db(): \PDO
    {
        if ($this->db === null) {
            $this->db = \App\Config\Database::getConnection();
        }
        return $this->db;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Send a message to a WhatsApp Channel via the WA Bridge (Baileys).
     * Silently returns false when the bridge is unavailable.
     */
    private function dispatchWaChannel(int $posterId, string $channelJid, string $message): bool
    {
        $bridgeUrl = rtrim($_ENV['WA_BRIDGE_URL'] ?? 'http://localhost:3001', '/');
        $sessionId = 'user_' . $posterId;

        $ch = curl_init("{$bridgeUrl}/send");
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS     => json_encode([
                'sessionId'  => $sessionId,
                'targetId'   => $channelJid,
                'targetType' => 'newsletter',
                'message'    => $message,
            ]),
            CURLOPT_TIMEOUT        => 15,
        ]);
        $body   = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $ok = $status >= 200 && $status < 300;
        if (!$ok) {
            error_log("[BlogController] WA Channel dispatch failed (HTTP {$status}): {$body}");
        }
        return $ok;
    }

    /**
     * Absolute directory for blog cover files on disk (BLOG_UPLOADS_PATH or server-php/blog_uploads).
     */
    private function blogUploadDir(): string
    {
        $configured = (string)(getenv('BLOG_UPLOADS_PATH') ?: ($_ENV['BLOG_UPLOADS_PATH'] ?? ''));
        if ($configured !== '') {
            return rtrim($configured, '/\\');
        }

        return dirname(__DIR__, 4) . DIRECTORY_SEPARATOR . 'blog_uploads';
    }

    /**
     * Public URL for a cover file stored in blog_uploads/.
     * Honors BASE_URL when it already ends with /api (production subdirectory installs).
     */
    private function blogCoverPublicUrl(string $filename): string
    {
        $base = rtrim((string)($_ENV['BASE_URL'] ?? 'http://localhost:8080'), '/');
        $file = basename($filename);
        if ($file === '') {
            return '';
        }
        $suffix = '/public/blog-covers/' . rawurlencode($file);
        if (str_ends_with($base, '/api')) {
            return $base . $suffix;
        }

        return $base . '/api' . $suffix;
    }

    private function slugify(string $text): string
    {
        $slug = strtolower(trim($text));
        $slug = preg_replace('/[^a-z0-9\s-]/', '', $slug) ?? $slug;
        $slug = preg_replace('/[\s-]+/', '-', $slug) ?? $slug;
        return trim($slug, '-');
    }

    private function uniqueSlug(string $base, ?int $excludeId = null): string
    {
        $slug = $this->slugify($base);
        $original = $slug;
        $i = 2;
        while (true) {
            $sql = 'SELECT id FROM blog_posts WHERE slug = :slug';
            $params = [':slug' => $slug];
            if ($excludeId !== null) {
                $sql .= ' AND id != :eid';
                $params[':eid'] = $excludeId;
            }
            $exists = $this->db()->prepare($sql);
            $exists->execute($params);
            if ($exists->fetch() === false) {
                break;
            }
            $slug = "{$original}-{$i}";
            $i++;
        }
        return $slug;
    }

    private function coverImageUrl(string $path): string
    {
        if ($path === '') {
            return '';
        }
        $path = str_replace('\\', '/', $path);
        if (str_contains($path, '..')) {
            return '';
        }
        // Stored under BLOG_UPLOADS_PATH — served via public API (not direct filesystem URL).
        if (str_starts_with($path, 'blog_uploads/')) {
            return $this->blogCoverPublicUrl(basename($path));
        }
        // Legacy: files that lived under web public/uploads/blog/
        $baseUrl = rtrim((string)($_ENV['BASE_URL'] ?? 'http://localhost:8080'), '/');
        return "{$baseUrl}/" . ltrim($path, '/');
    }

    private function formatPost(array $row): array
    {
        $row['cover_image_url'] = $this->coverImageUrl((string)($row['cover_image_path'] ?? ''));
        return $row;
    }

    // ── Blog Posts — CRUD ────────────────────────────────────────────────────

    public function blogIndex(): never
    {
        $category = $this->query('category', '');
        $status   = $this->query('status', '');
        $page     = max(1, (int)$this->query('page', 1));
        $limit    = 20;
        $offset   = ($page - 1) * $limit;

        $where = [];
        $params = [];

        if ($category !== '') {
            $where[] = 'category = :cat';
            $params[':cat'] = $category;
        }
        if ($status !== '') {
            $where[] = 'status = :status';
            $params[':status'] = $status;
        }

        $whereClause = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        $countStmt = $this->db()->prepare("SELECT COUNT(*) FROM blog_posts {$whereClause}");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db()->prepare("
            SELECT p.*, u.name AS author_name
            FROM   blog_posts p
            LEFT JOIN users u ON u.id = p.created_by
            {$whereClause}
            ORDER  BY p.created_at DESC
            LIMIT  :lim OFFSET :off
        ");
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':lim', $limit, \PDO::PARAM_INT);
        $stmt->bindValue(':off', $offset, \PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        $rows = array_map(fn($r) => $this->formatPost($r), $rows);

        $this->success($rows, 'OK', 200, ['total' => $total, 'page' => $page, 'limit' => $limit]);
    }

    public function blogStore(): never
    {
        $user = $this->authUser();
        $body = $this->getJsonBody();

        $title    = trim((string)($body['title'] ?? ''));
        $content  = trim((string)($body['content'] ?? ''));
        $category = (string)($body['category'] ?? 'laws');
        $excerpt  = trim((string)($body['excerpt'] ?? ''));
        $coverImg = trim((string)($body['cover_image_path'] ?? ''));

        if ($title === '')   $this->error('title is required.', 422);
        if ($content === '') $this->error('content is required.', 422);
        if (!in_array($category, ['laws', 'tax_saving', 'ai_promotions', 'subsidies_promotions', 'funding_promotions'], true)) {
            $this->error('category must be laws, tax_saving, ai_promotions, subsidies_promotions, or funding_promotions.', 422);
        }

        $slug = $this->uniqueSlug($title);

        $row = false;
        try {
            $stmt = $this->db()->prepare('
                INSERT INTO blog_posts
                    (title, slug, excerpt, content, cover_image_path, category, status, source, created_by)
                VALUES
                    (:title, :slug, :excerpt, :content, :cover, :cat, :status, :source, :uid)
                RETURNING id, created_at
            ');
            $stmt->execute([
                ':title'   => $title,
                ':slug'    => $slug,
                ':excerpt' => $excerpt,
                ':content' => $content,
                ':cover'   => $coverImg ?: null,
                ':cat'     => $category,
                ':status'  => 'draft',
                ':source'  => 'manual',
                ':uid'     => $user['id'],
            ]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        } catch (\PDOException $e) {
            error_log('[BlogController::blogStore] PDOException: ' . $e->getMessage());
            $this->error('Failed to save blog post. ' . $e->getMessage(), 500);
        }

        if ($row === false || !isset($row['id'])) {
            $this->error('Failed to save blog post: database did not return an ID.', 500);
        }

        $this->success(['id' => (int)$row['id'], 'slug' => $slug], 'Blog post created', 201);
    }

    public function blogUpdate(int $id): never
    {
        $user = $this->authUser();
        $body = $this->getJsonBody();

        $existing = $this->db()->prepare('SELECT * FROM blog_posts WHERE id = :id');
        $existing->execute([':id' => $id]);
        $post = $existing->fetch(\PDO::FETCH_ASSOC);
        if (!$post) $this->error('Post not found.', 404);

        $title    = trim((string)($body['title'] ?? $post['title']));
        $content  = trim((string)($body['content'] ?? $post['content']));
        $excerpt  = trim((string)($body['excerpt'] ?? $post['excerpt']));
        $category = (string)($body['category'] ?? $post['category']);
        $coverImg = isset($body['cover_image_path']) ? trim((string)$body['cover_image_path']) : $post['cover_image_path'];

        if (!in_array($category, ['laws', 'tax_saving', 'ai_promotions', 'subsidies_promotions', 'funding_promotions'], true)) {
            $this->error('category must be laws, tax_saving, ai_promotions, subsidies_promotions, or funding_promotions.', 422);
        }

        $slug = $title !== $post['title'] ? $this->uniqueSlug($title, $id) : $post['slug'];

        $stmt = $this->db()->prepare('
            UPDATE blog_posts
            SET title = :title, slug = :slug, excerpt = :excerpt, content = :content,
                cover_image_path = :cover, category = :cat, updated_at = NOW()
            WHERE id = :id
        ');
        $stmt->execute([
            ':title'   => $title,
            ':slug'    => $slug,
            ':excerpt' => $excerpt,
            ':content' => $content,
            ':cover'   => $coverImg,
            ':cat'     => $category,
            ':id'      => $id,
        ]);

        $this->success(['id' => $id, 'slug' => $slug], 'Post updated');
    }

    public function blogDelete(int $id): never
    {
        $stmt = $this->db()->prepare('DELETE FROM blog_posts WHERE id = :id RETURNING id');
        $stmt->execute([':id' => $id]);
        if (!$stmt->fetch()) $this->error('Post not found.', 404);

        $this->success(null, 'Post deleted');
    }

    public function blogPublish(int $id): never
    {
        $user          = $this->authUser();
        $body          = $this->getJsonBody();
        $sendEmail     = !empty($body['send_email']);
        $sendWaChannel = !empty($body['send_wa_channel']);
        $waChannelJid  = trim((string)($body['wa_channel_jid'] ?? ''));

        $existing = $this->db()->prepare('SELECT * FROM blog_posts WHERE id = :id');
        $existing->execute([':id' => $id]);
        $post = $existing->fetch(\PDO::FETCH_ASSOC);
        if (!$post) $this->error('Post not found.', 404);

        if ($post['status'] === 'published') {
            $this->success(null, 'Post already published');
        }

        $this->db()->prepare('
            UPDATE blog_posts
            SET status = :status, approved_by = :uid, published_at = NOW(), updated_at = NOW()
            WHERE id = :id
        ')->execute([':status' => 'published', ':uid' => $user['id'], ':id' => $id]);

        $emailStats = null;
        if ($sendEmail) {
            $emailStats = $this->dispatchBlogEmail(
                (int)$post['id'],
                (string)$post['title'],
                (string)$post['excerpt'],
                (string)$post['slug']
            );
        }

        $waOk = null;
        if ($sendWaChannel && $waChannelJid !== '') {
            $baseUrl = rtrim((string)($_ENV['MARKETING_SITE_URL'] ?? $_ENV['BASE_URL'] ?? ''), '/');
            $blogUrl = "{$baseUrl}/blog/{$post['slug']}";
            $waMsg   = "*New blog post:* {$post['title']}\n\n{$post['excerpt']}\n\n{$blogUrl}";
            $waOk    = $this->dispatchWaChannel((int)$user['id'], $waChannelJid, $waMsg);
        }

        $parts = ['Post published'];
        if ($sendEmail)     $parts[] = 'email blast triggered';
        if ($waOk === true) $parts[] = 'WA channel notified';
        if ($waOk === false) $parts[] = 'WA channel failed (bridge may be down)';
        $message = implode(', ', $parts);

        $this->success(['email' => $emailStats, 'wa_channel' => $waOk], $message);
    }

    /**
     * POST /api/marketing/blog/posts/:id/resend-email
     *
     * Re-sends the blog notification email blast for an already-published post.
     * Unlike blogPublish(), this works even when the post is already published.
     */
    public function blogResendEmail(int $id): never
    {
        $existing = $this->db()->prepare('SELECT * FROM blog_posts WHERE id = :id');
        $existing->execute([':id' => $id]);
        $post = $existing->fetch(\PDO::FETCH_ASSOC);
        if (!$post) $this->error('Post not found.', 404);

        if ($post['status'] !== 'published') {
            $this->error('Only published posts can have their email resent.', 422);
        }

        $emailStats = $this->dispatchBlogEmail(
            (int)$post['id'],
            (string)$post['title'],
            (string)$post['excerpt'],
            (string)$post['slug']
        );

        $this->success(['email' => $emailStats], 'Email blast sent');
    }

    // ── AI Drafts ────────────────────────────────────────────────────────────

    public function draftIndex(): never
    {
        $status   = $this->query('status', 'pending');
        $category = $this->query('category', '');

        $where = ['status = :status'];
        $params = [':status' => $status];

        if ($category !== '') {
            $where[] = 'category = :cat';
            $params[':cat'] = $category;
        }

        $stmt = $this->db()->prepare('
            SELECT * FROM blog_ai_drafts
            WHERE ' . implode(' AND ', $where) . '
            ORDER BY created_at DESC
        ');
        $stmt->execute($params);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $rows = array_map(fn($r) => $this->formatPost($r), $rows);

        $this->success($rows);
    }

    public function draftUpdate(int $id): never
    {
        $body = $this->getJsonBody();

        $existing = $this->db()->prepare('SELECT * FROM blog_ai_drafts WHERE id = :id');
        $existing->execute([':id' => $id]);
        $draft = $existing->fetch(\PDO::FETCH_ASSOC);
        if (!$draft) $this->error('Draft not found.', 404);

        $title    = trim((string)($body['title'] ?? $draft['title']));
        $excerpt  = trim((string)($body['excerpt'] ?? $draft['excerpt']));
        $content  = trim((string)($body['content'] ?? $draft['content']));
        $coverImg = isset($body['cover_image_path']) ? trim((string)$body['cover_image_path']) : $draft['cover_image_path'];

        $this->db()->prepare('
            UPDATE blog_ai_drafts
            SET title = :title, excerpt = :excerpt, content = :content,
                cover_image_path = :cover, updated_at = NOW()
            WHERE id = :id
        ')->execute([
            ':title'   => $title,
            ':excerpt' => $excerpt,
            ':content' => $content,
            ':cover'   => $coverImg,
            ':id'      => $id,
        ]);

        $this->success(null, 'Draft updated');
    }

    public function draftApprove(int $id): never
    {
        $user         = $this->authUser();
        $body         = $this->getJsonBody();
        $sendEmail    = !empty($body['send_email']);
        $sendWaChannel = !empty($body['send_wa_channel']);
        $waChannelJid  = trim((string)($body['wa_channel_jid'] ?? ''));

        $existing = $this->db()->prepare('SELECT * FROM blog_ai_drafts WHERE id = :id');
        $existing->execute([':id' => $id]);
        $draft = $existing->fetch(\PDO::FETCH_ASSOC);
        if (!$draft) $this->error('Draft not found.', 404);
        if ($draft['status'] !== 'pending') $this->error('Draft is not pending.', 409);

        $slug = $this->uniqueSlug((string)$draft['title']);

        $this->db()->beginTransaction();
        try {
            $ins = $this->db()->prepare('
                INSERT INTO blog_posts
                    (title, slug, excerpt, content, cover_image_path, category,
                     status, source, created_by, approved_by, published_at)
                VALUES
                    (:title, :slug, :excerpt, :content, :cover, :cat,
                     :status, :source, :uid, :uid, NOW())
                RETURNING id
            ');
            $ins->execute([
                ':title'   => $draft['title'],
                ':slug'    => $slug,
                ':excerpt' => $draft['excerpt'],
                ':content' => $draft['content'],
                ':cover'   => $draft['cover_image_path'],
                ':cat'     => $draft['category'],
                ':status'  => 'published',
                ':source'  => 'ai',
                ':uid'     => $user['id'],
            ]);
            $postRow = $ins->fetch(\PDO::FETCH_ASSOC);
            $postId  = (int)$postRow['id'];

            $this->db()->prepare('
                UPDATE blog_ai_drafts
                SET status = :status, blog_post_id = :pid, updated_at = NOW()
                WHERE id = :id
            ')->execute([':status' => 'approved', ':pid' => $postId, ':id' => $id]);

            $this->db()->commit();
        } catch (\Throwable $e) {
            $this->db()->rollBack();
            $this->error('Failed to approve draft: ' . $e->getMessage(), 500);
        }

        $emailStats = null;
        if ($sendEmail) {
            $emailStats = $this->dispatchBlogEmail($postId, (string)$draft['title'], (string)$draft['excerpt'], $slug);
        }

        $waOk = null;
        if ($sendWaChannel && $waChannelJid !== '') {
            $baseUrl = rtrim((string)($_ENV['MARKETING_SITE_URL'] ?? $_ENV['BASE_URL'] ?? ''), '/');
            $blogUrl  = "{$baseUrl}/blog/{$slug}";
            $waMsg    = "*New blog post:* {$draft['title']}\n\n{$draft['excerpt']}\n\n{$blogUrl}";
            $waOk     = $this->dispatchWaChannel((int)$user['id'], $waChannelJid, $waMsg);
        }

        $parts = ['Draft approved and published'];
        if ($sendEmail)    $parts[] = 'email blast triggered';
        if ($waOk === true) $parts[] = 'WA channel notified';
        if ($waOk === false) $parts[] = 'WA channel failed (bridge may be down)';
        $message = implode(', ', $parts);

        $this->success([
            'blog_post_id' => $postId,
            'slug'         => $slug,
            'email'        => $emailStats,
            'wa_channel'   => $waOk,
        ], $message);
    }

    public function draftReject(int $id): never
    {
        $existing = $this->db()->prepare('SELECT id FROM blog_ai_drafts WHERE id = :id');
        $existing->execute([':id' => $id]);
        if (!$existing->fetch()) $this->error('Draft not found.', 404);

        $this->db()->prepare('
            UPDATE blog_ai_drafts SET status = :status, updated_at = NOW() WHERE id = :id
        ')->execute([':status' => 'rejected', ':id' => $id]);

        $this->success(null, 'Draft rejected');
    }

    /**
     * Manually trigger the same AI draft pipeline as cron (cli/blog_ai_generate.php).
     *
     * Optional JSON body:
     *   dry_run — if true, do not persist (logs article text in meta.log)
     *   category — "laws" | "tax_saving" | omit for both
     *   options_per_category — default 2
     */
    public function generateAiDrafts(): never
    {
        set_time_limit(0);

        $body = $this->getJsonBody();
        $dryRun = !empty($body['dry_run']);
        $rawCat = isset($body['category']) ? trim((string)$body['category']) : '';
        $onlyCategory = $rawCat === '' ? null : $rawCat;
        if ($onlyCategory !== null && !in_array($onlyCategory, ['laws', 'tax_saving', 'ai_promotions', 'subsidies_promotions', 'funding_promotions'], true)) {
            $this->error('category must be laws, tax_saving, ai_promotions, subsidies_promotions, funding_promotions, or omitted.', 422);
        }

        $optionsPerCat = isset($body['options_per_category']) ? (int)$body['options_per_category'] : 2;

        $serverRoot = dirname(__DIR__, 4);

        $report = BlogAiGenerator::run([
            'pdo'                  => $this->db(),
            'server_php_root'      => $serverRoot,
            'dry_run'              => $dryRun,
            'only_category'        => $onlyCategory,
            'options_per_category' => $optionsPerCat,
        ]);

        if (isset($report['error'])) {
            $this->error($report['error'], 500);
        }

        $this->success([
            'drafts_generated' => $report['total_generated'],
            'dry_run'          => $dryRun,
        ], 'AI draft generation finished', 200, ['log' => $report['log']]);
    }

    // ── Image Upload ─────────────────────────────────────────────────────────

    public function imageUpload(): never
    {
        try {
            $this->doImageUpload();
        } catch (\Throwable $e) {
            error_log('[BlogController.imageUpload] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $this->error('Image upload failed: ' . $e->getMessage(), 500);
        }
    }

    private function doImageUpload(): never
    {
        if (empty($_FILES['image'])) {
            // When post_max_size is exceeded, PHP empties $_FILES entirely but keeps CONTENT_LENGTH.
            $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
            if ($contentLength > 0) {
                $this->error('Request body exceeds post_max_size. Reduce file size or increase post_max_size.', 422);
            }
            $this->error('No image file uploaded.', 422);
        }

        $file = $_FILES['image'];
        if ($file['error'] !== UPLOAD_ERR_OK) {
            $labels = [
                UPLOAD_ERR_INI_SIZE   => 'File exceeds upload_max_filesize.',
                UPLOAD_ERR_FORM_SIZE  => 'File exceeds MAX_FILE_SIZE.',
                UPLOAD_ERR_PARTIAL    => 'File only partially uploaded.',
                UPLOAD_ERR_NO_FILE    => 'No file was uploaded.',
                UPLOAD_ERR_NO_TMP_DIR => 'Missing temp directory.',
                UPLOAD_ERR_CANT_WRITE => 'Failed to write to disk.',
                UPLOAD_ERR_EXTENSION  => 'Upload blocked by PHP extension.',
            ];
            $this->error($labels[$file['error']] ?? 'Upload error code: ' . $file['error'], 422);
        }

        $mime = $this->detectMimeType($file['tmp_name']);

        $allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!in_array($mime, $allowedMime, true)) {
            $this->error('Only JPEG, PNG, WebP and GIF images are allowed. Detected: ' . ($mime ?: 'unknown'), 422);
        }

        if ($file['size'] > 5 * 1024 * 1024) {
            $this->error('Image must be under 5 MB.', 422);
        }

        $uploadDir = $this->blogUploadDir();

        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
            $this->error('Upload directory could not be created: ' . $uploadDir . '. Check open_basedir or directory permissions.', 500);
        }

        if (!is_writable($uploadDir)) {
            $this->error('Upload directory is not writable: ' . $uploadDir, 500);
        }

        $ext      = match ($mime) {
            'image/jpeg' => 'jpg',
            'image/png'  => 'png',
            'image/webp' => 'webp',
            'image/gif'  => 'gif',
            default      => 'jpg',
        };
        $filename = 'cover_' . uniqid('', true) . '.' . $ext;
        $destPath = $uploadDir . DIRECTORY_SEPARATOR . $filename;

        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            $this->error('Failed to save uploaded image to ' . $uploadDir . '. Check open_basedir allows this path.', 500);
        }

        $relativePath = 'blog_uploads/' . $filename;
        $this->success([
            'path' => $relativePath,
            'url'  => $this->coverImageUrl($relativePath),
        ], 'Image uploaded', 201);
    }

    /**
     * Detect the MIME type of an uploaded file.
     * Tries finfo first, then mime_content_type, then reads magic bytes directly
     * so detection works on Windows where the fileinfo extension may be absent.
     */
    private function detectMimeType(string $tmpPath): string|false
    {
        if (class_exists(\finfo::class)) {
            $finfo = new \finfo(FILEINFO_MIME_TYPE);
            $mime  = $finfo->file($tmpPath);
            if ($mime !== false && $mime !== 'application/octet-stream') {
                return $mime;
            }
        }

        if (function_exists('mime_content_type')) {
            $mime = mime_content_type($tmpPath);
            if ($mime !== false && $mime !== 'application/octet-stream') {
                return $mime;
            }
        }

        // Magic-byte fallback — reliable on all platforms including Windows.
        $handle = @fopen($tmpPath, 'rb');
        if ($handle === false) {
            return false;
        }
        $header = fread($handle, 12);
        fclose($handle);

        if ($header === false || strlen($header) < 4) {
            return false;
        }

        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if (str_starts_with($header, "\x89PNG\r\n\x1a\n")) {
            return 'image/png';
        }
        // JPEG: FF D8 FF
        if (str_starts_with($header, "\xFF\xD8\xFF")) {
            return 'image/jpeg';
        }
        // GIF: GIF87a or GIF89a
        if (str_starts_with($header, 'GIF87a') || str_starts_with($header, 'GIF89a')) {
            return 'image/gif';
        }
        // WebP: RIFF????WEBP
        if (str_starts_with($header, 'RIFF') && substr($header, 8, 4) === 'WEBP') {
            return 'image/webp';
        }

        return false;
    }

    /**
     * Stream a cover image from BLOG_UPLOADS_PATH (public — used by marketing site and email clients).
     * No database connection is needed here; this method is intentionally DB-free.
     */
    public function publicBlogCover(string $file): never
    {
        $file = basename($file);
        if ($file === '' || !preg_match('/^[A-Za-z0-9._-]+$/', $file)) {
            $this->error('Invalid file.', 400);
        }

        $uploadDir = $this->blogUploadDir();
        $absPath   = $uploadDir . DIRECTORY_SEPARATOR . $file;

        $realDir  = is_dir($uploadDir)  ? realpath($uploadDir) : false;
        $realFile = is_file($absPath)   ? realpath($absPath)   : false;

        if ($realDir === false || $realFile === false || !str_starts_with((string)$realFile, (string)$realDir)) {
            error_log("[BlogController] publicBlogCover: not found — uploadDir={$uploadDir} file={$file}");
            $this->error('Not found.', 404);
        }

        $mime = function_exists('mime_content_type') ? mime_content_type($realFile) : false;
        if ($mime === false || $mime === '') {
            $mime = 'application/octet-stream';
        }

        header('Access-Control-Allow-Origin: *');
        header('Content-Type: ' . $mime, true);
        header('Content-Length: ' . (string) filesize($realFile));
        header('Cache-Control: public, max-age=86400');
        header('X-Content-Type-Options: nosniff');
        readfile($realFile);
        exit;
    }

    // ── Public API (no auth — for marketing site) ────────────────────────────

    /**
     * POST /api/public/leads
     *
     * Accept a lead submission from the public blog CTA form (no auth required).
     * Stores the enquiry in the `leads` table with source = "Blog CTA".
     *
     * Body: { name*, email?, phone?, message? }
     */
    public function publicLeadSubmit(): never
    {
        $body    = $this->getJsonBody();
        $name    = trim((string)($body['name']    ?? ''));
        $email   = trim((string)($body['email']   ?? ''));
        $phone   = trim((string)($body['phone']   ?? ''));
        $message = trim((string)($body['message'] ?? ''));

        if ($name === '') {
            $this->error('Name is required.', 422);
        }

        $notes = $message !== ''
            ? $message
            : 'Interested in AI implementation for my business.';

        $stmt = $this->db()->prepare('
            INSERT INTO leads
                (name, email, phone, source, service_interest, notes, status, probability)
            VALUES
                (:name, :email, :phone, :source, :si, :notes, :status, :prob)
            RETURNING id
        ');
        $stmt->execute([
            ':name'   => $name,
            ':email'  => $email  !== '' ? $email  : null,
            ':phone'  => $phone  !== '' ? $phone  : null,
            ':source' => 'Blog CTA',
            ':si'     => 'AI Implementation',
            ':notes'  => $notes,
            ':status' => 'new',
            ':prob'   => 50,
        ]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        header('Access-Control-Allow-Origin: *');
        $this->success(['id' => (int)$row['id']], 'Thank you! We will be in touch soon.', 201);
    }

    public function publicBlogs(): never
    {
        $category = $this->query('category', '');
        $page     = max(1, (int)$this->query('page', 1));
        $limit    = 20;
        $offset   = ($page - 1) * $limit;

        $where  = ['status = :status'];
        $params = [':status' => 'published'];

        if ($category !== '') {
            $where[] = 'category = :cat';
            $params[':cat'] = $category;
        }

        $whereClause = 'WHERE ' . implode(' AND ', $where);

        $stmt = $this->db()->prepare("
            SELECT p.id, p.title, p.slug, p.excerpt, p.cover_image_path,
                   p.category, p.published_at, p.created_at,
                   u.name AS author_name
            FROM   blog_posts p
            LEFT JOIN users u ON u.id = p.created_by
            {$whereClause}
            ORDER  BY p.published_at DESC
            LIMIT  :lim OFFSET :off
        ");
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':lim', $limit, \PDO::PARAM_INT);
        $stmt->bindValue(':off', $offset, \PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        $rows = array_map(fn($r) => $this->formatPost($r), $rows);

        header('Access-Control-Allow-Origin: *');
        $this->success($rows, 'OK', 200, ['page' => $page, 'limit' => $limit]);
    }

    public function publicBlogPost(string $slug): never
    {
        $stmt = $this->db()->prepare("
            SELECT p.*, u.name AS author_name
            FROM   blog_posts p
            LEFT JOIN users u ON u.id = p.created_by
            WHERE  p.status = 'published'
              AND  (p.slug = :slug OR p.id::text = :iid)
            LIMIT 1
        ");
        $stmt->execute([':slug' => $slug, ':iid' => $slug]);
        $post = $stmt->fetch(\PDO::FETCH_ASSOC);

        if (!$post) $this->error('Post not found.', 404);

        header('Access-Control-Allow-Origin: *');
        $this->success($this->formatPost($post));
    }

    // ── Email blast helpers ──────────────────────────────────────────────────

    /**
     * Dispatch a blog notification email to all active clients.
     *
     * @return array{total: int, sent: int, status: string}
     */
    private function dispatchBlogEmail(int $postId, string $title, string $excerpt, string $slug): array
    {
        // One HTTP call per client; default max_execution_time (often 30s) is too low for dozens of recipients.
        $maxSeconds = (int)(getenv('BLOG_EMAIL_MAX_SECONDS') ?: '600');
        if ($maxSeconds > 0) {
            @set_time_limit($maxSeconds);
        }

        $baseUrl = rtrim((string)($_ENV['MARKETING_SITE_URL'] ?? $_ENV['BASE_URL'] ?? ''), '/');
        $blogUrl = "{$baseUrl}/blog/{$slug}";

        $clients = $this->db()->query("
            SELECT c.id, c.name, c.email
            FROM   clients c
            WHERE  c.status = 'active'
              AND  c.email IS NOT NULL
              AND  c.email != ''
        ")->fetchAll(\PDO::FETCH_ASSOC);

        if (empty($clients)) {
            return ['total' => 0, 'sent' => 0, 'status' => 'no_recipients'];
        }

        $categoryLabel = 'Tax & Finance Insights';
        $htmlBody = $this->buildBlogEmailHtml($title, $excerpt, $blogUrl, $categoryLabel);

        $subject      = "New Article: {$title}";
        $successCount = 0;

        foreach ($clients as $client) {
            $sent = BrevoMailer::send(
                (string)$client['email'],
                (string)$client['name'],
                $subject,
                $htmlBody
            );
            if ($sent) $successCount++;
        }

        $total  = count($clients);
        $status = $successCount === 0 ? 'failed' : ($successCount < $total ? 'partial' : 'sent');

        $emailLogSaved = true;
        try {
            $this->db()->prepare('
                INSERT INTO blog_email_logs (blog_post_id, recipients_count, success_count, status)
                VALUES (:pid, :total, :success, :status)
            ')->execute([
                ':pid'     => $postId,
                ':total'   => $total,
                ':success' => $successCount,
                ':status'  => $status,
            ]);
        } catch (\PDOException $e) {
            $emailLogSaved = false;
            error_log('[BlogController] blog_email_logs INSERT failed: ' . $e->getMessage());
        }

        return [
            'total'             => $total,
            'sent'              => $successCount,
            'status'            => $status,
            'email_log_saved'   => $emailLogSaved,
        ];
    }

    private function buildBlogEmailHtml(string $title, string $excerpt, string $url, string $category): string
    {
        $safeTitle    = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
        $safeExcerpt  = htmlspecialchars($excerpt, ENT_QUOTES, 'UTF-8');
        $safeCategory = htmlspecialchars($category, ENT_QUOTES, 'UTF-8');
        $safeUrl      = htmlspecialchars($url, ENT_QUOTES, 'UTF-8');

        return <<<HTML
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <tr>
          <td style="background:#F37920;padding:24px 32px;">
            <p style="margin:0;color:#fff;font-size:13px;font-weight:600;letter-spacing:1px;">{$safeCategory}</p>
            <h1 style="margin:8px 0 0;color:#fff;font-size:22px;line-height:1.3;">{$safeTitle}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">{$safeExcerpt}</p>
            <a href="{$safeUrl}" style="display:inline-block;background:#F37920;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Read Full Article &rarr;</a>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid #f1f5f9;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">CA Rahul Gupta &bull; You received this because you are a valued client.<br>
            <a href="{$safeUrl}" style="color:#F37920;">View in browser</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
HTML;
    }
}

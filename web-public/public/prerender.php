<?php
/**
 * prerender.php — Social-media bot pre-renderer for /blog/:slug pages.
 *
 * Apache (.htaccess) routes WhatsApp, Facebook, Twitter, Telegram and other
 * crawlers here instead of to the React SPA, because those bots never execute
 * JavaScript and therefore cannot see Open Graph meta tags that React injects
 * after page load.
 *
 * This script:
 *   1. Calls the existing public blog API to fetch post data.
 *   2. Returns a minimal HTML page with og:title, og:description, og:image,
 *      og:url, og:type and Twitter Card equivalents.
 *   3. Adds a <meta http-equiv="refresh"> so any human who lands here
 *      directly is immediately forwarded to the React SPA URL.
 */

declare(strict_types=1);

// ── Validate slug ─────────────────────────────────────────────────────────────

$slug = trim((string)($_GET['slug'] ?? ''));

if ($slug === '' || !preg_match('/^[a-zA-Z0-9_-]+$/', $slug)) {
    http_response_code(400);
    exit('Bad request');
}

// ── Build URLs ────────────────────────────────────────────────────────────────

$scheme       = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host         = (string)($_SERVER['HTTP_HOST'] ?? 'carahulgupta.in');
$canonicalUrl = "{$scheme}://{$host}/blog/" . rawurlencode($slug);

// The PHP API is co-deployed at the same origin under /api
$apiUrl = "{$scheme}://{$host}/api/public/blogs/" . rawurlencode($slug);

// ── Fetch post from the public API ────────────────────────────────────────────

$ctx  = stream_context_create(['http' => [
    'timeout'       => 5,
    'ignore_errors' => true,
    'header'        => "Accept: application/json\r\nUser-Agent: CAGupta-Prerender/1.0\r\n",
]]);

$json = @file_get_contents($apiUrl, false, $ctx);
$post = null;

if ($json !== false) {
    $decoded = json_decode($json, true);
    // API wraps response as { success, data, message }
    if (isset($decoded['data']) && is_array($decoded['data'])) {
        $post = $decoded['data'];
    } elseif (is_array($decoded) && isset($decoded['title'])) {
        $post = $decoded;
    }
}

// ── Resolve meta-tag values ───────────────────────────────────────────────────

$siteName    = 'CA Rahul Gupta — Chartered Accountants';
$title       = (isset($post['title'])   && $post['title']   !== '') ? (string)$post['title']   : $siteName;
$description = (isset($post['excerpt']) && $post['excerpt'] !== '') ? (string)$post['excerpt'] : 'Insights on tax, compliance, AI and finance from CA Rahul Gupta Office.';
$image       = (isset($post['cover_image_url']) && $post['cover_image_url'] !== '') ? (string)$post['cover_image_url'] : '';

// ── Helpers ───────────────────────────────────────────────────────────────────

function e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

// ── Output ────────────────────────────────────────────────────────────────────

http_response_code($post !== null ? 200 : 404);
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: public, max-age=300');
?><!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title><?= e($title) ?></title>

  <!-- Open Graph — read by WhatsApp, Facebook, LinkedIn, Telegram, Slack -->
  <meta property="og:type"        content="article" />
  <meta property="og:site_name"   content="<?= e($siteName) ?>" />
  <meta property="og:url"         content="<?= e($canonicalUrl) ?>" />
  <meta property="og:title"       content="<?= e($title) ?>" />
  <meta property="og:description" content="<?= e($description) ?>" />
<?php if ($image !== ''): ?>
  <meta property="og:image"        content="<?= e($image) ?>" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt"    content="<?= e($title) ?>" />
<?php endif; ?>

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="<?= e($title) ?>" />
  <meta name="twitter:description" content="<?= e($description) ?>" />
<?php if ($image !== ''): ?>
  <meta name="twitter:image"       content="<?= e($image) ?>" />
<?php endif; ?>

  <!-- Canonical + redirect for any human who lands here directly -->
  <link rel="canonical" href="<?= e($canonicalUrl) ?>" />
  <meta http-equiv="refresh" content="0; url=<?= e($canonicalUrl) ?>" />
</head>
<body>
  <p>Redirecting to <a href="<?= e($canonicalUrl) ?>"><?= e($title) ?></a>…</p>
</body>
</html>

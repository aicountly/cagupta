<?php
/**
 * sitemap.php — Dynamic XML sitemap for carahulgupta.in
 *
 * Served at /sitemap.xml via the .htaccess rewrite rule.
 * Includes static marketing pages and all published blog posts
 * fetched live from the public blog API.
 */

declare(strict_types=1);

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host   = (string)($_SERVER['HTTP_HOST'] ?? 'carahulgupta.in');
$base   = "{$scheme}://{$host}";

// ── Static pages ──────────────────────────────────────────────────────────────

$staticPages = [
    ['loc' => '/',         'priority' => '1.0', 'changefreq' => 'weekly'],
    ['loc' => '/services', 'priority' => '0.9', 'changefreq' => 'monthly'],
    ['loc' => '/about',    'priority' => '0.7', 'changefreq' => 'monthly'],
    ['loc' => '/contact',  'priority' => '0.7', 'changefreq' => 'monthly'],
    ['loc' => '/blog',     'priority' => '0.8', 'changefreq' => 'weekly'],
];

// ── Fetch published blog posts ────────────────────────────────────────────────

$blogPosts = [];

$apiUrl = "{$base}/api/public/blogs?limit=200&page=1";
$ctx    = stream_context_create(['http' => [
    'timeout'       => 5,
    'ignore_errors' => true,
    'header'        => "Accept: application/json\r\nUser-Agent: CAGupta-Sitemap/1.0\r\n",
]]);

$json = @file_get_contents($apiUrl, false, $ctx);
if ($json !== false) {
    $decoded = json_decode($json, true);
    $rows    = $decoded['data'] ?? [];
    if (is_array($rows)) {
        foreach ($rows as $post) {
            $slug = $post['slug'] ?? null;
            if (!$slug) continue;
            $lastmod = isset($post['published_at'])
                ? (new \DateTimeImmutable($post['published_at']))->format('Y-m-d')
                : date('Y-m-d');
            $blogPosts[] = [
                'loc'        => '/blog/' . rawurlencode((string)$slug),
                'lastmod'    => $lastmod,
                'priority'   => '0.7',
                'changefreq' => 'monthly',
            ];
        }
    }
}

// ── Build XML ─────────────────────────────────────────────────────────────────

header('Content-Type: application/xml; charset=UTF-8');
header('Cache-Control: public, max-age=3600');

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";

$today = date('Y-m-d');

foreach ($staticPages as $page) {
    $lastmod = $page['lastmod'] ?? $today;
    echo "  <url>\n";
    echo '    <loc>'        . htmlspecialchars($base . $page['loc'], ENT_XML1) . "</loc>\n";
    echo '    <lastmod>'    . htmlspecialchars($lastmod, ENT_XML1)             . "</lastmod>\n";
    echo '    <changefreq>' . htmlspecialchars($page['changefreq'], ENT_XML1)  . "</changefreq>\n";
    echo '    <priority>'   . htmlspecialchars($page['priority'], ENT_XML1)    . "</priority>\n";
    echo "  </url>\n";
}

foreach ($blogPosts as $page) {
    echo "  <url>\n";
    echo '    <loc>'        . htmlspecialchars($base . $page['loc'], ENT_XML1) . "</loc>\n";
    echo '    <lastmod>'    . htmlspecialchars($page['lastmod'], ENT_XML1)     . "</lastmod>\n";
    echo '    <changefreq>' . htmlspecialchars($page['changefreq'], ENT_XML1)  . "</changefreq>\n";
    echo '    <priority>'   . htmlspecialchars($page['priority'], ENT_XML1)    . "</priority>\n";
    echo "  </url>\n";
}

echo '</urlset>' . "\n";

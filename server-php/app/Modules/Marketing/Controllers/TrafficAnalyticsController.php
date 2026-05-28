<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;

/**
 * TrafficAnalyticsController
 *
 * Proxies GA4 Data API reports into the staff portal and generates
 * AI-powered marketing improvement suggestions via OpenAI.
 *
 * Routes prefix: /api/marketing
 *
 *   GET  /traffic/overview      — sessions, users, pageviews (daily trend)
 *   GET  /traffic/sources       — traffic breakdown by channel
 *   GET  /traffic/leads         — lead event funnel
 *   GET  /ai-insights           — return current cached AI suggestions
 *   POST /ai-insights/refresh   — regenerate suggestions via OpenAI
 *
 * Required .env keys:
 *   GA4_PROPERTY_ID_MARKETING   — numeric property ID for carahulgupta.in (preferred)
 *   GA4_PROPERTY_ID_PORTAL      — numeric property ID for app.carahulgupta.in (optional)
 *   GA4_PROPERTY_ID             — legacy fallback when the split IDs above are unset
 *   GOOGLE_SERVICE_ACCOUNT_JSON — path to the service account JSON key file
 *   OPENAI_API_KEY              — OpenAI secret key (sk-...)
 */
class TrafficAnalyticsController extends BaseController
{
    private \PDO $db;

    private const CACHE_TTL_SECONDS    = 3600;   // 1 hour for GA4 report cache
    private const AI_CACHE_TTL_SECONDS = 86400;  // 24 hours for AI insights cache

    public function __construct()
    {
        $this->db = \App\Config\Database::getConnection();
    }

    // ── Public endpoints ──────────────────────────────────────────────────────

    /**
     * GET /api/marketing/traffic/overview
     * Query params: days (default 30), stream (e.g. marketing_site, portal, all)
     */
    public function overview(): never
    {
        $this->authUser();
        $days   = max(7, min(90, (int)$this->query('days', 30)));
        $stream = $this->query('stream', 'all');

        $cacheKey   = 'traffic_overview';
        $paramsHash = md5("days={$days}&stream={$stream}");

        $cached = $this->getCache($cacheKey, $paramsHash);
        if ($cached !== null) {
            $this->success($cached, 'OK (cached)');
        }

        $propertyId = $this->resolveGa4PropertyId($stream);
        if ($propertyId === '') {
            $this->success($this->mockOverview($days), 'GA4 not configured — returning demo data');
        }

        $token = $this->getGa4AccessToken();
        if ($token === null) {
            $this->success($this->mockOverview($days), 'GA4 authentication failed — returning demo data');
        }

        $startDate = date('Y-m-d', strtotime("-{$days} days"));

        // Daily trend
        $trendReport = $this->callGa4Report($token, $propertyId, [
            'dateRanges'  => [['startDate' => $startDate, 'endDate' => 'today']],
            'dimensions'  => [['name' => 'date']],
            'metrics'     => [
                ['name' => 'sessions'],
                ['name' => 'activeUsers'],
                ['name' => 'screenPageViews'],
                ['name' => 'newUsers'],
            ],
            'orderBys'    => [['dimension' => ['dimensionName' => 'date']]],
        ]);

        // Totals (single row)
        $totalsReport = $this->callGa4Report($token, $propertyId, [
            'dateRanges' => [['startDate' => $startDate, 'endDate' => 'today']],
            'metrics'    => [
                ['name' => 'sessions'],
                ['name' => 'activeUsers'],
                ['name' => 'screenPageViews'],
                ['name' => 'newUsers'],
                ['name' => 'bounceRate'],
            ],
        ]);

        // Top pages
        $pagesReport = $this->callGa4Report($token, $propertyId, [
            'dateRanges' => [['startDate' => $startDate, 'endDate' => 'today']],
            'dimensions' => [['name' => 'pagePath'], ['name' => 'pageTitle']],
            'metrics'    => [['name' => 'screenPageViews'], ['name' => 'activeUsers']],
            'orderBys'   => [['metric' => ['metricName' => 'screenPageViews'], 'desc' => true]],
            'limit'      => 10,
        ]);

        $result = [
            'trend'      => $this->parseTrendRows($trendReport),
            'totals'     => $this->parseTotalsRow($totalsReport),
            'top_pages'  => $this->parsePageRows($pagesReport),
            'days'       => $days,
        ];

        $this->setCache($cacheKey, $paramsHash, $result, self::CACHE_TTL_SECONDS);
        $this->success($result);
    }

    /**
     * GET /api/marketing/traffic/sources
     * Returns traffic split by channel group.
     */
    public function sources(): never
    {
        $this->authUser();
        $days   = max(7, min(90, (int)$this->query('days', 30)));
        $stream = $this->query('stream', 'all');
        $cacheKey   = 'traffic_sources';
        $paramsHash = md5("days={$days}&stream={$stream}");

        $cached = $this->getCache($cacheKey, $paramsHash);
        if ($cached !== null) {
            $this->success($cached, 'OK (cached)');
        }

        $propertyId = $this->resolveGa4PropertyId($stream);
        if ($propertyId === '') {
            $this->success($this->mockSources(), 'GA4 not configured — returning demo data');
        }

        $token = $this->getGa4AccessToken();
        if ($token === null) {
            $this->success($this->mockSources(), 'GA4 authentication failed — returning demo data');
        }

        $startDate = date('Y-m-d', strtotime("-{$days} days"));
        $report = $this->callGa4Report($token, $propertyId, [
            'dateRanges' => [['startDate' => $startDate, 'endDate' => 'today']],
            'dimensions' => [['name' => 'sessionDefaultChannelGrouping']],
            'metrics'    => [['name' => 'sessions'], ['name' => 'activeUsers']],
            'orderBys'   => [['metric' => ['metricName' => 'sessions'], 'desc' => true]],
        ]);

        $result = $this->parseSourceRows($report);
        $this->setCache($cacheKey, $paramsHash, $result, self::CACHE_TTL_SECONDS);
        $this->success($result);
    }

    /**
     * GET /api/marketing/traffic/leads
     * Returns lead event funnel (page_view on contact, lead_form_submit, blog_lead_submit, blog_cta_click).
     */
    public function leads(): never
    {
        $this->authUser();
        $days   = max(7, min(90, (int)$this->query('days', 30)));
        $stream = $this->query('stream', 'all');
        $cacheKey   = 'traffic_leads';
        $paramsHash = md5("days={$days}&stream={$stream}");

        $cached = $this->getCache($cacheKey, $paramsHash);
        if ($cached !== null) {
            $this->success($cached, 'OK (cached)');
        }

        $propertyId = $this->resolveGa4PropertyId($stream);
        if ($propertyId === '') {
            $this->success($this->mockLeads(), 'GA4 not configured — returning demo data');
        }

        $token = $this->getGa4AccessToken();
        if ($token === null) {
            $this->success($this->mockLeads(), 'GA4 authentication failed — returning demo data');
        }

        $startDate = date('Y-m-d', strtotime("-{$days} days"));
        $events    = ['lead_form_submit', 'blog_lead_submit', 'blog_cta_click', 'associate_link_click'];

        $report = $this->callGa4Report($token, $propertyId, [
            'dateRanges'        => [['startDate' => $startDate, 'endDate' => 'today']],
            'dimensions'        => [['name' => 'eventName']],
            'metrics'           => [['name' => 'eventCount']],
            'dimensionFilter'   => [
                'filter' => [
                    'fieldName'    => 'eventName',
                    'inListFilter' => ['values' => $events],
                ],
            ],
        ]);

        $result = $this->parseEventRows($report, $events);
        $this->setCache($cacheKey, $paramsHash, $result, self::CACHE_TTL_SECONDS);
        $this->success($result);
    }

    /**
     * GET /api/marketing/ai-insights
     * Returns the most recent non-expired AI insights, or an empty list.
     */
    public function aiInsights(): never
    {
        $this->authUser();

        $row = $this->db->query(
            "SELECT * FROM analytics_ai_insights WHERE expires_at > NOW() ORDER BY generated_at DESC LIMIT 1"
        )->fetch(\PDO::FETCH_ASSOC);

        if ($row) {
            $this->success([
                'insights'     => json_decode($row['insights_json'], true) ?? [],
                'generated_at' => $row['generated_at'],
                'expires_at'   => $row['expires_at'],
            ]);
        }

        $this->success(['insights' => [], 'generated_at' => null, 'expires_at' => null], 'No insights yet — click Refresh to generate');
    }

    /**
     * POST /api/marketing/ai-insights/refresh
     * Pulls the latest traffic data and calls OpenAI to generate suggestions.
     */
    public function refreshAiInsights(): never
    {
        $user = $this->authUser();

        $openAiKey = $_ENV['OPENAI_API_KEY'] ?? '';
        if ($openAiKey === '') {
            $this->error('OPENAI_API_KEY is not configured. Add it to server-php/.env to enable AI insights.', 503);
        }

        // Gather context: last 30-day overview + sources from cache or defaults
        $overviewCache = $this->getCache('traffic_overview', md5('days=30&stream=all'));
        $sourcesCache  = $this->getCache('traffic_sources',  md5('days=30'));

        $overviewData = $overviewCache ?? $this->mockOverview(30);
        $sourcesData  = $sourcesCache  ?? $this->mockSources();

        // Also pull leads from DB (internal CRM)
        $leadsRow   = $this->db->query("SELECT COUNT(*) AS total FROM leads WHERE created_at >= NOW() - INTERVAL '30 days'")->fetch(\PDO::FETCH_ASSOC);
        $leadsTotal = (int)($leadsRow['total'] ?? 0);

        $prompt = $this->buildInsightsPrompt($overviewData, $sourcesData, $leadsTotal);
        $suggestions = $this->callOpenAI($openAiKey, $prompt);

        if ($suggestions === null) {
            $this->error('OpenAI request failed. Please try again later.', 502);
        }

        $expiresAt = date('Y-m-d H:i:s', time() + self::AI_CACHE_TTL_SECONDS);
        $stmt = $this->db->prepare(
            'INSERT INTO analytics_ai_insights (insights_json, expires_at, generated_by) VALUES (:json, :exp, :uid)'
        );
        $stmt->execute([
            ':json' => json_encode($suggestions),
            ':exp'  => $expiresAt,
            ':uid'  => $user['id'],
        ]);

        $this->success([
            'insights'     => $suggestions,
            'generated_at' => date('Y-m-d H:i:s'),
            'expires_at'   => $expiresAt,
        ], 'AI insights refreshed');
    }

    // ── GA4 property resolution ───────────────────────────────────────────────

    /**
     * Resolve numeric GA4 property ID for Data API reports.
     *
     * stream=marketing_site|marketing → GA4_PROPERTY_ID_MARKETING, else GA4_PROPERTY_ID
     * stream=portal|app               → GA4_PROPERTY_ID_PORTAL, else GA4_PROPERTY_ID
     * stream=all (default)            → marketing property when set, else legacy GA4_PROPERTY_ID
     */
    private function resolveGa4PropertyId(string $stream = 'all'): string
    {
        $marketing = trim((string)($_ENV['GA4_PROPERTY_ID_MARKETING'] ?? ''));
        $portal    = trim((string)($_ENV['GA4_PROPERTY_ID_PORTAL'] ?? ''));
        $legacy    = trim((string)($_ENV['GA4_PROPERTY_ID'] ?? ''));

        $stream = strtolower(trim($stream));

        if ($stream === 'portal' || $stream === 'app') {
            return $portal !== '' ? $portal : $legacy;
        }

        if ($stream === 'marketing_site' || $stream === 'marketing') {
            return $marketing !== '' ? $marketing : $legacy;
        }

        return $marketing !== '' ? $marketing : $legacy;
    }

    // ── GA4 authentication ────────────────────────────────────────────────────

    /**
     * Obtain a short-lived OAuth2 access token for the GA4 Data API
     * using a Google service account JSON key file.
     * Returns null on any failure.
     */
    private function getGa4AccessToken(): ?string
    {
        $keyPath = $_ENV['GOOGLE_SERVICE_ACCOUNT_JSON'] ?? '';
        if ($keyPath === '' || !file_exists($keyPath)) {
            return null;
        }

        $keyData = json_decode((string)file_get_contents($keyPath), true);
        if (empty($keyData['private_key']) || empty($keyData['client_email'])) {
            return null;
        }

        $now    = time();
        $header  = base64_encode(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
        $payload = base64_encode(json_encode([
            'iss'   => $keyData['client_email'],
            'scope' => 'https://www.googleapis.com/auth/analytics.readonly',
            'aud'   => 'https://oauth2.googleapis.com/token',
            'iat'   => $now,
            'exp'   => $now + 3600,
        ]));

        $toSign  = $header . '.' . $payload;
        $pkeyRes = openssl_pkey_get_private($keyData['private_key']);
        if ($pkeyRes === false) {
            return null;
        }

        $sig = '';
        if (!openssl_sign($toSign, $sig, $pkeyRes, 'SHA256')) {
            return null;
        }
        $jwt = $toSign . '.' . base64_encode($sig);

        $ch = curl_init('https://oauth2.googleapis.com/token');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => http_build_query([
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion'  => $jwt,
            ]),
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_TIMEOUT    => 10,
        ]);
        $body   = (string)curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($status !== 200) {
            return null;
        }
        $data = json_decode($body, true);
        return $data['access_token'] ?? null;
    }

    /**
     * Call the GA4 Data API runReport endpoint.
     * Returns the raw decoded response array, or an empty array on failure.
     */
    private function callGa4Report(string $token, string $propertyId, array $body): array
    {
        $url = "https://analyticsdata.googleapis.com/v1beta/properties/{$propertyId}:runReport";
        if (isset($body['limit'])) {
            $body['limit'] = (string)$body['limit'];
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                "Authorization: Bearer {$token}",
            ],
            CURLOPT_POSTFIELDS => json_encode($body),
            CURLOPT_TIMEOUT    => 15,
        ]);
        $resp   = (string)curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($status !== 200) {
            return [];
        }
        return json_decode($resp, true) ?? [];
    }

    // ── Response parsers ──────────────────────────────────────────────────────

    private function parseTrendRows(array $report): array
    {
        $rows = $report['rows'] ?? [];
        return array_map(function ($row) {
            $dims    = $row['dimensionValues'] ?? [];
            $metrics = $row['metricValues']    ?? [];
            return [
                'date'      => $dims[0]['value']    ?? '',
                'sessions'  => (int)($metrics[0]['value'] ?? 0),
                'users'     => (int)($metrics[1]['value'] ?? 0),
                'pageviews' => (int)($metrics[2]['value'] ?? 0),
                'new_users' => (int)($metrics[3]['value'] ?? 0),
            ];
        }, $rows);
    }

    private function parseTotalsRow(array $report): array
    {
        $totals = $report['totals'][0]['metricValues'] ?? [];
        return [
            'sessions'      => (int)($totals[0]['value']  ?? 0),
            'users'         => (int)($totals[1]['value']  ?? 0),
            'pageviews'     => (int)($totals[2]['value']  ?? 0),
            'new_users'     => (int)($totals[3]['value']  ?? 0),
            'bounce_rate'   => round((float)($totals[4]['value'] ?? 0) * 100, 1),
        ];
    }

    private function parsePageRows(array $report): array
    {
        $rows = $report['rows'] ?? [];
        return array_map(function ($row) {
            $dims    = $row['dimensionValues'] ?? [];
            $metrics = $row['metricValues']    ?? [];
            return [
                'path'      => $dims[0]['value']    ?? '',
                'title'     => $dims[1]['value']    ?? '',
                'pageviews' => (int)($metrics[0]['value'] ?? 0),
                'users'     => (int)($metrics[1]['value'] ?? 0),
            ];
        }, $rows);
    }

    private function parseSourceRows(array $report): array
    {
        $rows    = $report['rows'] ?? [];
        $total   = 0;
        $sources = [];
        foreach ($rows as $row) {
            $dims    = $row['dimensionValues'] ?? [];
            $metrics = $row['metricValues']    ?? [];
            $name    = $dims[0]['value']    ?? 'Unknown';
            $count   = (int)($metrics[0]['value'] ?? 0);
            $sources[] = ['channel' => $name, 'sessions' => $count, 'users' => (int)($metrics[1]['value'] ?? 0)];
            $total += $count;
        }

        foreach ($sources as &$s) {
            $s['pct'] = $total > 0 ? round($s['sessions'] / $total * 100, 1) : 0;
        }
        unset($s);

        return ['channels' => $sources, 'total_sessions' => $total];
    }

    private function parseEventRows(array $report, array $eventNames): array
    {
        $rows   = $report['rows'] ?? [];
        $counts = array_fill_keys($eventNames, 0);
        foreach ($rows as $row) {
            $name  = $row['dimensionValues'][0]['value'] ?? '';
            $count = (int)($row['metricValues'][0]['value'] ?? 0);
            if (isset($counts[$name])) {
                $counts[$name] = $count;
            }
        }
        return $counts;
    }

    // ── AI Insights ───────────────────────────────────────────────────────────

    private function buildInsightsPrompt(array $overview, array $sources, int $crmLeads): string
    {
        $totals  = $overview['totals']   ?? [];
        $trend   = $overview['trend']    ?? [];
        $pages   = $overview['top_pages'] ?? [];
        $channels = $sources['channels'] ?? [];

        $sessions    = $totals['sessions']    ?? 0;
        $users       = $totals['users']       ?? 0;
        $pageviews   = $totals['pageviews']   ?? 0;
        $bounceRate  = $totals['bounce_rate'] ?? 0;
        $newUsers    = $totals['new_users']   ?? 0;
        $returnPct   = $users > 0 ? round(($users - $newUsers) / $users * 100, 1) : 0;

        $topChannels = implode(', ', array_map(fn($c) => "{$c['channel']} ({$c['pct']}%)", array_slice($channels, 0, 4)));
        $topPages    = implode(', ', array_map(fn($p) => "'{$p['path']}' ({$p['pageviews']} views)", array_slice($pages, 0, 5)));

        return <<<PROMPT
You are a digital marketing analyst for a Chartered Accountancy practice in India (CA Rahul Gupta & Associates).
You have been given 30-day website analytics. Provide exactly 6 actionable improvement suggestions in JSON.

Analytics summary (last 30 days):
- Sessions: {$sessions}
- Unique users: {$users}
- Page views: {$pageviews}
- Bounce rate: {$bounceRate}%
- New visitors: {$newUsers} | Returning: {$returnPct}%
- Top traffic channels: {$topChannels}
- Top pages: {$topPages}
- CRM leads captured: {$crmLeads}

Output ONLY a valid JSON array of exactly 6 objects. Each object must have these exact fields:
  "category": one of ["SEO","Content","Campaigns","Lead Funnel","Associate","Social"]
  "title": short title (max 8 words)
  "recommendation": specific, actionable advice (2-3 sentences)
  "priority": one of ["high","medium","low"]

Do NOT include any text before or after the JSON array.
PROMPT;
    }

    private function callOpenAI(string $apiKey, string $prompt): ?array
    {
        $payload = [
            'model'      => 'gpt-4o-mini',
            'messages'   => [
                ['role' => 'user', 'content' => $prompt],
            ],
            'temperature' => 0.5,
            'max_tokens'  => 1200,
        ];

        $ch = curl_init('https://api.openai.com/v1/chat/completions');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                "Authorization: Bearer {$apiKey}",
            ],
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_TIMEOUT    => 30,
        ]);
        $body   = (string)curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($status !== 200) {
            return null;
        }

        $data    = json_decode($body, true);
        $content = $data['choices'][0]['message']['content'] ?? '';

        // Strip markdown fences if present
        $content = preg_replace('/^```(?:json)?\s*/m', '', $content);
        $content = preg_replace('/\s*```$/m', '', $content);

        $parsed = json_decode(trim($content), true);
        return is_array($parsed) ? $parsed : null;
    }

    // ── Cache helpers ─────────────────────────────────────────────────────────

    private function getCache(string $key, string $hash): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT data_json FROM analytics_cache WHERE report_key = :k AND params_hash = :h AND expires_at > NOW() LIMIT 1'
        );
        $stmt->execute([':k' => $key, ':h' => $hash]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) return null;
        return json_decode($row['data_json'], true) ?: null;
    }

    private function setCache(string $key, string $hash, array $data, int $ttl): void
    {
        $expires = date('Y-m-d H:i:s', time() + $ttl);
        $stmt = $this->db->prepare('
            INSERT INTO analytics_cache (report_key, params_hash, data_json, fetched_at, expires_at)
            VALUES (:k, :h, :data, NOW(), :exp)
            ON CONFLICT (report_key, params_hash) DO UPDATE SET
                data_json  = EXCLUDED.data_json,
                fetched_at = NOW(),
                expires_at = EXCLUDED.expires_at
        ');
        $stmt->execute([':k' => $key, ':h' => $hash, ':data' => json_encode($data), ':exp' => $expires]);
    }

    // ── Mock data (when GA4 is not configured) ────────────────────────────────

    private function mockOverview(int $days): array
    {
        $trend = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $d         = date('Ymd', strtotime("-{$i} days"));
            $sessions  = random_int(28, 72);
            $users     = (int)($sessions * 0.8);
            $trend[]   = [
                'date'      => $d,
                'sessions'  => $sessions,
                'users'     => $users,
                'pageviews' => (int)($sessions * 2.5),
                'new_users' => (int)($users * 0.6),
            ];
        }
        return [
            'trend'     => $trend,
            'totals'    => [
                'sessions'    => 1420,
                'users'       => 1138,
                'pageviews'   => 3550,
                'new_users'   => 853,
                'bounce_rate' => 41.2,
            ],
            'top_pages' => [
                ['path' => '/',          'title' => 'Home',        'pageviews' => 1200, 'users' => 960],
                ['path' => '/services',  'title' => 'Services',    'pageviews' => 780,  'users' => 624],
                ['path' => '/blog',      'title' => 'Blog',        'pageviews' => 560,  'users' => 448],
                ['path' => '/contact',   'title' => 'Contact',     'pageviews' => 340,  'users' => 272],
                ['path' => '/about',     'title' => 'About',       'pageviews' => 220,  'users' => 176],
            ],
            'days'       => $days,
            '_demo'      => true,
        ];
    }

    private function mockSources(): array
    {
        return [
            'channels' => [
                ['channel' => 'Organic Search',     'sessions' => 682, 'users' => 546, 'pct' => 48.0],
                ['channel' => 'Direct',             'sessions' => 312, 'users' => 250, 'pct' => 22.0],
                ['channel' => 'Referral',           'sessions' => 255, 'users' => 204, 'pct' => 18.0],
                ['channel' => 'Organic Social',     'sessions' => 170, 'users' => 136, 'pct' => 12.0],
            ],
            'total_sessions' => 1419,
            '_demo' => true,
        ];
    }

    private function mockLeads(): array
    {
        return [
            'lead_form_submit'   => 23,
            'blog_lead_submit'   => 14,
            'blog_cta_click'     => 89,
            'associate_link_click' => 47,
            '_demo' => true,
        ];
    }
}

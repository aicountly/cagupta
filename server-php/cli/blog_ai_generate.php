<?php
declare(strict_types=1);

/**
 * blog_ai_generate.php — Daily AI Blog Draft Generator
 *
 * Uses GPT-5.5 to generate blog topics and full drafts, then DALL-E 3
 * to create cover images.  All drafts are stored as "pending" in
 * blog_ai_drafts and appear in the staff app for human review.
 *
 * Generates 2 options per category per run:
 *   - laws       → New Laws & Provisions
 *   - tax_saving → New Areas of Tax Saving / Tax Planning
 *
 * Designed for a daily cron (Windows Task Scheduler / cPanel):
 *   0 6 * * *  php /path/to/server-php/cli/blog_ai_generate.php >> /path/to/logs/blog_ai.log 2>&1
 *
 * Usage:
 *   php cli/blog_ai_generate.php               # standard run
 *   php cli/blog_ai_generate.php --dry-run     # print generated content, don't save
 *   php cli/blog_ai_generate.php --category laws   # only one category
 */

// ── Bootstrap ─────────────────────────────────────────────────────────────────

$scriptDir = dirname(__DIR__);   // server-php/

$envFile = $scriptDir . '/.env';
if (is_readable($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$key, $value] = explode('=', $line, 2);
        $key   = trim($key);
        $value = trim($value);
        if (preg_match('/^(["\'])(.*)\\1$/', $value, $m)) $value = $m[2];
        if ($key !== '' && !array_key_exists($key, $_ENV)) {
            putenv("{$key}={$value}");
            $_ENV[$key] = $_SERVER[$key] = $value;
        }
    }
}

require_once $scriptDir . '/app/Config/Database.php';

use App\Config\Database;

// ── CLI arguments ─────────────────────────────────────────────────────────────

$dryRun          = false;
$onlyCategory    = null;
$optionsPerCat   = 2;

foreach (array_slice($argv ?? [], 1) as $arg) {
    if ($arg === '--dry-run') $dryRun = true;
    if (str_starts_with($arg, '--category=')) $onlyCategory = substr($arg, 11);
    if (str_starts_with($arg, '--options='))  $optionsPerCat = max(1, (int)substr($arg, 10));
}

$categories = $onlyCategory ? [$onlyCategory] : ['laws', 'tax_saving'];

echo '[blog-ai] Starting at ' . date('Y-m-d H:i:s') . PHP_EOL;

// ── Validate env ─────────────────────────────────────────────────────────────

$openAiKey  = (string)(getenv('OPENAI_API_KEY') ?: '');
$textModel  = (string)(getenv('OPENAI_MODEL') ?: 'gpt-5.5');
$imageModel = (string)(getenv('OPENAI_IMAGE_MODEL') ?: 'dall-e-3');

if ($openAiKey === '') {
    fwrite(STDERR, '[blog-ai] OPENAI_API_KEY is not set in .env — aborting.' . PHP_EOL);
    exit(1);
}

// ── DB connection ─────────────────────────────────────────────────────────────

try {
    $pdo = Database::getConnection();
} catch (\Throwable $e) {
    fwrite(STDERR, '[blog-ai] DB connection failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

// ── Upload dir (same as BlogController: BLOG_UPLOADS_PATH) ────────────────────

$blogUploadDir = (static function (string $serverPhpRoot): string {
    $configured = (string)(getenv('BLOG_UPLOADS_PATH') ?: ($_ENV['BLOG_UPLOADS_PATH'] ?? ''));
    if ($configured !== '') {
        return rtrim($configured, '/\\');
    }

    return $serverPhpRoot . DIRECTORY_SEPARATOR . 'blog_uploads';
})($scriptDir);

if (!is_dir($blogUploadDir)) {
    mkdir($blogUploadDir, 0755, true);
}

// ── OpenAI helpers ────────────────────────────────────────────────────────────

function openaiChat(string $apiKey, string $model, array $messages, int $maxCompletionTokens = 2000): ?string
{
    $payload = json_encode([
        'model'                 => $model,
        'messages'              => $messages,
        'max_completion_tokens' => $maxCompletionTokens,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $ch = curl_init('https://api.openai.com/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_TIMEOUT        => 60,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            "Authorization: Bearer {$apiKey}",
        ],
    ]);

    $response = curl_exec($ch);
    $err      = curl_error($ch);
    $code     = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($err !== '') {
        fwrite(STDERR, "[blog-ai] cURL error (chat): {$err}" . PHP_EOL);
        return null;
    }
    if ($code !== 200) {
        fwrite(STDERR, "[blog-ai] OpenAI chat error {$code}: {$response}" . PHP_EOL);
        return null;
    }

    $data = json_decode($response, true);
    return $data['choices'][0]['message']['content'] ?? null;
}

function openaiGenerateImage(string $apiKey, string $model, string $prompt, string $uploadDir): ?string
{
    $payload = json_encode([
        'model'   => $model,
        'prompt'  => $prompt,
        'n'       => 1,
        'size'    => '1792x1024',
        'quality' => 'standard',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $ch = curl_init('https://api.openai.com/v1/images/generations');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_TIMEOUT        => 60,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            "Authorization: Bearer {$apiKey}",
        ],
    ]);

    $response = curl_exec($ch);
    $err      = curl_error($ch);
    $code     = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($err !== '') {
        fwrite(STDERR, "[blog-ai] cURL error (image): {$err}" . PHP_EOL);
        return null;
    }
    if ($code !== 200) {
        fwrite(STDERR, "[blog-ai] DALL-E error {$code}: {$response}" . PHP_EOL);
        return null;
    }

    $data     = json_decode($response, true);
    $imageUrl = $data['data'][0]['url'] ?? null;
    if ($imageUrl === null) return null;

    // Download and store locally
    $imgData = @file_get_contents($imageUrl);
    if ($imgData === false) {
        fwrite(STDERR, '[blog-ai] Failed to download generated image.' . PHP_EOL);
        return null;
    }

    $filename = 'cover_ai_' . uniqid('', true) . '.png';
    $fullPath = rtrim($uploadDir, '/\\') . DIRECTORY_SEPARATOR . $filename;
    file_put_contents($fullPath, $imgData);

    return 'blog_uploads/' . $filename;
}

// ── Category configs ──────────────────────────────────────────────────────────

$categoryConfig = [
    'laws' => [
        'label'       => 'New Laws & Provisions',
        'topicPrompt' => 'You are an expert Indian chartered accountant. Suggest one highly specific, timely blog topic about a recent Indian tax law, provision, SEBI regulation, RBI circular, or GST amendment that would be most useful and engaging for business owners and individual taxpayers right now in 2026. Return ONLY the topic title — no extra text, no numbering, no quotes.',
        'imagePrompt' => 'Professional, clean illustration for a CA firm blog about Indian tax law and regulations. Abstract legal/financial imagery, muted blues and oranges, courthouse columns, legal documents, no text, modern flat style.',
    ],
    'tax_saving' => [
        'label'       => 'Tax Saving & Tax Planning',
        'topicPrompt' => 'You are an expert Indian chartered accountant. Suggest one highly specific, actionable blog topic about a lesser-known or underutilised tax-saving strategy, deduction, exemption, or investment that Indian taxpayers and business owners can use in FY 2025-26 or FY 2026-27. Return ONLY the topic title — no extra text, no numbering, no quotes.',
        'imagePrompt' => 'Professional, clean illustration for a CA firm blog about tax planning and savings. Abstract financial imagery — coins, piggy bank, growing plant, calculator, muted greens and oranges, no text, modern flat style.',
    ],
];

// ── Main generation loop ──────────────────────────────────────────────────────

$totalGenerated = 0;

foreach ($categories as $category) {
    if (!isset($categoryConfig[$category])) {
        fwrite(STDERR, "[blog-ai] Unknown category: {$category}" . PHP_EOL);
        continue;
    }

    $config     = $categoryConfig[$category];
    $catLabel   = $config['label'];

    echo "[blog-ai] Generating {$optionsPerCat} draft(s) for category: {$catLabel}" . PHP_EOL;

    for ($optIdx = 1; $optIdx <= $optionsPerCat; $optIdx++) {
        echo "[blog-ai]   Option {$optIdx}/{$optionsPerCat}..." . PHP_EOL;

        // Step 1: Generate topic
        $topic = openaiChat($openAiKey, $textModel, [
            ['role' => 'user', 'content' => $config['topicPrompt']],
        ], 100);

        if ($topic === null) {
            fwrite(STDERR, "[blog-ai] Failed to generate topic for {$category} option {$optIdx}" . PHP_EOL);
            continue;
        }
        $topic = trim(strip_tags($topic));
        echo "[blog-ai]   Topic: {$topic}" . PHP_EOL;

        // Step 2: Generate full blog draft
        $blogPrompt = <<<PROMPT
You are a senior Indian chartered accountant writing a blog for CA Rahul Gupta's firm website.
Write a comprehensive, well-researched blog article on the following topic:

Topic: {$topic}
Category: {$catLabel}

Requirements:
- Write in clear, simple English that business owners and individual taxpayers can easily understand
- Structure: Start with an engaging introduction, then use 3–5 main sections with subheadings (use ## for H2), end with a practical conclusion
- Include real Indian tax provisions, section references (e.g. Section 80C, Section 194Q), and practical examples where relevant
- Word count: 600–900 words
- Do NOT use markdown bold (**) or italics (*) — plain text only
- Return in this exact JSON format (no extra text before or after):
{
  "title": "SEO-optimised article title",
  "excerpt": "2–3 sentence summary for blog listing page (max 160 characters)",
  "content": "Full article in plain text with ## subheadings"
}
PROMPT;

        $draftJson = openaiChat($openAiKey, $textModel, [
            ['role' => 'user', 'content' => $blogPrompt],
        ], 2000);

        if ($draftJson === null) {
            fwrite(STDERR, "[blog-ai] Failed to generate draft for {$category} option {$optIdx}" . PHP_EOL);
            continue;
        }

        // Extract JSON even if model adds surrounding text
        if (preg_match('/\{[\s\S]*\}/m', $draftJson, $jsonMatch)) {
            $draftJson = $jsonMatch[0];
        }

        $draft = json_decode($draftJson, true);
        if (!is_array($draft) || empty($draft['title']) || empty($draft['content'])) {
            fwrite(STDERR, "[blog-ai] Invalid draft JSON for {$category} option {$optIdx}: " . substr($draftJson, 0, 200) . PHP_EOL);
            continue;
        }

        $draftTitle   = substr(trim((string)$draft['title']),   0, 490);
        $draftExcerpt = substr(trim((string)($draft['excerpt'] ?? '')), 0, 500);
        $draftContent = trim((string)$draft['content']);

        echo "[blog-ai]   Title: {$draftTitle}" . PHP_EOL;

        // Step 3: Generate cover image
        $coverPath = null;
        if (!$dryRun) {
            $imagePromptFull = $config['imagePrompt'] . " Topic context: {$draftTitle}";
            $coverPath = openaiGenerateImage($openAiKey, $imageModel, $imagePromptFull, $blogUploadDir);
            if ($coverPath === null) {
                echo "[blog-ai]   Cover image generation failed — proceeding without cover." . PHP_EOL;
            } else {
                echo "[blog-ai]   Cover image saved: {$coverPath}" . PHP_EOL;
            }
        }

        if ($dryRun) {
            echo PHP_EOL;
            echo "=== DRY RUN — Category: {$catLabel} | Option {$optIdx} ===" . PHP_EOL;
            echo "TOPIC:   {$topic}" . PHP_EOL;
            echo "TITLE:   {$draftTitle}" . PHP_EOL;
            echo "EXCERPT: {$draftExcerpt}" . PHP_EOL;
            echo "CONTENT:" . PHP_EOL . $draftContent . PHP_EOL;
            echo PHP_EOL;
            $totalGenerated++;
            continue;
        }

        // Step 4: Persist to DB
        try {
            $stmt = $pdo->prepare('
                INSERT INTO blog_ai_drafts
                    (topic, category, option_index, title, excerpt, content, cover_image_path, status)
                VALUES
                    (:topic, :cat, :opt, :title, :excerpt, :content, :cover, :status)
            ');
            $stmt->execute([
                ':topic'   => $topic,
                ':cat'     => $category,
                ':opt'     => $optIdx,
                ':title'   => $draftTitle,
                ':excerpt' => $draftExcerpt,
                ':content' => $draftContent,
                ':cover'   => $coverPath ?? '',
                ':status'  => 'pending',
            ]);
            echo "[blog-ai]   Saved to DB (id: {$pdo->lastInsertId()})" . PHP_EOL;
            $totalGenerated++;
        } catch (\Throwable $e) {
            fwrite(STDERR, "[blog-ai] DB insert failed: " . $e->getMessage() . PHP_EOL);
        }

        // Brief pause to avoid OpenAI rate limits
        if ($optIdx < $optionsPerCat) sleep(2);
    }

    echo "[blog-ai] Done with category: {$catLabel}" . PHP_EOL;
}

echo "[blog-ai] Finished at " . date('Y-m-d H:i:s') . " — {$totalGenerated} draft(s) generated." . PHP_EOL;
exit(0);

<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Shared AI blog draft generation used by cron (cli/blog_ai_generate.php) and manual API trigger.
 */
final class BlogAiGenerator
{
    /** Set when the last openaiChat() call fails; appended to the generator log next to ERROR lines. */
    private static ?string $lastOpenAiChatFailure = null;

    /** @var array<string, array{label: string, topicPrompt: string, imagePrompt: string}> */
    private const CATEGORY_CONFIG = [
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
        'ai_promotions' => [
            'label'       => 'AI Promotions',
            'topicPrompt' => 'You are an expert Indian chartered accountant and business consultant. Suggest one highly specific, practical blog topic about how Indian businesses, startups, or professionals can leverage AI tools, automation, or government AI initiatives to improve productivity, reduce costs, or unlock new revenue in 2026. Return ONLY the topic title — no extra text, no numbering, no quotes.',
            'imagePrompt' => 'Professional, clean illustration for a CA firm blog about AI adoption in Indian business. Abstract tech imagery — neural network nodes, digital gears, glowing circuits, muted purples and greys, no text, modern flat style.',
        ],
        'subsidies_promotions' => [
            'label'       => 'Subsidies Promotions',
            'topicPrompt' => 'You are an expert Indian chartered accountant and government scheme advisor. Suggest one highly specific, actionable blog topic about a central or state government subsidy, grant, or incentive scheme available to Indian MSMEs, startups, or individuals in 2026 that most businesses are unaware of or underutilise. Return ONLY the topic title — no extra text, no numbering, no quotes.',
            'imagePrompt' => 'Professional, clean illustration for a CA firm blog about government subsidies and grants in India. Abstract imagery — government building, handshake, growth chart, Indian rupee coins, muted greens and blues, no text, modern flat style.',
        ],
        'funding_promotions' => [
            'label'       => 'Funding Promotions',
            'topicPrompt' => 'You are an expert Indian chartered accountant and startup funding advisor. Suggest one highly specific, actionable blog topic about fundraising options, investor funding rounds, venture debt, angel networks, or government-backed funding schemes available to Indian startups and SMEs in 2026. Return ONLY the topic title — no extra text, no numbering, no quotes.',
            'imagePrompt' => 'Professional, clean illustration for a CA firm blog about startup and business funding in India. Abstract financial imagery — rocket launch, seed money, growth arrows, investor handshake, muted oranges and greens, no text, modern flat style.',
        ],
    ];

    /**
     * @param array{
     *   pdo: PDO,
     *   server_php_root: string,
     *   dry_run?: bool,
     *   only_category?: ?string,
     *   options_per_category?: int,
     *   stream_callback?: ?callable(string):void,
     *   model_emit?: ?callable(string $context, string $phase, string $chunk):void
     * } $cfg
     * @return array{total_generated: int, log: string[], error?: string}
     */
    public static function run(array $cfg): array
    {
        $pdo              = $cfg['pdo'];
        $serverPhpRoot    = rtrim($cfg['server_php_root'], '/\\');
        $dryRun           = (bool)($cfg['dry_run'] ?? false);
        $onlyCategory     = $cfg['only_category'] ?? null;
        $optionsPerCat    = max(1, (int)($cfg['options_per_category'] ?? 2));
        $streamCb         = $cfg['stream_callback'] ?? null;
        $modelEmit        = \is_callable($cfg['model_emit'] ?? null) ? $cfg['model_emit'] : null;

        $log = [];
        $add = static function (string $line) use (&$log, $streamCb): void {
            $log[] = $line;
            if (\is_callable($streamCb)) {
                ($streamCb)($line);
            }
        };

        $openAiKey  = (string)(getenv('OPENAI_API_KEY') ?: '');
        $textModel  = (string)(getenv('OPENAI_MODEL') ?: 'gpt-5.1');
        $imageModel = (string)(getenv('OPENAI_IMAGE_MODEL') ?: 'dall-e-3');
        /** Minimum seconds between each OpenAI API call (set to ~21 on low-RPM tiers; 0 disables). */
        $minInterval = max(0.0, (float)(getenv('OPENAI_MIN_REQUEST_INTERVAL_SEC') ?: '0'));
        /** Max completion tokens for the long JSON article response. */
        $draftMaxTok = max(4096, min(32768, (int)(getenv('OPENAI_DRAFT_MAX_COMPLETION_TOKENS') ?: '8192')));
        /** After last OpenAI completion (Unix seconds.micro); null = skip spacing before first call. */
        $afterLastAi = null;

        if ($openAiKey === '') {
            return ['total_generated' => 0, 'log' => $log, 'error' => 'OPENAI_API_KEY is not set in .env'];
        }

        $blogUploadDir = self::resolveBlogUploadDir($serverPhpRoot);
        if (!is_dir($blogUploadDir)) {
            mkdir($blogUploadDir, 0755, true);
        }

        $categories = $onlyCategory !== null && $onlyCategory !== ''
            ? [$onlyCategory]
            : ['laws', 'tax_saving', 'ai_promotions', 'subsidies_promotions', 'funding_promotions'];

        $add('[blog-ai] Starting at ' . date('Y-m-d H:i:s'));

        $totalGenerated = 0;

        foreach ($categories as $category) {
            if (!isset(self::CATEGORY_CONFIG[$category])) {
                $add("[blog-ai] Unknown category skipped: {$category}");
                continue;
            }

            $config   = self::CATEGORY_CONFIG[$category];
            $catLabel = $config['label'];

            $add("[blog-ai] Generating {$optionsPerCat} draft(s) for category: {$catLabel}");

            for ($optIdx = 1; $optIdx <= $optionsPerCat; $optIdx++) {
                $add("[blog-ai]   Option {$optIdx}/{$optionsPerCat}...");

                self::ensureOpenAiSpacing($afterLastAi, $minInterval, $add);
                $topic = self::openaiChat(
                    $openAiKey,
                    $textModel,
                    [
                        ['role' => 'user', 'content' => $config['topicPrompt']],
                    ],
                    320,
                    false,
                    $modelEmit,
                    'topic',
                );
                $afterLastAi = microtime(true);

                if ($topic === null) {
                    $add("[blog-ai] ERROR: Failed to generate topic for {$category} option {$optIdx}");
                    if (self::$lastOpenAiChatFailure !== null && self::$lastOpenAiChatFailure !== '') {
                        $add('[blog-ai]   → ' . self::$lastOpenAiChatFailure);
                    }
                    continue;
                }
                $topic = trim(strip_tags($topic));
                $add("[blog-ai]   Topic: {$topic}");

                $blogPrompt = <<<PROMPT
You are a senior Indian chartered accountant writing a professional blog article for CA Rahul Gupta's firm website.
Write a comprehensive, well-researched article on this topic:

Topic: {$topic}
Category: {$catLabel}

Return ONE valid JSON object with these keys — no prose before or after:
{
  "title": "Clear, SEO-friendly article title",
  "excerpt": "2–3 sentence plain-text summary for listing cards (NO HTML tags here)",
  "content": "Full article body as clean semantic HTML (see rules below)"
}

Content HTML rules (these are strict):
- Start with an engaging introductory <p> paragraph — do NOT start with a heading
- Use <h2> for 3–5 main section headings spread throughout the article
- Use <p> for every paragraph of body text
- Use <strong> to emphasise key terms, section numbers (e.g. Section 80C), amounts, deadlines
- Use <em> sparingly for definitions or asides
- Use <ul><li> for bullet lists and <ol><li> for numbered steps
- Do NOT include <html>, <head>, <body>, <h1>, <style>, or <script> tags
- Do NOT use markdown syntax (##, **, -, ```, etc.) — only HTML tags
- All tags must be properly opened and closed

Writing style:
- Clear, simple English that business owners and individual taxpayers can easily understand
- 600–900 words
- Include real Indian tax provisions, section references, and practical examples where relevant
- End with a short, actionable conclusion section under an <h2>

PROMPT;

                self::ensureOpenAiSpacing($afterLastAi, $minInterval, $add);
                $draftJson = self::openaiChat(
                    $openAiKey,
                    $textModel,
                    [
                        ['role' => 'user', 'content' => $blogPrompt],
                    ],
                    $draftMaxTok,
                    true,
                    $modelEmit,
                    'draft_json',
                );
                $afterLastAi = microtime(true);

                if ($draftJson === null) {
                    $add("[blog-ai] ERROR: Failed to generate draft for {$category} option {$optIdx}");
                    if (self::$lastOpenAiChatFailure !== null && self::$lastOpenAiChatFailure !== '') {
                        $add('[blog-ai]   → ' . self::$lastOpenAiChatFailure);
                    }
                    continue;
                }

                $draft = self::decodeDraftJson($draftJson);
                if ($draft === null) {
                    $add('[blog-ai] ERROR: Invalid draft JSON for ' . $category . ' option ' . $optIdx . ': ' . substr(self::collapseWhitespace($draftJson), 0, 420));
                    continue;
                }

                $draftTitle   = substr(trim((string)$draft['title']), 0, 490);
                $draftExcerpt = substr(trim((string)($draft['excerpt'] ?? '')), 0, 500);
                $draftContent = self::normalizeContent(trim((string)$draft['content']));

                $add("[blog-ai]   Title: {$draftTitle}");

                $coverPath = null;
                if (!$dryRun) {
                    $imagePromptFull = "Professional blog cover image for a CA firm website article titled \"{$draftTitle}\". "
                        . $config['imagePrompt']
                        . ' Wide landscape format, visually striking, suitable as a hero banner.';
                    self::ensureOpenAiSpacing($afterLastAi, $minInterval, $add);
                    $coverPath = self::openaiGenerateImage($openAiKey, $imageModel, $imagePromptFull, $blogUploadDir);
                    $afterLastAi = microtime(true);
                    if ($coverPath === null) {
                        $add('[blog-ai]   Cover image generation failed — proceeding without cover.');
                    } else {
                        $add("[blog-ai]   Cover image saved: {$coverPath}");
                    }
                }

                if ($dryRun) {
                    $add('');
                    $add("=== DRY RUN — Category: {$catLabel} | Option {$optIdx} ===");
                    $add("TOPIC:   {$topic}");
                    $add("TITLE:   {$draftTitle}");
                    $add("EXCERPT: {$draftExcerpt}");
                    $add('CONTENT:');
                    $add($draftContent);
                    $add('');
                    $totalGenerated++;
                    continue;
                }

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
                    $add('[blog-ai]   Saved to DB (id: ' . $pdo->lastInsertId() . ')');
                    $totalGenerated++;
                } catch (\Throwable $e) {
                    $add('[blog-ai] ERROR: DB insert failed: ' . $e->getMessage());
                }

                if ($optIdx < $optionsPerCat && $minInterval <= 0) {
                    sleep(2);
                }
            }

            $add("[blog-ai] Done with category: {$catLabel}");
        }

        $add('[blog-ai] Finished at ' . date('Y-m-d H:i:s') . " — {$totalGenerated} draft(s) generated.");

        return ['total_generated' => $totalGenerated, 'log' => $log];
    }

    private static function resolveBlogUploadDir(string $serverPhpRoot): string
    {
        $configured = (string)(getenv('BLOG_UPLOADS_PATH') ?: ($_ENV['BLOG_UPLOADS_PATH'] ?? ''));
        if ($configured !== '') {
            return rtrim($configured, '/\\');
        }

        return $serverPhpRoot . DIRECTORY_SEPARATOR . 'blog_uploads';
    }

    /**
     * @param callable(string):void $logLine
     */
    private static function ensureOpenAiSpacing(?float &$afterLast, float $minIntervalSec, callable $logLine): void
    {
        if ($minIntervalSec <= 0.0 || $afterLast === null) {
            return;
        }

        $elapsed = microtime(true) - $afterLast;
        if ($elapsed < $minIntervalSec) {
            $wait = $minIntervalSec - $elapsed;
            $logLine(sprintf('[blog-ai]   Waiting %.0fs before next OpenAI call', $wait));
            usleep(max(1000, (int)floor($wait * 1e6)));
        }
    }

    /**
     * @return ?array{title: mixed, excerpt: mixed, content: mixed}
     */
    private static function decodeDraftJson(string $raw): ?array
    {
        $s = trim($raw);

        if (preg_match('/^```(?:json)?\s*([\s\S]*?)\s*```$/i', $s, $fence)) {
            $s = trim($fence[1]);
        }

        $decoded = json_decode($s, true);
        if (is_array($decoded) && !empty($decoded['title']) && !empty($decoded['content'])) {
            return $decoded;
        }

        if (preg_match('/\{[\s\S]*}/', $raw, $m)) {
            $decoded = json_decode($m[0], true);
            if (is_array($decoded) && !empty($decoded['title']) && !empty($decoded['content'])) {
                return $decoded;
            }
        }

        return null;
    }

    private static function collapseWhitespace(string $s): string
    {
        $s = preg_replace('/\s+/', ' ', trim($s));

        return is_string($s) ? $s : '';
    }

    /**
     * Ensure the draft content is clean HTML ready for rendering.
     *
     * Handles three scenarios from OpenAI output:
     *  1. Already valid HTML (has block-level tags) — return as-is.
     *  2. Markdown with literal "\n" (two-char backslash+n from the old prompt bug) — fix and convert.
     *  3. Markdown with real newlines — convert to HTML.
     */
    private static function normalizeContent(string $raw): string
    {
        if ($raw === '') {
            return '';
        }

        // Fix the double-escape bug: literal two-char "\n" → actual newline
        $content = str_replace("\\n", "\n", $raw);
        // Strip stray \r
        $content = str_replace("\r", '', $content);

        // If the content already contains block-level HTML tags, it's ready.
        if (preg_match('/<(?:p|h[1-6]|ul|ol|div|section|article|blockquote)\b/i', $content)) {
            return trim($content);
        }

        // Fallback: content is markdown / plain text — convert to semantic HTML.
        return self::markdownToHtml($content);
    }

    /**
     * Simple markdown-to-HTML converter for legacy or fallback plain-text drafts.
     */
    private static function markdownToHtml(string $md): string
    {
        $lines   = explode("\n", $md);
        $html    = [];
        $listBuf = [];

        $flushList = static function () use (&$html, &$listBuf): void {
            if ($listBuf !== []) {
                $html[]  = '<ul>' . implode('', array_map(static fn($l) => "<li>{$l}</li>", $listBuf)) . '</ul>';
                $listBuf = [];
            }
        };

        $inlineFmt = static function (string $text): string {
            $text = preg_replace('/\*\*(.+?)\*\*/', '<strong>$1</strong>', $text) ?? $text;
            $text = preg_replace('/\*(.+?)\*/', '<em>$1</em>', $text) ?? $text;
            return $text;
        };

        foreach ($lines as $line) {
            $line = rtrim($line);

            if (preg_match('/^#{1,3}\s+(.+)/', $line, $m)) {
                $flushList();
                $html[] = '<h2>' . $inlineFmt($m[1]) . '</h2>';
            } elseif (preg_match('/^[-*]\s+(.+)/', $line, $m)) {
                $listBuf[] = $inlineFmt($m[1]);
            } elseif (preg_match('/^\d+\.\s+(.+)/', $line, $m)) {
                $flushList();
                $html[] = '<p>' . $inlineFmt($m[1]) . '</p>';
            } elseif (trim($line) === '') {
                $flushList();
            } else {
                $flushList();
                $html[] = '<p>' . $inlineFmt($line) . '</p>';
            }
        }

        $flushList();

        return implode("\n", $html);
    }

    private static function sleepBefore429Retry(string $responseBody): int
    {
        if (preg_match('/retry after (\d+)ms/i', $responseBody, $m)) {
            return max(2, (int)ceil(((int)$m[1]) / 1000) + 1);
        }

        if (preg_match('/try again in (\d+)\s*s/i', $responseBody, $m)) {
            return max(2, ((int)$m[1]) + 2);
        }

        return 22;
    }

    /**
     * @param ?callable(string $context, string $phase, string $chunk):void $modelEmit
     */
    private static function openaiChat(
        string $apiKey,
        string $model,
        array $messages,
        int $maxCompletionTokens = 2000,
        bool $jsonObject = false,
        ?callable $modelEmit = null,
        string $emitContext = 'chat',
    ): ?string {
        self::$lastOpenAiChatFailure = null;

        if ($modelEmit !== null) {
            return self::openaiChatViaStream($apiKey, $model, $messages, $maxCompletionTokens, $jsonObject, $modelEmit, $emitContext)
                ?? self::openaiChatBuffered($apiKey, $model, $messages, $maxCompletionTokens, $jsonObject);
        }

        return self::openaiChatBuffered($apiKey, $model, $messages, $maxCompletionTokens, $jsonObject);
    }

    /**
     * @param callable(string $context, string $phase, string $chunk):void $modelEmit
     */
    private static function forwardStreamDeltaPieces(array $delta, callable $modelEmit, string $emitContext): void
    {
        $seen = [];

        foreach ([
            'reasoning_content',
            'reasoning_summary',
            'reasoning',
            'thinking',
            'thinking_summary',
        ] as $key) {
            if (!isset($delta[$key]) || !is_string($delta[$key]) || $delta[$key] === '') {
                continue;
            }
            $modelEmit($emitContext, 'reasoning', $delta[$key]);
            $seen[$key] = true;
        }

        $blocks = $delta['thinking_blocks'] ?? null;
        if (is_array($blocks)) {
            foreach ($blocks as $b) {
                if (!is_array($b)) {
                    continue;
                }
                $t = $b['thinking'] ?? $b['thought'] ?? $b['summary'] ?? $b['text'] ?? null;
                if (is_string($t) && $t !== '') {
                    $modelEmit($emitContext, 'reasoning', $t);
                }
            }
        }

        $skipKeys = ['thinking_blocks', 'content', 'role', 'refusal'];
        foreach ($delta as $k => $v) {
            if (!is_string($k) || isset($seen[$k])) {
                continue;
            }
            if (!is_string($v) || $v === '') {
                continue;
            }
            if (preg_match('/reason|think|reflection|thought|internal|chain/i', $k) !== 1) {
                continue;
            }
            if (in_array($k, $skipKeys, true)) {
                continue;
            }
            $modelEmit($emitContext, 'reasoning', $v);
            $seen[$k] = true;
        }

        if (isset($delta['content']) && is_string($delta['content']) && $delta['content'] !== '') {
            $modelEmit($emitContext, 'assistant', $delta['content']);
        }
    }

    /**
     * Streams OpenAI Chat Completions (SSE); accumulates assistant-visible `delta.content`.
     *
     * @param callable(string $context, string $phase, string $chunk):void $modelEmit
     */
    private static function openaiChatViaStream(
        string $apiKey,
        string $model,
        array $messages,
        int $maxCompletionTokens,
        bool $jsonObject,
        callable $modelEmit,
        string $emitContext,
    ): ?string {
        $maxAttempts      = 5;
        $lastFailureTail  = '';

        for ($attempt = 1; $attempt <= $maxAttempts; ++$attempt) {
            $assembled    = '';
            $sseRemainder = '';
            $streamErr    = '';
            $firstHttp    = null;

            $body = [
                'model'                 => $model,
                'messages'              => $messages,
                'max_completion_tokens' => $maxCompletionTokens,
                'stream'                => true,
            ];
            if ($jsonObject) {
                $body['response_format'] = ['type' => 'json_object'];
            }

            $payload = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

            $ch = curl_init('https://api.openai.com/v1/chat/completions');
            curl_setopt_array($ch, [
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => $payload,
                CURLOPT_TIMEOUT        => 400,
                CURLOPT_CONNECTTIMEOUT => 20,
                CURLOPT_HTTPHEADER     => [
                    'Content-Type: application/json',
                    'Accept: text/event-stream',
                    "Authorization: Bearer {$apiKey}",
                ],
                CURLOPT_HEADERFUNCTION => static function ($ch, string $hdrLine) use (&$firstHttp): int {
                    $t = trim($hdrLine);
                    if ($firstHttp === null && $t !== '' && preg_match('/^HTTP\\/\\S+ (\\d{3}) /', $t, $m)) {
                        $firstHttp = (int)$m[1];
                    }
                    if ($firstHttp === null && str_starts_with($t, ':status')) {
                        $bits = preg_split('/\s+/', $t) ?: [];
                        if (isset($bits[1]) && ctype_digit((string)$bits[1])) {
                            $firstHttp = (int)$bits[1];
                        }
                    }

                    return strlen($hdrLine);
                },
                CURLOPT_WRITEFUNCTION => function ($curl, string $chunk) use (
                    &$sseRemainder,
                    &$assembled,
                    &$streamErr,
                    $modelEmit,
                    $emitContext
                ): int {
                    $sseRemainder .= $chunk;
                    while (($nl = strpos($sseRemainder, "\n")) !== false) {
                        $raw          = substr($sseRemainder, 0, $nl);
                        $sseRemainder = substr($sseRemainder, $nl + 1);
                        $line         = rtrim(str_replace("\r", '', $raw), "\r");
                        if ($line === '' || str_starts_with($line, ':')) {
                            continue;
                        }
                        if (!str_starts_with($line, 'data:')) {
                            continue;
                        }
                        $jsonPart = trim(substr($line, 5));
                        if ($jsonPart === '' || $jsonPart === '[DONE]') {
                            continue;
                        }

                        $parsed = json_decode($jsonPart, true);
                        if (!is_array($parsed)) {
                            continue;
                        }

                        if (isset($parsed['error']) && is_array($parsed['error'])) {
                            $streamErr = json_encode($parsed['error'], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) ?: 'error';

                            continue;
                        }

                        $choices = $parsed['choices'] ?? [];
                        if (!isset($choices[0]) || !is_array($choices[0])) {
                            continue;
                        }

                        $delta = $choices[0]['delta'] ?? [];
                        if (!is_array($delta)) {
                            continue;
                        }

                        self::forwardStreamDeltaPieces($delta, $modelEmit, $emitContext);

                        if (isset($delta['content']) && is_string($delta['content']) && $delta['content'] !== '') {
                            $assembled .= $delta['content'];
                        }
                    }

                    return strlen($chunk);
                },
            ]);

            $xfer = curl_exec($ch);
            $cerr = curl_error($ch);
            $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            if ($firstHttp !== null) {
                $code = $firstHttp;
            }
            curl_close($ch);

            if ($xfer === false) {
                $lastFailureTail = self::collapseWhitespace($cerr);
                self::$lastOpenAiChatFailure = 'stream curl_error: ' . $lastFailureTail;
                sleep(min(3, 1 + $attempt));

                continue;
            }

            if ($streamErr !== '') {
                $lastFailureTail = self::collapseWhitespace($streamErr);
                if ($code === 429 && $attempt < $maxAttempts) {
                    sleep(self::sleepBefore429Retry($streamErr));
                    continue;
                }
                self::$lastOpenAiChatFailure = 'OpenAI stream error: ' . $lastFailureTail;

                return null;
            }

            if ($code === 429 && $attempt < $maxAttempts) {
                sleep(self::sleepBefore429Retry($sseRemainder . $assembled));
                continue;
            }

            if ($code !== 200) {
                $tail = self::collapseWhitespace($sseRemainder);
                if ($tail === '') {
                    $tail = self::collapseWhitespace($assembled);
                }
                $lastFailureTail                = substr($tail, 0, 800);
                self::$lastOpenAiChatFailure    = 'stream HTTP ' . $code . ($lastFailureTail !== '' ? ': ' . $lastFailureTail : '');

                return null;
            }

            if ($assembled !== '') {
                self::$lastOpenAiChatFailure = null;

                return $assembled;
            }

            $lastFailureTail = self::collapseWhitespace($sseRemainder);
            if ($lastFailureTail === '') {
                $lastFailureTail = 'empty stream body';
            }
            sleep(1);
        }

        self::$lastOpenAiChatFailure = 'streaming failed: ' . substr($lastFailureTail, 0, 400);

        return null;
    }

    private static function openaiChatBuffered(string $apiKey, string $model, array $messages, int $maxCompletionTokens = 2000, bool $jsonObject = false): ?string
    {
        $response = '';
        $maxAttempts = 5;

        for ($attempt = 1; $attempt <= $maxAttempts; ++$attempt) {
            $body = [
                'model'                 => $model,
                'messages'              => $messages,
                'max_completion_tokens' => $maxCompletionTokens,
            ];
            if ($jsonObject) {
                $body['response_format'] = ['type' => 'json_object'];
            }

            $payload = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

            $ch = curl_init('https://api.openai.com/v1/chat/completions');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => $payload,
                CURLOPT_TIMEOUT        => 300,
                CURLOPT_CONNECTTIMEOUT => 15,
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
                self::$lastOpenAiChatFailure = 'curl_error: ' . self::collapseWhitespace($err);

                return null;
            }

            if ($code === 429 && $attempt < $maxAttempts) {
                sleep(self::sleepBefore429Retry((string)$response));
                continue;
            }

            if ($code !== 200) {
                $preview = self::collapseWhitespace(substr((string)$response, 0, 800));
                self::$lastOpenAiChatFailure = "HTTP {$code}" . ($preview !== '' ? ': ' . $preview : '');

                return null;
            }

            $data = json_decode((string)$response, true);
            if (!is_array($data)) {
                $preview = self::collapseWhitespace(substr((string)$response, 0, 600));
                self::$lastOpenAiChatFailure = 'HTTP 200 but invalid chat JSON envelope — body: ' . $preview;

                return null;
            }

            $content = $data['choices'][0]['message']['content'] ?? null;
            if (is_string($content) && $content !== '') {
                self::$lastOpenAiChatFailure = null;

                return $content;
            }

            $preview = self::collapseWhitespace(substr((string)$response, 0, 600));
            self::$lastOpenAiChatFailure = 'HTTP 200 but empty or missing assistant text — body: ' . $preview;

            return null;
        }

        self::$lastOpenAiChatFailure = 'Retries exhausted for OpenAI chat';

        return null;
    }

    private static function openaiGenerateImage(string $apiKey, string $model, string $prompt, string $uploadDir): ?string
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
            CURLOPT_TIMEOUT        => 120,
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
            error_log("[BlogAiGenerator] Image curl_error: {$err}");
            return null;
        }
        if ($code !== 200) {
            error_log("[BlogAiGenerator] Image HTTP {$code}: " . substr((string)$response, 0, 500));
            return null;
        }

        $data     = json_decode((string)$response, true);
        $imageUrl = $data['data'][0]['url'] ?? null;
        if ($imageUrl === null) {
            error_log('[BlogAiGenerator] Image response missing URL: ' . substr((string)$response, 0, 500));
            return null;
        }

        $ctx = stream_context_create(['http' => ['timeout' => 60]]);
        $imgData = @file_get_contents($imageUrl, false, $ctx);
        if ($imgData === false) {
            error_log("[BlogAiGenerator] Failed to download image from: {$imageUrl}");
            return null;
        }

        $filename = 'cover_ai_' . uniqid('', true) . '.png';
        $fullPath = rtrim($uploadDir, '/\\') . DIRECTORY_SEPARATOR . $filename;
        file_put_contents($fullPath, $imgData);

        // DALL-E images are typically 2-4 MB PNGs; compress to ≤1 MB JPEG
        // for reliable WhatsApp/social link previews.
        $fullPath = \App\Controllers\Admin\BlogController::compressCoverImage($fullPath, 1_048_576);

        return 'blog_uploads/' . basename($fullPath);
    }
}

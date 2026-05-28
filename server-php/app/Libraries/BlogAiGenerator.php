<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Shared AI blog draft generation used by cron (cli/blog_ai_generate.php) and manual API trigger.
 */
final class BlogAiGenerator
{
    /** Set when the last llmChat() call fails; appended to the generator log next to ERROR lines. */
    private static ?string $lastLlmChatFailure = null;

    /** Shared system instructions — topic and article calls both use this. */
    private const SYSTEM_PROMPT = <<<'SYS'
You help draft educational blog content for CA Rahul Gupta's Indian CA firm. Readers are business owners and individual taxpayers who rely on this firm's reputation for accurate, conservative advice.

ACCURACY (non-negotiable):
- Never invent laws, notifications, circular or notification numbers, Gazette references, court orders, scheme names, programme codes, subsidy amounts, eligibility criteria, portal URLs, or effective dates.
- Do not describe anything as "new", "recent", "just announced", or "effective from [date]" unless you are certain — prefer timeless educational topics and explainers.
- Do not state specific rupee limits, percentages, or statutory deadlines unless they are stable and you are highly confident; otherwise use qualitative wording and tell readers to verify current figures on the official portal or with their CA.
- When uncertain, omit the detail or use "may", "typically", "subject to conditions", and "confirm with your chartered accountant".
- These drafts are reviewed by a human CA before publish — omission is better than fabrication.
SYS;

    /** Appended to every category topic user prompt. */
    private const TOPIC_USER_SUFFIX = <<<'SUFFIX'

Pick a topic suitable for a general educational article — not breaking news and not one that requires citing a specific notification number, circular date, or FY-specific budget change you cannot verify.
Return ONLY the topic title — no extra text, no numbering, no quotes.
SUFFIX;

    /** @var array<string, array{label: string, topicPrompt: string, imagePrompt: string}> */
    private const CATEGORY_CONFIG = [
        'laws' => [
            'label'       => 'New Laws & Provisions',
            'topicPrompt' => 'Suggest one blog topic title about a well-established area of Indian income tax, GST, or corporate/compliance law that business owners commonly misunderstand. The article should be a general explainer of concepts and obligations — not a report on a particular new amendment or circular.',
            'imagePrompt' => 'Professional, clean illustration for a CA firm blog about Indian tax law and regulations. Abstract legal/financial imagery, muted blues and oranges, courthouse columns, legal documents, no text, modern flat style.',
        ],
        'tax_saving' => [
            'label'       => 'Tax Saving & Tax Planning',
            'topicPrompt' => 'Suggest one blog topic title about a widely recognised tax-saving or tax-planning concept under Indian law (deductions, exemptions, structure, or record-keeping) that many taxpayers overlook. Focus on principles and planning discipline — not guaranteed savings, product pitches, or FY-specific limits that may change.',
            'imagePrompt' => 'Professional, clean illustration for a CA firm blog about tax planning and savings. Abstract financial imagery — coins, piggy bank, growing plant, calculator, muted greens and oranges, no text, modern flat style.',
        ],
        'ai_promotions' => [
            'label'       => 'AI Promotions',
            'topicPrompt' => 'Suggest one blog topic title about practical, responsible use of AI tools by Indian businesses or professionals (productivity, documentation, compliance support) — general guidance only, not endorsements of specific vendors or unverified government AI programmes.',
            'imagePrompt' => 'Professional, clean illustration for a CA firm blog about AI adoption in Indian business. Abstract tech imagery — neural network nodes, digital gears, glowing circuits, muted purples and greys, no text, modern flat style.',
        ],
        'subsidies_promotions' => [
            'label'       => 'Subsidies Promotions',
            'topicPrompt' => 'Suggest one blog topic title explaining how Indian MSMEs or startups should approach discovering and evaluating government subsidies or incentives — eligibility mindset, documentation, and compliance — without naming a specific scheme unless it is long-established and widely known (e.g. general MSME registration benefits).',
            'imagePrompt' => 'Professional, clean illustration for a CA firm blog about government subsidies and grants in India. Abstract imagery — government building, handshake, growth chart, Indian rupee coins, muted greens and blues, no text, modern flat style.',
        ],
        'funding_promotions' => [
            'label'       => 'Funding Promotions',
            'topicPrompt' => 'Suggest one blog topic title about fundraising readiness for Indian startups and SMEs — types of capital, governance, and financial hygiene — as educational guidance, not promises of funding or references to specific investor names, ticket sizes, or schemes you cannot verify.',
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
     *   model_emit?: ?callable(string $context, string $phase, string $chunk):void,
     *   text_provider?: ?string,
     *   image_provider?: ?string,
     *   require_prior_approvals?: bool
     * } $cfg
     * @return array{total_generated: int, log: string[], error?: string, skipped?: bool, skip_reason?: string}
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
        $requireApprovals = (bool)($cfg['require_prior_approvals'] ?? false);

        $log = [];
        $add = static function (string $line) use (&$log, $streamCb): void {
            $log[] = $line;
            if (\is_callable($streamCb)) {
                ($streamCb)($line);
            }
        };

        if ($requireApprovals && !$dryRun) {
            $block = self::pendingPriorDayApprovalBlock($pdo);
            if ($block !== null) {
                $add('[blog-ai] Skipped — prior-day AI approvals still pending for blog posting.');
                $add('[blog-ai]   Pending count: ' . $block['count']);
                $add('[blog-ai]   Oldest pending: ' . $block['oldest_created_at']);
                $add('[blog-ai]   Resolve pending drafts in Blog AI Approvals before the next cron run.');

                return [
                    'total_generated' => 0,
                    'log'             => $log,
                    'skipped'         => true,
                    'skip_reason'     => 'pending_prior_approvals',
                ];
            }
        }

        $settings = BlogAiSettings::get($pdo);
        $textProvider  = BlogAiSettings::normalizeTextProvider((string)($cfg['text_provider'] ?? $settings['text_provider']));
        $imageProvider = BlogAiSettings::normalizeImageProvider((string)($cfg['image_provider'] ?? $settings['image_provider']));

        $openAiKey    = (string)(getenv('OPENAI_API_KEY') ?: '');
        $geminiKey    = (string)(getenv('GEMINI_API_KEY') ?: '');
        $textModel    = (string)(getenv('OPENAI_MODEL') ?: 'gpt-5.1');
        $geminiModel  = (string)(getenv('GEMINI_BLOG_MODEL') ?: 'gemini-2.5-flash');
        $imageModel   = (string)(getenv('OPENAI_IMAGE_MODEL') ?: 'dall-e-3');
        /** Minimum seconds between each LLM API call (set to ~21 on low-RPM tiers; 0 disables). */
        $minInterval = max(0.0, (float)(getenv('OPENAI_MIN_REQUEST_INTERVAL_SEC') ?: '0'));
        /** Max completion tokens for the long JSON article response. */
        $draftMaxTok = max(4096, min(32768, (int)(getenv('OPENAI_DRAFT_MAX_COMPLETION_TOKENS') ?: '8192')));
        /** After last LLM completion (Unix seconds.micro); null = skip spacing before first call. */
        $afterLastAi = null;

        $textModelLabel = $textProvider === 'gemini' ? $geminiModel : $textModel;
        $imageModelLabel = $imageProvider === 'dalle' ? $imageModel : $imageProvider;
        $add('[blog-ai] Text: ' . $textProvider . ' (' . $textModelLabel . ') | Images: ' . $imageProvider . ' (' . $imageModelLabel . ')');

        if ($textProvider === 'openai' && $openAiKey === '') {
            return ['total_generated' => 0, 'log' => $log, 'error' => 'OPENAI_API_KEY is not set in .env (required for OpenAI text generation)'];
        }
        if ($textProvider === 'gemini' && $geminiKey === '') {
            return ['total_generated' => 0, 'log' => $log, 'error' => 'GEMINI_API_KEY is not set in .env (required for Gemini text generation)'];
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

                self::ensureAiSpacing($afterLastAi, $minInterval, $add);
                $topic = self::llmChat(
                    $textProvider,
                    $openAiKey,
                    $textModel,
                    $geminiKey,
                    $geminiModel,
                    [
                        ['role' => 'system', 'content' => self::SYSTEM_PROMPT],
                        ['role' => 'user', 'content' => $config['topicPrompt'] . self::TOPIC_USER_SUFFIX],
                    ],
                    320,
                    false,
                    $modelEmit,
                    'topic',
                );
                $afterLastAi = microtime(true);

                if ($topic === null) {
                    $add("[blog-ai] ERROR: Failed to generate topic for {$category} option {$optIdx}");
                    if (self::$lastLlmChatFailure !== null && self::$lastLlmChatFailure !== '') {
                        $add('[blog-ai]   → ' . self::$lastLlmChatFailure);
                    }
                    continue;
                }
                $topic = trim(strip_tags($topic));
                $add("[blog-ai]   Topic: {$topic}");

                $blogPrompt = self::buildArticlePrompt($topic, $catLabel);

                self::ensureAiSpacing($afterLastAi, $minInterval, $add);
                $draftJson = self::llmChat(
                    $textProvider,
                    $openAiKey,
                    $textModel,
                    $geminiKey,
                    $geminiModel,
                    [
                        ['role' => 'system', 'content' => self::SYSTEM_PROMPT],
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
                    if (self::$lastLlmChatFailure !== null && self::$lastLlmChatFailure !== '') {
                        $add('[blog-ai]   → ' . self::$lastLlmChatFailure);
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
                $draftContent = self::ensureDisclaimer(
                    self::normalizeContent(trim((string)$draft['content'])),
                );

                $add("[blog-ai]   Title: {$draftTitle}");

                $coverPath = null;
                if (!$dryRun && $imageProvider === 'dalle') {
                    $imagePromptFull = "Professional blog cover image for a CA firm website article titled \"{$draftTitle}\". "
                        . $config['imagePrompt']
                        . ' Wide landscape format, visually striking, suitable as a hero banner.';
                    if ($openAiKey === '') {
                        $add('[blog-ai]   Cover image skipped — OPENAI_API_KEY not set for DALL-E');
                    } else {
                        self::ensureAiSpacing($afterLastAi, $minInterval, $add);
                        $coverPath = self::openaiGenerateImage($openAiKey, $imageModel, $imagePromptFull, $blogUploadDir);
                        $afterLastAi = microtime(true);
                        if ($coverPath === null) {
                            $add('[blog-ai]   Cover image generation failed — proceeding without cover.');
                        } else {
                            $add("[blog-ai]   Cover image saved: {$coverPath}");
                        }
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
                            (topic, category, option_index, title, excerpt, content, cover_image_path, status, text_provider, image_provider)
                        VALUES
                            (:topic, :cat, :opt, :title, :excerpt, :content, :cover, :status, :text_provider, :image_provider)
                    ');
                    $stmt->execute([
                        ':topic'          => $topic,
                        ':cat'            => $category,
                        ':opt'            => $optIdx,
                        ':title'          => $draftTitle,
                        ':excerpt'        => $draftExcerpt,
                        ':content'        => $draftContent,
                        ':cover'          => $coverPath ?? '',
                        ':status'         => 'pending',
                        ':text_provider'  => $textProvider,
                        ':image_provider' => $imageProvider,
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

    /**
     * Returns block info when any blog_ai_drafts from before today are still pending.
     * Uses Asia/Kolkata for the calendar-day boundary (matches app timezone).
     *
     * @return ?array{count: int, oldest_created_at: string}
     */
    public static function pendingPriorDayApprovalBlock(\PDO $pdo): ?array
    {
        $tz = new \DateTimeZone('Asia/Kolkata');
        $startOfToday = (new \DateTimeImmutable('today', $tz))->format('Y-m-d H:i:sP');

        $stmt = $pdo->prepare('
            SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest
            FROM blog_ai_drafts
            WHERE status = :status
              AND created_at < :start_of_today
        ');
        $stmt->execute([
            ':status'          => 'pending',
            ':start_of_today'  => $startOfToday,
        ]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!is_array($row)) {
            return null;
        }

        $count = (int)($row['cnt'] ?? 0);
        if ($count <= 0) {
            return null;
        }

        $oldest = $row['oldest'] ?? null;
        if ($oldest instanceof \DateTimeInterface) {
            $oldest = $oldest->format('Y-m-d H:i:s');
        }

        return [
            'count'              => $count,
            'oldest_created_at'  => is_string($oldest) && $oldest !== '' ? $oldest : 'unknown',
        ];
    }

    private static function buildArticlePrompt(string $topic, string $catLabel): string
    {
        return <<<PROMPT
Write a professional educational blog article for CA Rahul Gupta's firm website.

Topic: {$topic}
Category: {$catLabel}

Return ONE valid JSON object with these keys — no prose before or after:
{
  "title": "Clear, SEO-friendly article title (accurate; no sensational claims)",
  "excerpt": "2–3 sentence plain-text summary for listing cards (NO HTML tags here)",
  "content": "Full article body as clean semantic HTML (see rules below)"
}

ACCURACY AND TRUST (mandatory — any violation makes the draft unusable):
- Write as calm, conservative guidance from a senior Indian chartered accountant — not breaking news or legal advice for a specific reader.
- NEVER invent: section/sub-section numbers, Act names, Finance Act claims, CBDT/CBIC/GST notification numbers, circular dates, Gazette references, court cases, scheme or programme names, portal URLs, subsidy or loan amounts, or government deadlines.
- You MAY mention only widely known, stable concepts (e.g. "income tax return filing", "GST registration", "Section 80C" as a category) without stating specific rupee caps or dates unless you are highly confident they are still current.
- Do NOT claim any rule is "new", "recent", or tied to FY 2025-26 / 2026 unless you are certain; prefer timeless explainers.
- Use hedged language ("may", "typically", "subject to conditions") for anything that varies by facts or by notification.
- Where numbers or deadlines matter, tell readers to verify the current figure on the official government portal (Income Tax, GST, MCA, RBI, SEBI, or relevant ministry) or with their chartered accountant — do not guess.
- Do not recommend specific financial products, lenders, or AI tools by brand unless essential; focus on process and principles.
- Practical examples must be clearly hypothetical ("For example, a manufacturing MSME might…") — not presented as real client outcomes.

Content HTML rules (strict):
- Start with an introductory <p> — do NOT start with a heading
- Use <h2> for 3–5 main section headings
- Use <p> for body text; <strong> for emphasis; <em> sparingly
- Use <ul><li> and <ol><li> where helpful
- Do NOT include <html>, <head>, <body>, <h1>, <style>, or <script>
- Do NOT use markdown — only HTML tags; all tags properly closed

Writing style:
- Clear, simple English for business owners and individual taxpayers
- 600–900 words
- End with an <h2>Important disclaimer</h2> section: a <p> stating this is general information only, not personalised professional advice, rules and figures change, and readers must confirm current law and their facts with a qualified chartered accountant before acting

PROMPT;
    }

    /**
     * Ensures every published-bound draft carries a disclaimer even if the model omitted it.
     */
    private static function ensureDisclaimer(string $html): string
    {
        $html = trim($html);
        if ($html === '') {
            return $html;
        }

        if (preg_match('/important\s+disclaimer|general\s+information\s+only|not\s+(?:personal(?:ised|ized)?\s+)?professional\s+advice/i', $html)) {
            return $html;
        }

        return $html . "\n<h2>Important disclaimer</h2>\n"
            . '<p>This article is general information only and does not constitute personalised professional advice. '
            . 'Tax laws, government schemes, rates, and deadlines change frequently. '
            . 'Please confirm the current position and how it applies to your situation with a qualified chartered accountant before acting.</p>';
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
    private static function ensureAiSpacing(?float &$afterLast, float $minIntervalSec, callable $logLine): void
    {
        if ($minIntervalSec <= 0.0 || $afterLast === null) {
            return;
        }

        $elapsed = microtime(true) - $afterLast;
        if ($elapsed < $minIntervalSec) {
            $wait = $minIntervalSec - $elapsed;
            $logLine(sprintf('[blog-ai]   Waiting %.0fs before next LLM call', $wait));
            usleep(max(1000, (int)floor($wait * 1e6)));
        }
    }

    /**
     * @param array<int, array{role: string, content: string}> $messages
     * @param ?callable(string $context, string $phase, string $chunk):void $modelEmit
     */
    private static function llmChat(
        string $textProvider,
        string $openAiKey,
        string $openAiModel,
        string $geminiKey,
        string $geminiModel,
        array $messages,
        int $maxCompletionTokens = 2000,
        bool $jsonObject = false,
        ?callable $modelEmit = null,
        string $emitContext = 'chat',
    ): ?string {
        if ($textProvider === 'gemini') {
            return self::geminiChat($geminiKey, $geminiModel, $messages, $maxCompletionTokens, $jsonObject, $modelEmit, $emitContext);
        }

        return self::openaiChat($openAiKey, $openAiModel, $messages, $maxCompletionTokens, $jsonObject, $modelEmit, $emitContext);
    }

    /**
     * @param array<int, array{role: string, content: string}> $messages
     * @param ?callable(string $context, string $phase, string $chunk):void $modelEmit
     */
    private static function geminiChat(
        string $apiKey,
        string $model,
        array $messages,
        int $maxOutputTokens,
        bool $jsonObject,
        ?callable $modelEmit,
        string $emitContext,
    ): ?string {
        self::$lastLlmChatFailure = null;

        $systemInstruction = '';
        $contents = [];

        foreach ($messages as $msg) {
            $role = (string)($msg['role'] ?? '');
            $content = (string)($msg['content'] ?? '');
            if ($content === '') {
                continue;
            }
            if ($role === 'system') {
                $systemInstruction .= ($systemInstruction !== '' ? "\n\n" : '') . $content;
                continue;
            }
            $geminiRole = $role === 'assistant' ? 'model' : 'user';
            $contents[] = [
                'role'  => $geminiRole,
                'parts' => [['text' => $content]],
            ];
        }

        if ($contents === []) {
            self::$lastLlmChatFailure = 'No user/assistant messages for Gemini';

            return null;
        }

        $modelPath = rawurlencode($model);
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . $modelPath . ':generateContent?key=' . rawurlencode($apiKey);

        $generationConfig = [
            'maxOutputTokens' => $maxOutputTokens,
            'temperature'     => $jsonObject ? 0.25 : 0.35,
        ];
        if ($jsonObject) {
            $generationConfig['responseMimeType'] = 'application/json';
        }

        $body = [
            'contents'         => $contents,
            'generationConfig' => $generationConfig,
        ];
        if ($systemInstruction !== '') {
            $body['systemInstruction'] = [
                'parts' => [['text' => $systemInstruction]],
            ];
        }

        $timeout = $jsonObject ? 300 : 120;
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_UNICODE),
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        ]);

        $response = curl_exec($ch);
        $err      = curl_error($ch);
        $code     = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($err !== '') {
            self::$lastLlmChatFailure = 'Gemini curl_error: ' . self::collapseWhitespace($err);

            return null;
        }

        if ($code !== 200) {
            $preview = self::collapseWhitespace(substr((string)$response, 0, 800));
            self::$lastLlmChatFailure = "Gemini HTTP {$code}" . ($preview !== '' ? ': ' . $preview : '');

            return null;
        }

        $data = json_decode((string)$response, true);
        if (!is_array($data)) {
            self::$lastLlmChatFailure = 'Gemini HTTP 200 but invalid JSON envelope';

            return null;
        }

        $parts = $data['candidates'][0]['content']['parts'] ?? [];
        if (!is_array($parts)) {
            self::$lastLlmChatFailure = 'Gemini response missing content parts';

            return null;
        }

        $text = '';
        foreach ($parts as $part) {
            if (is_array($part) && isset($part['text']) && is_string($part['text'])) {
                $text .= $part['text'];
            }
        }

        $text = trim($text);
        if ($text === '') {
            self::$lastLlmChatFailure = 'Gemini returned empty text';

            return null;
        }

        if ($modelEmit !== null) {
            $modelEmit($emitContext, 'assistant', $text);
        }

        return $text;
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
        self::$lastLlmChatFailure = null;

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
                'temperature'           => $jsonObject ? 0.25 : 0.35,
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
                self::$lastLlmChatFailure = 'stream curl_error: ' . $lastFailureTail;
                sleep(min(3, 1 + $attempt));

                continue;
            }

            if ($streamErr !== '') {
                $lastFailureTail = self::collapseWhitespace($streamErr);
                if ($code === 429 && $attempt < $maxAttempts) {
                    sleep(self::sleepBefore429Retry($streamErr));
                    continue;
                }
                self::$lastLlmChatFailure = 'OpenAI stream error: ' . $lastFailureTail;

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
                self::$lastLlmChatFailure    = 'stream HTTP ' . $code . ($lastFailureTail !== '' ? ': ' . $lastFailureTail : '');

                return null;
            }

            if ($assembled !== '') {
                self::$lastLlmChatFailure = null;

                return $assembled;
            }

            $lastFailureTail = self::collapseWhitespace($sseRemainder);
            if ($lastFailureTail === '') {
                $lastFailureTail = 'empty stream body';
            }
            sleep(1);
        }

        self::$lastLlmChatFailure = 'streaming failed: ' . substr($lastFailureTail, 0, 400);

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
                'temperature'           => $jsonObject ? 0.25 : 0.35,
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
                self::$lastLlmChatFailure = 'curl_error: ' . self::collapseWhitespace($err);

                return null;
            }

            if ($code === 429 && $attempt < $maxAttempts) {
                sleep(self::sleepBefore429Retry((string)$response));
                continue;
            }

            if ($code !== 200) {
                $preview = self::collapseWhitespace(substr((string)$response, 0, 800));
                self::$lastLlmChatFailure = "HTTP {$code}" . ($preview !== '' ? ': ' . $preview : '');

                return null;
            }

            $data = json_decode((string)$response, true);
            if (!is_array($data)) {
                $preview = self::collapseWhitespace(substr((string)$response, 0, 600));
                self::$lastLlmChatFailure = 'HTTP 200 but invalid chat JSON envelope — body: ' . $preview;

                return null;
            }

            $content = $data['choices'][0]['message']['content'] ?? null;
            if (is_string($content) && $content !== '') {
                self::$lastLlmChatFailure = null;

                return $content;
            }

            $preview = self::collapseWhitespace(substr((string)$response, 0, 600));
            self::$lastLlmChatFailure = 'HTTP 200 but empty or missing assistant text — body: ' . $preview;

            return null;
        }

        self::$lastLlmChatFailure = 'Retries exhausted for OpenAI chat';

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

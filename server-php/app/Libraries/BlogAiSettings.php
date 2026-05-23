<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Persisted blog AI text/image provider selection (Blog Management UI + cron).
 */
final class BlogAiSettings
{
    /** @var list<string> */
    public const TEXT_PROVIDERS = ['openai', 'gemini'];

    /** @var list<string> */
    public const IMAGE_PROVIDERS = ['dalle'];

    private const DEFAULT_TEXT  = 'openai';
    private const DEFAULT_IMAGE = 'dalle';

    /**
     * @return array{text_provider: string, image_provider: string}
     */
    public static function get(\PDO $pdo): array
    {
        try {
            $row = $pdo->query(
                'SELECT text_provider, image_provider FROM blog_ai_settings ORDER BY id ASC LIMIT 1'
            )->fetch(\PDO::FETCH_ASSOC);

            if (is_array($row)) {
                return [
                    'text_provider'  => self::normalizeTextProvider((string)($row['text_provider'] ?? '')),
                    'image_provider' => self::normalizeImageProvider((string)($row['image_provider'] ?? '')),
                ];
            }
        } catch (\Throwable) {
            // Table may not exist before migration — fall through to env defaults.
        }

        return [
            'text_provider'  => self::normalizeTextProvider((string)(getenv('BLOG_AI_TEXT_PROVIDER') ?: self::DEFAULT_TEXT)),
            'image_provider' => self::normalizeImageProvider((string)(getenv('BLOG_AI_IMAGE_PROVIDER') ?: self::DEFAULT_IMAGE)),
        ];
    }

    /**
     * @return array{
     *   text_provider: string,
     *   image_provider: string,
     *   available: array{
     *     text: list<array{id: string, label: string, configured: bool}>,
     *     image: list<array{id: string, label: string, configured: bool}>
     *   }
     * }
     */
    public static function getWithAvailability(\PDO $pdo): array
    {
        $settings = self::get($pdo);

        return array_merge($settings, ['available' => self::availableProviders()]);
    }

    /**
     * @return array{
     *   text: list<array{id: string, label: string, configured: bool}>,
     *   image: list<array{id: string, label: string, configured: bool}>
     * }
     */
    public static function availableProviders(): array
    {
        $openAiKey  = (string)(getenv('OPENAI_API_KEY') ?: '');
        $geminiKey  = (string)(getenv('GEMINI_API_KEY') ?: '');

        return [
            'text' => [
                ['id' => 'openai', 'label' => 'OpenAI', 'configured' => $openAiKey !== ''],
                ['id' => 'gemini', 'label' => 'Gemini', 'configured' => $geminiKey !== ''],
            ],
            'image' => [
                ['id' => 'dalle', 'label' => 'OpenAI DALL-E', 'configured' => $openAiKey !== ''],
            ],
        ];
    }

    public static function update(\PDO $pdo, string $textProvider, string $imageProvider, ?int $userId = null): array
    {
        $textProvider  = self::normalizeTextProvider($textProvider);
        $imageProvider = self::normalizeImageProvider($imageProvider);

        if (!in_array($textProvider, self::TEXT_PROVIDERS, true)) {
            throw new \InvalidArgumentException('text_provider must be openai or gemini.');
        }
        if (!in_array($imageProvider, self::IMAGE_PROVIDERS, true)) {
            throw new \InvalidArgumentException('image_provider must be dalle.');
        }

        $existing = $pdo->query('SELECT id FROM blog_ai_settings ORDER BY id ASC LIMIT 1')->fetch(\PDO::FETCH_ASSOC);

        if (is_array($existing) && isset($existing['id'])) {
            $stmt = $pdo->prepare('
                UPDATE blog_ai_settings
                SET text_provider = :text, image_provider = :image, updated_by = :uid, updated_at = NOW()
                WHERE id = :id
            ');
            $stmt->execute([
                ':text'  => $textProvider,
                ':image' => $imageProvider,
                ':uid'   => $userId,
                ':id'    => (int)$existing['id'],
            ]);
        } else {
            $stmt = $pdo->prepare('
                INSERT INTO blog_ai_settings (text_provider, image_provider, updated_by, updated_at)
                VALUES (:text, :image, :uid, NOW())
            ');
            $stmt->execute([
                ':text'  => $textProvider,
                ':image' => $imageProvider,
                ':uid'   => $userId,
            ]);
        }

        return self::getWithAvailability($pdo);
    }

    public static function normalizeTextProvider(string $value): string
    {
        $value = strtolower(trim($value));

        return in_array($value, self::TEXT_PROVIDERS, true) ? $value : self::DEFAULT_TEXT;
    }

    public static function normalizeImageProvider(string $value): string
    {
        $value = strtolower(trim($value));

        return in_array($value, self::IMAGE_PROVIDERS, true) ? $value : self::DEFAULT_IMAGE;
    }

    public static function textProviderLabel(string $provider): string
    {
        return match ($provider) {
            'gemini' => 'Gemini',
            default  => 'OpenAI',
        };
    }

    public static function imageProviderLabel(string $provider): string
    {
        return match ($provider) {
            'dalle' => 'OpenAI DALL-E',
            default => 'OpenAI DALL-E',
        };
    }
}

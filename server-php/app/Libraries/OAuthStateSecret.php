<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * OAuth HMAC state secrets — refuse weak defaults in production.
 */
class OAuthStateSecret
{
    private const WEAK = ['change-me-cal-state', 'change-me-zoom-state', ''];

    public static function calendar(): string
    {
        return self::resolve('CALENDAR_STATE_SECRET', 'change-me-cal-state');
    }

    public static function zoom(): string
    {
        return self::resolve('ZOOM_STATE_SECRET', 'change-me-zoom-state');
    }

    private static function resolve(string $envKey, string $fallback): string
    {
        $val = trim((string)(getenv($envKey) ?: $fallback));
        $env = strtolower((string)(getenv('APP_ENV') ?: 'development'));
        if (in_array($env, ['production', 'prod'], true) && in_array($val, self::WEAK, true)) {
            throw new \RuntimeException("{$envKey} must be set to a strong secret in production.");
        }
        return $val !== '' ? $val : $fallback;
    }
}

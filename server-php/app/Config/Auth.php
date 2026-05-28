<?php
declare(strict_types=1);

namespace App\Config;

/**
 * Authentication configuration.
 *
 * SUPER_ADMIN_EMAIL is hardcoded — this user always receives the
 * super_admin role at login regardless of the database value.
 */
class Auth
{
    /** Default super-admin e-mail — override via SUPER_ADMIN_EMAIL in .env (comma-separated). */
    public const SUPER_ADMIN_EMAIL = 'rahul@cagupta.in';

    public static function superAdminEmails(): array
    {
        $raw = getenv('SUPER_ADMIN_EMAIL') ?: self::SUPER_ADMIN_EMAIL;
        return array_values(array_filter(array_map(
            static fn (string $e) => strtolower(trim($e)),
            explode(',', (string)$raw),
        )));
    }

    public static function isSuperAdminEmail(string $email): bool
    {
        return in_array(strtolower(trim($email)), self::superAdminEmails(), true);
    }

    /** HS256 JWT signing secret — MUST be overridden in .env (JWT_SECRET). */
    public const JWT_SECRET = '';

    /** Access-token lifetime in hours. */
    public const TOKEN_TTL_HOURS = 8;

    /** Refresh-token lifetime in days. */
    public const REFRESH_TTL_DAYS = 30;

    /** Supported SSO providers. */
    public const SSO_PROVIDERS = ['google', 'microsoft'];

    /**
     * Return the effective JWT secret (env takes precedence over the constant).
     */
    public static function jwtSecret(): string
    {
        $secret = getenv('JWT_SECRET') ?: self::JWT_SECRET;
        if ($secret === '') {
            throw new \RuntimeException('JWT_SECRET is not configured. Set it in .env.');
        }
        return $secret;
    }
}

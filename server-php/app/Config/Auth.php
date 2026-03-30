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
    /** Hardcoded super-admin e-mail address. */
    public const SUPER_ADMIN_EMAIL = 'rahul@cagupta.in';

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

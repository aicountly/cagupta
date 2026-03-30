<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Thin bcrypt wrapper.
 *
 * Uses PHP's built-in password_hash() / password_verify() with cost factor 12.
 */
class PasswordHasher
{
    private const COST = 12;

    /**
     * Hash a plain-text password.
     */
    public static function hash(string $plainText): string
    {
        $hash = password_hash($plainText, PASSWORD_BCRYPT, ['cost' => self::COST]);
        if ($hash === false) {
            throw new \RuntimeException('Password hashing failed.');
        }
        return $hash;
    }

    /**
     * Verify a plain-text password against a stored hash.
     */
    public static function verify(string $plainText, string $hash): bool
    {
        return password_verify($plainText, $hash);
    }

    /**
     * Return true when the stored hash needs to be re-hashed
     * (e.g. cost factor was raised).
     */
    public static function needsRehash(string $hash): bool
    {
        return password_needs_rehash($hash, PASSWORD_BCRYPT, ['cost' => self::COST]);
    }
}

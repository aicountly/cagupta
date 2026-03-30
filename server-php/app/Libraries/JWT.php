<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Lightweight HS256 JWT implementation.
 *
 * No Composer dependency — works on standard PHP 8.1+ shared hosting.
 * Supports encode, decode, and validation only (no RS256 / asymmetric keys).
 */
class JWT
{
    private const ALGORITHM = 'HS256';

    /**
     * Encode a payload into a signed JWT string.
     *
     * @param array<string, mixed> $payload
     */
    public static function encode(array $payload, string $secret): string
    {
        $header  = self::base64UrlEncode(json_encode(['typ' => 'JWT', 'alg' => self::ALGORITHM], JSON_THROW_ON_ERROR));
        $body    = self::base64UrlEncode(json_encode($payload, JSON_THROW_ON_ERROR));
        $sig     = self::sign("{$header}.{$body}", $secret);
        return "{$header}.{$body}.{$sig}";
    }

    /**
     * Decode and verify a JWT string.
     *
     * @return array<string, mixed> The verified payload.
     * @throws \RuntimeException on invalid signature or expired token.
     */
    public static function decode(string $token, string $secret): array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw new \RuntimeException('Invalid JWT structure.');
        }

        [$header64, $body64, $sig64] = $parts;

        // Verify signature
        $expectedSig = self::sign("{$header64}.{$body64}", $secret);
        if (!hash_equals($expectedSig, $sig64)) {
            throw new \RuntimeException('JWT signature verification failed.');
        }

        $payload = json_decode(self::base64UrlDecode($body64), true, 512, JSON_THROW_ON_ERROR);

        // Check expiry
        if (isset($payload['exp']) && $payload['exp'] < time()) {
            throw new \RuntimeException('JWT has expired.');
        }

        return $payload;
    }

    /**
     * Return true when a token is valid and not expired; false otherwise.
     */
    public static function isValid(string $token, string $secret): bool
    {
        try {
            self::decode($token, $secret);
            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private static function sign(string $data, string $secret): string
    {
        return self::base64UrlEncode(hash_hmac('sha256', $data, $secret, true));
    }

    private static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $data): string
    {
        $padded = str_pad(strtr($data, '-_', '+/'), (int)(ceil(strlen($data) / 4) * 4), '=');
        $decoded = base64_decode($padded, true);
        if ($decoded === false) {
            throw new \RuntimeException('Invalid base64url encoding.');
        }
        return $decoded;
    }
}

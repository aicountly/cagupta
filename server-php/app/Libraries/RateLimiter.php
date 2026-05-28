<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Simple file-based rate limiter for auth and public endpoints.
 */
class RateLimiter
{
    private static function bucketPath(string $key): string
    {
        $dir = sys_get_temp_dir() . '/cagupta_rate';
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        return $dir . '/' . hash('sha256', $key) . '.json';
    }

    /**
     * @return bool true if allowed, false if rate limited
     */
    public static function attempt(string $key, int $maxAttempts, int $windowSeconds): bool
    {
        $path = self::bucketPath($key);
        $now  = time();
        $data = ['count' => 0, 'reset' => $now + $windowSeconds];
        if (is_readable($path)) {
            try {
                /** @var array{count: int, reset: int} $decoded */
                $decoded = json_decode((string)file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
                $data    = $decoded;
            } catch (\Throwable) {
                $data = ['count' => 0, 'reset' => $now + $windowSeconds];
            }
        }
        if ($now > ($data['reset'] ?? 0)) {
            $data = ['count' => 0, 'reset' => $now + $windowSeconds];
        }
        if (($data['count'] ?? 0) >= $maxAttempts) {
            return false;
        }
        $data['count'] = ($data['count'] ?? 0) + 1;
        file_put_contents($path, json_encode($data));
        return true;
    }

    public static function clientKey(string $suffix): string
    {
        $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $ip = trim(explode(',', (string)$ip)[0]);
        return $ip . ':' . $suffix;
    }
}

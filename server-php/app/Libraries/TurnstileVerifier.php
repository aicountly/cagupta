<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Cloudflare Turnstile verification for public forms.
 * When TURNSTILE_SECRET_KEY is unset, verification is skipped (local dev).
 */
class TurnstileVerifier
{
    public static function isConfigured(): bool
    {
        $secret = trim((string)(getenv('TURNSTILE_SECRET_KEY') ?: $_ENV['TURNSTILE_SECRET_KEY'] ?? ''));
        return $secret !== '';
    }

    public static function verify(?string $token): bool
    {
        $secret = trim((string)(getenv('TURNSTILE_SECRET_KEY') ?: $_ENV['TURNSTILE_SECRET_KEY'] ?? ''));
        if ($secret === '') {
            return true;
        }
        $token = trim((string)($token ?? ''));
        if ($token === '') {
            return false;
        }

        $ip = (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '');
        if (str_contains($ip, ',')) {
            $ip = trim(explode(',', $ip)[0]);
        }

        $payload = http_build_query([
            'secret'   => $secret,
            'response' => $token,
            'remoteip' => $ip,
        ]);

        $ctx = stream_context_create([
            'http' => [
                'method'  => 'POST',
                'header'  => "Content-Type: application/x-www-form-urlencoded\r\n",
                'content' => $payload,
                'timeout' => 8,
            ],
        ]);

        $raw = @file_get_contents('https://challenges.cloudflare.com/turnstile/v0/siteverify', false, $ctx);
        if ($raw === false) {
            return false;
        }

        try {
            /** @var array{success?: bool} $json */
            $json = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            return !empty($json['success']);
        } catch (\Throwable) {
            return false;
        }
    }
}

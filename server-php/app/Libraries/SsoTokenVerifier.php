<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Verifies SSO tokens with the identity provider before trusting email claims.
 */
class SsoTokenVerifier
{
    /**
     * @return array{sub: string, email: string}|null
     */
    public static function verify(string $provider, string $token): ?array
    {
        $provider = strtolower(trim($provider));
        if ($provider === 'google') {
            return self::verifyGoogle($token);
        }
        if ($provider === 'microsoft') {
            return self::verifyMicrosoft($token);
        }
        return null;
    }

    /** @return array{sub: string, email: string}|null */
    private static function verifyGoogle(string $idToken): ?array
    {
        $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($idToken);
        $payload = self::fetchJson($url);
        if ($payload === null) {
            return null;
        }
        if (empty($payload['sub']) || empty($payload['email'])) {
            return null;
        }
        if (isset($payload['email_verified']) && $payload['email_verified'] !== 'true' && $payload['email_verified'] !== true) {
            return null;
        }
        $clientId = trim((string)(getenv('GOOGLE_CLIENT_ID') ?: ''));
        if ($clientId !== '') {
            $aud = (string)($payload['aud'] ?? '');
            if ($aud !== $clientId) {
                return null;
            }
        }
        return [
            'sub'   => (string)$payload['sub'],
            'email' => strtolower((string)$payload['email']),
        ];
    }

    /** @return array{sub: string, email: string}|null */
    private static function verifyMicrosoft(string $accessToken): ?array
    {
        $ctx = stream_context_create([
            'http' => [
                'method'  => 'GET',
                'header'  => "Authorization: Bearer {$accessToken}\r\nAccept: application/json\r\n",
                'timeout' => 10,
            ],
        ]);
        $raw = @file_get_contents('https://graph.microsoft.com/v1.0/me', false, $ctx);
        if ($raw === false) {
            return null;
        }
        try {
            /** @var array<string, mixed> $payload */
            $payload = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            return null;
        }
        $email = strtolower(trim((string)($payload['mail'] ?? $payload['userPrincipalName'] ?? '')));
        $sub   = (string)($payload['id'] ?? '');
        if ($email === '' || $sub === '') {
            return null;
        }
        $msClientId = trim((string)(getenv('MSAL_CLIENT_ID') ?: ''));
        if ($msClientId !== '') {
            $appId = (string)($payload['appId'] ?? '');
            if ($appId !== '' && strcasecmp($appId, $msClientId) !== 0) {
                return null;
            }
        }
        return ['sub' => $sub, 'email' => $email];
    }

    /** @return array<string, mixed>|null */
    private static function fetchJson(string $url): ?array
    {
        $ctx = stream_context_create(['http' => ['timeout' => 10]]);
        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false) {
            return null;
        }
        try {
            /** @var array<string, mixed> $data */
            $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            return $data;
        } catch (\Throwable) {
            return null;
        }
    }
}

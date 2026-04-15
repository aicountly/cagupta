<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Zoom Server-to-User OAuth (authorization code grant).
 */
final class ZoomOAuthClient
{
    public static function isConfigured(): bool
    {
        return trim((string)(getenv('ZOOM_CLIENT_ID') ?: '')) !== ''
            && trim((string)(getenv('ZOOM_CLIENT_SECRET') ?: '')) !== '';
    }

    public static function authorizeUrl(string $state): string
    {
        $clientId = rawurlencode(trim((string)(getenv('ZOOM_CLIENT_ID') ?: '')));
        $redirect  = rawurlencode(self::redirectUri());

        return 'https://zoom.us/oauth/authorize?response_type=code&client_id=' . $clientId
            . '&redirect_uri=' . $redirect . '&state=' . rawurlencode($state);
    }

    public static function redirectUri(): string
    {
        $u = trim((string)(getenv('ZOOM_REDIRECT_URI') ?: ''));
        if ($u !== '') {
            return $u;
        }
        $base = rtrim(trim((string)(getenv('BASE_URL') ?: 'http://localhost:8080')), '/');
        // BASE_URL usually includes the API prefix (e.g. https://host/api); path is /integrations/zoom/callback
        if (str_ends_with($base, '/api')) {
            return $base . '/integrations/zoom/callback';
        }

        return $base . '/api/integrations/zoom/callback';
    }

    /**
     * @return array{access_token: string, refresh_token: string, expires_in: int, scope?: string}
     */
    public static function exchangeCode(string $code): array
    {
        $id     = trim((string)(getenv('ZOOM_CLIENT_ID') ?: ''));
        $secret = trim((string)(getenv('ZOOM_CLIENT_SECRET') ?: ''));
        $auth   = base64_encode($id . ':' . $secret);
        $body   = http_build_query([
            'grant_type'   => 'authorization_code',
            'code'         => $code,
            'redirect_uri' => self::redirectUri(),
        ]);
        $ch = curl_init('https://zoom.us/oauth/token');
        if ($ch === false) {
            throw new \RuntimeException('curl_init failed');
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Basic ' . $auth,
                'Content-Type: application/x-www-form-urlencoded',
            ],
            CURLOPT_TIMEOUT        => 30,
        ]);
        $response = curl_exec($ch);
        $codeHttp = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($response === false || $codeHttp < 200 || $codeHttp >= 300) {
            throw new \RuntimeException('Zoom token exchange failed: ' . (string)$response);
        }
        $dec = json_decode((string)$response, true);
        if (!is_array($dec) || empty($dec['access_token'])) {
            throw new \RuntimeException('Zoom token response invalid.');
        }

        return $dec;
    }

    /**
     * @return array{access_token: string, refresh_token: string, expires_in: int}
     */
    public static function refreshAccess(string $refreshToken): array
    {
        $id     = trim((string)(getenv('ZOOM_CLIENT_ID') ?: ''));
        $secret = trim((string)(getenv('ZOOM_CLIENT_SECRET') ?: ''));
        $auth   = base64_encode($id . ':' . $secret);
        $body   = http_build_query([
            'grant_type'    => 'refresh_token',
            'refresh_token' => $refreshToken,
        ]);
        $ch = curl_init('https://zoom.us/oauth/token');
        if ($ch === false) {
            throw new \RuntimeException('curl_init failed');
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Basic ' . $auth,
                'Content-Type: application/x-www-form-urlencoded',
            ],
            CURLOPT_TIMEOUT        => 30,
        ]);
        $response = curl_exec($ch);
        $codeHttp = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($response === false || $codeHttp < 200 || $codeHttp >= 300) {
            throw new \RuntimeException('Zoom token refresh failed.');
        }
        $dec = json_decode((string)$response, true);
        if (!is_array($dec) || empty($dec['access_token'])) {
            throw new \RuntimeException('Zoom refresh response invalid.');
        }

        return $dec;
    }
}

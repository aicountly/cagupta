<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\CalendarOAuthTokenModel;

/**
 * Google Calendar API v3 client.
 *
 * Scopes required:
 *   https://www.googleapis.com/auth/calendar
 *
 * Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 */
final class GoogleCalendarClient
{
    private const TOKEN_URL    = 'https://oauth2.googleapis.com/token';
    private const API_BASE     = 'https://www.googleapis.com/calendar/v3';
    private const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
    private const AUTH_URL     = 'https://accounts.google.com/o/oauth2/v2/auth';

    public static function isConfigured(): bool
    {
        return trim((string)(getenv('GOOGLE_CLIENT_ID') ?: '')) !== ''
            && trim((string)(getenv('GOOGLE_CLIENT_SECRET') ?: '')) !== '';
    }

    public static function authorizeUrl(string $state): string
    {
        return self::AUTH_URL . '?' . http_build_query([
            'client_id'             => trim((string)(getenv('GOOGLE_CLIENT_ID') ?: '')),
            'redirect_uri'          => self::redirectUri(),
            'response_type'         => 'code',
            'scope'                 => 'https://www.googleapis.com/auth/calendar openid email profile',
            'access_type'           => 'offline',
            'prompt'                => 'consent',
            'state'                 => $state,
        ]);
    }

    public static function redirectUri(): string
    {
        $u = trim((string)(getenv('GOOGLE_REDIRECT_URI') ?: ''));
        if ($u !== '') {
            return $u;
        }
        $base = rtrim(trim((string)(getenv('BASE_URL') ?: 'http://localhost:8080')), '/');
        if (str_ends_with($base, '/api')) {
            return $base . '/integrations/calendar/google/callback';
        }

        return $base . '/api/integrations/calendar/google/callback';
    }

    /**
     * Exchange authorisation code for tokens.
     *
     * @return array{access_token: string, refresh_token: string, expires_in: int, scope?: string}
     */
    public static function exchangeCode(string $code): array
    {
        $body = http_build_query([
            'code'          => $code,
            'client_id'     => trim((string)(getenv('GOOGLE_CLIENT_ID') ?: '')),
            'client_secret' => trim((string)(getenv('GOOGLE_CLIENT_SECRET') ?: '')),
            'redirect_uri'  => self::redirectUri(),
            'grant_type'    => 'authorization_code',
        ]);

        return self::postForm(self::TOKEN_URL, $body);
    }

    /**
     * Refresh an expired access token.
     *
     * @return array{access_token: string, expires_in: int}
     */
    public static function refreshAccessToken(string $refreshToken): array
    {
        $body = http_build_query([
            'refresh_token' => $refreshToken,
            'client_id'     => trim((string)(getenv('GOOGLE_CLIENT_ID') ?: '')),
            'client_secret' => trim((string)(getenv('GOOGLE_CLIENT_SECRET') ?: '')),
            'grant_type'    => 'refresh_token',
        ]);

        return self::postForm(self::TOKEN_URL, $body);
    }

    /**
     * Fetch the Google userinfo (email, name) using an access token.
     *
     * @return array<string, mixed>
     */
    public static function getUserInfo(string $accessToken): array
    {
        return self::apiGet(self::USERINFO_URL, $accessToken);
    }

    /**
     * List the user's calendars.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function listCalendars(string $accessToken): array
    {
        $data = self::apiGet(self::API_BASE . '/users/me/calendarList?minAccessRole=writer', $accessToken);

        return $data['items'] ?? [];
    }

    /**
     * Insert a new event into a calendar.
     *
     * @param  array<string, mixed> $event
     * @return array<string, mixed>
     */
    public static function insertEvent(string $accessToken, string $calendarId, array $event): array
    {
        $url = self::API_BASE . '/calendars/' . rawurlencode($calendarId) . '/events';

        return self::apiPost($url, $accessToken, $event);
    }

    /**
     * Patch (partial update) an existing event.
     *
     * @param  array<string, mixed> $patch
     * @return array<string, mixed>
     */
    public static function patchEvent(string $accessToken, string $calendarId, string $eventId, array $patch): array
    {
        $url = self::API_BASE . '/calendars/' . rawurlencode($calendarId) . '/events/' . rawurlencode($eventId);

        return self::apiPatch($url, $accessToken, $patch);
    }

    /**
     * Delete an event from a calendar.
     */
    public static function deleteEvent(string $accessToken, string $calendarId, string $eventId): void
    {
        $url = self::API_BASE . '/calendars/' . rawurlencode($calendarId) . '/events/' . rawurlencode($eventId);
        self::apiDelete($url, $accessToken);
    }

    /**
     * List events updated since a given sync token or time.
     *
     * @return array{items: array<int, array<string, mixed>>, nextSyncToken?: string}
     */
    public static function listEvents(
        string $accessToken,
        string $calendarId,
        ?string $updatedMin = null
    ): array {
        $params = [
            'singleEvents' => 'true',
            'maxResults'   => '250',
            'orderBy'      => 'updated',
        ];
        if ($updatedMin !== null) {
            $params['updatedMin'] = $updatedMin;
        }
        $url = self::API_BASE . '/calendars/' . rawurlencode($calendarId) . '/events?' . http_build_query($params);

        return self::apiGet($url, $accessToken);
    }

    // ── Internal HTTP helpers ──────────────────────────────────────────────────

    /**
     * @return array<string, mixed>
     */
    private static function postForm(string $url, string $body): array
    {
        $ch = curl_init($url);
        if ($ch === false) {
            throw new \RuntimeException('curl_init failed');
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_TIMEOUT        => 30,
        ]);
        $resp = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($resp === false || $code < 200 || $code >= 300) {
            throw new \RuntimeException('Google token request failed (' . $code . '): ' . (string)$resp);
        }
        $dec = json_decode((string)$resp, true);
        if (!is_array($dec) || empty($dec['access_token'])) {
            throw new \RuntimeException('Google token response invalid.');
        }

        return $dec;
    }

    /**
     * @return array<string, mixed>
     */
    private static function apiGet(string $url, string $accessToken): array
    {
        $ch = curl_init($url);
        if ($ch === false) {
            throw new \RuntimeException('curl_init failed');
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $accessToken],
            CURLOPT_TIMEOUT        => 30,
        ]);
        $resp = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($resp === false || $code < 200 || $code >= 300) {
            throw new \RuntimeException('Google API GET failed (' . $code . ')');
        }

        return (array)(json_decode((string)$resp, true) ?? []);
    }

    /**
     * @param  array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private static function apiPost(string $url, string $accessToken, array $payload): array
    {
        return self::apiJsonRequest('POST', $url, $accessToken, $payload);
    }

    /**
     * @param  array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private static function apiPatch(string $url, string $accessToken, array $payload): array
    {
        return self::apiJsonRequest('PATCH', $url, $accessToken, $payload);
    }

    private static function apiDelete(string $url, string $accessToken): void
    {
        $ch = curl_init($url);
        if ($ch === false) {
            throw new \RuntimeException('curl_init failed');
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => 'DELETE',
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $accessToken],
            CURLOPT_TIMEOUT        => 30,
        ]);
        curl_exec($ch);
        curl_close($ch);
    }

    /**
     * @param  array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private static function apiJsonRequest(string $method, string $url, string $accessToken, array $payload): array
    {
        $json = json_encode($payload, JSON_THROW_ON_ERROR);
        $ch   = curl_init($url);
        if ($ch === false) {
            throw new \RuntimeException('curl_init failed');
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_POSTFIELDS     => $json,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $accessToken,
                'Content-Type: application/json',
            ],
            CURLOPT_TIMEOUT        => 30,
        ]);
        $resp = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($resp === false || $code < 200 || $code >= 300) {
            throw new \RuntimeException('Google API ' . $method . ' failed (' . $code . '): ' . (string)$resp);
        }

        return (array)(json_decode((string)$resp, true) ?? []);
    }

    /**
     * Return a valid access token, refreshing if needed, and persist the new token.
     */
    public static function getValidAccessToken(
        int $userId,
        string $providerEmail,
        CalendarOAuthTokenModel $tokenModel
    ): string {
        $row = $tokenModel->findByUserProviderEmail($userId, 'google', $providerEmail);
        if ($row === null) {
            throw new \RuntimeException('Google calendar not connected.');
        }
        $expiresAt  = strtotime((string)($row['expires_at'] ?? '0'));
        $accessToken = (string)$row['access_token'];

        if ($expiresAt < (time() + 60)) {
            $refreshed  = self::refreshAccessToken((string)$row['refresh_token']);
            $accessToken = (string)$refreshed['access_token'];
            $newExpiry   = date('Y-m-d H:i:s', time() + (int)($refreshed['expires_in'] ?? 3600));
            $tokenModel->updateAccessToken($userId, 'google', $providerEmail, $accessToken, $newExpiry);
        }

        return $accessToken;
    }
}

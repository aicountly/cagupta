<?php
declare(strict_types=1);

namespace App\Libraries;

use App\Models\CalendarOAuthTokenModel;

/**
 * Microsoft Graph calendar client (Outlook / Office 365 / Microsoft 365).
 *
 * Scopes required:
 *   Calendars.ReadWrite offline_access User.Read
 *
 * Env vars: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI
 */
final class OutlookCalendarClient
{
    private const TOKEN_URL    = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    private const AUTH_URL     = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
    private const GRAPH_BASE   = 'https://graph.microsoft.com/v1.0/me';
    private const USERINFO_URL = 'https://graph.microsoft.com/v1.0/me';

    public static function isConfigured(): bool
    {
        return trim((string)(getenv('MICROSOFT_CLIENT_ID') ?: '')) !== ''
            && trim((string)(getenv('MICROSOFT_CLIENT_SECRET') ?: '')) !== '';
    }

    public static function authorizeUrl(string $state): string
    {
        return self::AUTH_URL . '?' . http_build_query([
            'client_id'     => trim((string)(getenv('MICROSOFT_CLIENT_ID') ?: '')),
            'redirect_uri'  => self::redirectUri(),
            'response_type' => 'code',
            'scope'         => 'Calendars.ReadWrite offline_access User.Read',
            'state'         => $state,
        ]);
    }

    public static function redirectUri(): string
    {
        $u = trim((string)(getenv('MICROSOFT_REDIRECT_URI') ?: ''));
        if ($u !== '') {
            return $u;
        }
        $base = rtrim(trim((string)(getenv('BASE_URL') ?: 'http://localhost:8080')), '/');
        if (str_ends_with($base, '/api')) {
            return $base . '/integrations/calendar/outlook/callback';
        }

        return $base . '/api/integrations/calendar/outlook/callback';
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
            'client_id'     => trim((string)(getenv('MICROSOFT_CLIENT_ID') ?: '')),
            'client_secret' => trim((string)(getenv('MICROSOFT_CLIENT_SECRET') ?: '')),
            'redirect_uri'  => self::redirectUri(),
            'grant_type'    => 'authorization_code',
            'scope'         => 'Calendars.ReadWrite offline_access User.Read',
        ]);

        return self::postForm(self::TOKEN_URL, $body);
    }

    /**
     * Refresh an expired access token.
     *
     * @return array{access_token: string, refresh_token: string, expires_in: int}
     */
    public static function refreshAccessToken(string $refreshToken): array
    {
        $body = http_build_query([
            'refresh_token' => $refreshToken,
            'client_id'     => trim((string)(getenv('MICROSOFT_CLIENT_ID') ?: '')),
            'client_secret' => trim((string)(getenv('MICROSOFT_CLIENT_SECRET') ?: '')),
            'grant_type'    => 'refresh_token',
            'scope'         => 'Calendars.ReadWrite offline_access User.Read',
        ]);

        return self::postForm(self::TOKEN_URL, $body);
    }

    /**
     * Fetch the Microsoft Graph user profile (email, displayName).
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
        $data = self::apiGet(self::GRAPH_BASE . '/calendars?$top=50', $accessToken);

        return $data['value'] ?? [];
    }

    /**
     * Insert a new event into a calendar.
     *
     * @param  array<string, mixed> $event
     * @return array<string, mixed>
     */
    public static function insertEvent(string $accessToken, string $calendarId, array $event): array
    {
        $url = self::GRAPH_BASE . '/calendars/' . rawurlencode($calendarId) . '/events';

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
        $url = self::GRAPH_BASE . '/calendars/' . rawurlencode($calendarId) . '/events/' . rawurlencode($eventId);

        return self::apiPatch($url, $accessToken, $patch);
    }

    /**
     * Delete an event.
     */
    public static function deleteEvent(string $accessToken, string $calendarId, string $eventId): void
    {
        $url = self::GRAPH_BASE . '/calendars/' . rawurlencode($calendarId) . '/events/' . rawurlencode($eventId);
        self::apiDelete($url, $accessToken);
    }

    /**
     * List events updated since a given ISO8601 datetime.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function listEvents(
        string $accessToken,
        string $calendarId,
        ?string $updatedMin = null
    ): array {
        $filter = '';
        if ($updatedMin !== null) {
            $filter = '$filter=' . rawurlencode("lastModifiedDateTime ge {$updatedMin}") . '&';
        }
        $url  = self::GRAPH_BASE . '/calendars/' . rawurlencode($calendarId)
              . '/events?' . $filter . '$top=250&$orderby=lastModifiedDateTime';
        $data = self::apiGet($url, $accessToken);

        return $data['value'] ?? [];
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
            throw new \RuntimeException('Microsoft token request failed (' . $code . '): ' . (string)$resp);
        }
        $dec = json_decode((string)$resp, true);
        if (!is_array($dec) || empty($dec['access_token'])) {
            throw new \RuntimeException('Microsoft token response invalid.');
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
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $accessToken,
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT        => 30,
        ]);
        $resp = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($resp === false || $code < 200 || $code >= 300) {
            throw new \RuntimeException('Graph API GET failed (' . $code . ')');
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
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT        => 30,
        ]);
        $resp = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($resp === false || $code < 200 || $code >= 300) {
            throw new \RuntimeException('Graph API ' . $method . ' failed (' . $code . '): ' . (string)$resp);
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
        $row = $tokenModel->findByUserProviderEmail($userId, 'outlook', $providerEmail);
        if ($row === null) {
            throw new \RuntimeException('Outlook calendar not connected.');
        }
        $expiresAt   = strtotime((string)($row['expires_at'] ?? '0'));
        $accessToken = (string)$row['access_token'];

        if ($expiresAt < (time() + 60)) {
            $refreshed   = self::refreshAccessToken((string)$row['refresh_token']);
            $accessToken = (string)$refreshed['access_token'];
            $newExpiry   = date('Y-m-d H:i:s', time() + (int)($refreshed['expires_in'] ?? 3600));
            $newRefresh  = (string)($refreshed['refresh_token'] ?? $row['refresh_token']);
            $tokenModel->upsert($userId, 'outlook', $providerEmail, [
                'access_token'  => $accessToken,
                'refresh_token' => $newRefresh,
                'expires_at'    => $newExpiry,
                'scope'         => $row['scope'],
            ]);
        }

        return $accessToken;
    }
}

<?php
declare(strict_types=1);

namespace App\Controllers\Integrations;

use App\Config\App as AppConfig;
use App\Controllers\BaseController;
use App\Libraries\GoogleCalendarClient;
use App\Models\CalendarOAuthTokenModel;
use App\Models\CalendarSyncAccountModel;

/**
 * GET /api/integrations/calendar/google/callback
 *
 * OAuth2 redirect target — no Bearer auth; identity is validated via the
 * signed state parameter embedded in the authorisation URL.
 */
class GoogleCalendarCallbackController extends BaseController
{
    private function stateSecret(): string
    {
        return trim((string)(getenv('CALENDAR_STATE_SECRET') ?: 'change-me-cal-state'));
    }

    public function handle(): never
    {
        $code  = trim((string)$this->query('code', ''));
        $state = trim((string)$this->query('state', ''));
        $error = trim((string)$this->query('error', ''));

        if ($error !== '') {
            $this->htmlResponse('Google authorisation denied: ' . htmlspecialchars($error, ENT_QUOTES, 'UTF-8'), 400);
        }
        if ($code === '' || $state === '') {
            $this->htmlResponse('Missing code or state.', 400);
        }

        // Validate state
        $decoded = json_decode((string)base64_decode($state, true), true);
        if (!is_array($decoded)
            || empty($decoded['uid'])
            || empty($decoded['exp'])
            || empty($decoded['sig'])
            || ($decoded['provider'] ?? '') !== 'google') {
            $this->htmlResponse('Invalid state.', 400);
        }
        $uid    = (int)$decoded['uid'];
        $exp    = (int)$decoded['exp'];
        $expect = hash_hmac('sha256', $uid . '|google|' . $exp, $this->stateSecret());
        if (!hash_equals($expect, (string)$decoded['sig']) || $exp < time()) {
            $this->htmlResponse('State verification failed.', 403);
        }

        // Exchange code for tokens
        try {
            $tok = GoogleCalendarClient::exchangeCode($code);
        } catch (\Throwable $e) {
            error_log('[GoogleCalCallback] ' . $e->getMessage());
            $this->htmlResponse('Token exchange failed.', 502);
        }

        // Fetch userinfo (to get the Google email for this account)
        try {
            $profile = GoogleCalendarClient::getUserInfo((string)$tok['access_token']);
        } catch (\Throwable $e) {
            error_log('[GoogleCalCallback] userinfo: ' . $e->getMessage());
            $this->htmlResponse('Could not fetch Google profile.', 502);
        }

        $providerEmail = trim((string)($profile['email'] ?? ''));
        if ($providerEmail === '') {
            $this->htmlResponse('Google did not return an email address.', 502);
        }

        $expiresIn = (int)($tok['expires_in'] ?? 3600);
        $expiresAt = date('Y-m-d H:i:s', time() + $expiresIn);

        $tokenModel = new CalendarOAuthTokenModel();
        $tokenModel->upsert($uid, 'google', $providerEmail, [
            'access_token'  => (string)$tok['access_token'],
            'refresh_token' => (string)($tok['refresh_token'] ?? ''),
            'expires_at'    => $expiresAt,
            'scope'         => $tok['scope'] ?? null,
            'raw_profile'   => $profile,
        ]);

        // Fetch and persist the user's calendar list so the UI can show them immediately
        try {
            $calendars    = GoogleCalendarClient::listCalendars((string)$tok['access_token']);
            $accountModel = new CalendarSyncAccountModel();
            foreach ($calendars as $cal) {
                $accountModel->upsert($uid, 'google', $providerEmail, (string)$cal['id'], [
                    'calendar_name'  => $cal['summary'] ?? $cal['id'],
                    'is_active'      => true,
                    'sync_enabled'   => ($cal['primary'] ?? false) ? true : false,
                    'sync_direction' => 'two_way',
                ]);
            }
        } catch (\Throwable $e) {
            error_log('[GoogleCalCallback] calendar list: ' . $e->getMessage());
        }

        $origin = $this->corsOrigin();
        $this->htmlCloseWindow($origin, 'google_calendar_oauth');
    }

    private function corsOrigin(): string
    {
        $app   = new AppConfig();
        $raw   = $app->corsOrigin;
        $parts = array_values(array_filter(array_map('trim', explode(',', $raw))));

        return $parts[0] ?? $raw;
    }

    private function htmlResponse(string $message, int $status): never
    {
        http_response_code($status);
        header('Content-Type: text/html; charset=UTF-8');
        echo '<!DOCTYPE html><html><body><p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p></body></html>';
        exit;
    }

    private function htmlCloseWindow(string $origin, string $type): never
    {
        http_response_code(200);
        header('Content-Type: text/html; charset=UTF-8');
        $o = htmlspecialchars($origin, ENT_QUOTES, 'UTF-8');
        $t = htmlspecialchars($type,   ENT_QUOTES, 'UTF-8');
        echo '<!DOCTYPE html><html><body><script>'
            . "if(window.opener){window.opener.postMessage({type:'{$t}',ok:true},'{$o}');}"
            . 'window.close();'
            . '</script><p>Google Calendar connected. You may close this window.</p></body></html>';
        exit;
    }
}

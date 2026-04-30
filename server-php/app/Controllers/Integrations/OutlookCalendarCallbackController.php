<?php
declare(strict_types=1);

namespace App\Controllers\Integrations;

use App\Config\App as AppConfig;
use App\Controllers\BaseController;
use App\Libraries\OutlookCalendarClient;
use App\Models\CalendarOAuthTokenModel;
use App\Models\CalendarSyncAccountModel;

/**
 * GET /api/integrations/calendar/outlook/callback
 *
 * Microsoft OAuth2 redirect target. Identity validated via signed state.
 */
class OutlookCalendarCallbackController extends BaseController
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
            $this->htmlResponse('Microsoft authorisation denied: ' . htmlspecialchars($error, ENT_QUOTES, 'UTF-8'), 400);
        }
        if ($code === '' || $state === '') {
            $this->htmlResponse('Missing code or state.', 400);
        }

        $decoded = json_decode((string)base64_decode($state, true), true);
        if (!is_array($decoded)
            || empty($decoded['uid'])
            || empty($decoded['exp'])
            || empty($decoded['sig'])
            || ($decoded['provider'] ?? '') !== 'outlook') {
            $this->htmlResponse('Invalid state.', 400);
        }
        $uid    = (int)$decoded['uid'];
        $exp    = (int)$decoded['exp'];
        $expect = hash_hmac('sha256', $uid . '|outlook|' . $exp, $this->stateSecret());
        if (!hash_equals($expect, (string)$decoded['sig']) || $exp < time()) {
            $this->htmlResponse('State verification failed.', 403);
        }

        try {
            $tok = OutlookCalendarClient::exchangeCode($code);
        } catch (\Throwable $e) {
            error_log('[OutlookCalCallback] ' . $e->getMessage());
            $this->htmlResponse('Token exchange failed.', 502);
        }

        try {
            $profile = OutlookCalendarClient::getUserInfo((string)$tok['access_token']);
        } catch (\Throwable $e) {
            error_log('[OutlookCalCallback] userinfo: ' . $e->getMessage());
            $this->htmlResponse('Could not fetch Microsoft profile.', 502);
        }

        $providerEmail = trim((string)($profile['mail'] ?? $profile['userPrincipalName'] ?? ''));
        if ($providerEmail === '') {
            $this->htmlResponse('Microsoft did not return an email address.', 502);
        }

        $expiresIn = (int)($tok['expires_in'] ?? 3600);
        $expiresAt = date('Y-m-d H:i:s', time() + $expiresIn);

        $tokenModel = new CalendarOAuthTokenModel();
        $tokenModel->upsert($uid, 'outlook', $providerEmail, [
            'access_token'  => (string)$tok['access_token'],
            'refresh_token' => (string)($tok['refresh_token'] ?? ''),
            'expires_at'    => $expiresAt,
            'scope'         => $tok['scope'] ?? null,
            'raw_profile'   => $profile,
        ]);

        try {
            $calendars    = OutlookCalendarClient::listCalendars((string)$tok['access_token']);
            $accountModel = new CalendarSyncAccountModel();
            foreach ($calendars as $cal) {
                $accountModel->upsert($uid, 'outlook', $providerEmail, (string)$cal['id'], [
                    'calendar_name'  => $cal['name'] ?? $cal['id'],
                    'is_active'      => true,
                    'sync_enabled'   => ($cal['isDefaultCalendar'] ?? false) ? true : false,
                    'sync_direction' => 'two_way',
                ]);
            }
        } catch (\Throwable $e) {
            error_log('[OutlookCalCallback] calendar list: ' . $e->getMessage());
        }

        $origin = $this->corsOrigin();
        $this->htmlCloseWindow($origin, 'outlook_calendar_oauth');
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
            . '</script><p>Outlook Calendar connected. You may close this window.</p></body></html>';
        exit;
    }
}

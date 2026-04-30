<?php
declare(strict_types=1);

namespace App\Controllers\Integrations;

use App\Controllers\BaseController;
use App\Libraries\AppleCalDAVClient;
use App\Models\CalendarOAuthTokenModel;
use App\Models\CalendarSyncAccountModel;

/**
 * POST /api/admin/integrations/calendar/apple/connect
 *
 * Accepts an Apple ID + App-Specific Password, verifies the CalDAV
 * connection, then stores credentials and the discovered calendar list.
 *
 * Unlike Google/Outlook, Apple does not use OAuth2 for CalDAV; the
 * user must generate an App-Specific Password at appleid.apple.com.
 */
class AppleCalendarConnectController extends BaseController
{
    public function handle(): never
    {
        $user = $this->authUser();
        if ($user === null) {
            $this->error('Unauthorized.', 401);
        }
        $userId = (int)$user['id'];

        $body        = $this->getJsonBody();
        $appleId     = trim((string)($body['apple_id'] ?? ''));
        $appPassword = trim((string)($body['app_password'] ?? ''));

        if ($appleId === '' || $appPassword === '') {
            $this->error('apple_id and app_password are required.', 422);
        }

        $client = new AppleCalDAVClient($appleId, $appPassword);

        try {
            $client->verifyConnection();
        } catch (\Throwable $e) {
            $this->error('Could not connect to iCloud CalDAV: ' . $e->getMessage(), 422);
        }

        // Persist credentials — store the app-specific password as refresh_token
        $tokenModel = new CalendarOAuthTokenModel();
        $tokenModel->upsert($userId, 'apple', $appleId, [
            'access_token'  => null,
            'refresh_token' => $appPassword,
            'expires_at'    => null,
            'scope'         => 'caldav',
        ]);

        // Discover calendars and save them
        $calendars    = [];
        $accountModel = new CalendarSyncAccountModel();
        try {
            $calendars = $client->listCalendars();
            foreach ($calendars as $cal) {
                $accountModel->upsert($userId, 'apple', $appleId, $cal['url'], [
                    'calendar_name'  => $cal['name'],
                    'is_active'      => true,
                    'sync_enabled'   => true,
                    'sync_direction' => 'two_way',
                ]);
            }
        } catch (\Throwable $e) {
            error_log('[AppleCalConnect] calendar list: ' . $e->getMessage());
        }

        $this->success([
            'provider'       => 'apple',
            'provider_email' => $appleId,
            'calendars_found' => count($calendars),
        ], 'Apple Calendar connected', 201);
    }
}

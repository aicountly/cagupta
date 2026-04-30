<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Libraries\CalendarSyncService;
use App\Libraries\GoogleCalendarClient;
use App\Libraries\OutlookCalendarClient;
use App\Models\CalendarOAuthTokenModel;
use App\Models\CalendarSyncAccountModel;
use App\Models\CalendarSyncSettingsModel;

/**
 * CalendarSyncController — manage per-user calendar integrations.
 *
 * Routes:
 *   GET    /api/admin/integrations/calendar/google/authorize
 *   GET    /api/admin/integrations/calendar/outlook/authorize
 *   GET    /api/admin/integrations/calendar/accounts
 *   DELETE /api/admin/integrations/calendar/accounts/:id
 *   PATCH  /api/admin/integrations/calendar/accounts/:id
 *   GET    /api/admin/integrations/calendar/settings
 *   PUT    /api/admin/integrations/calendar/settings
 *   POST   /api/admin/integrations/calendar/sync
 */
class CalendarSyncController extends BaseController
{
    private function stateSecret(): string
    {
        return trim((string)(getenv('CALENDAR_STATE_SECRET') ?: 'change-me-cal-state'));
    }

    private function buildState(int $userId, string $provider): string
    {
        $exp = time() + 600;
        $sig = hash_hmac('sha256', $userId . '|' . $provider . '|' . $exp, $this->stateSecret());

        return base64_encode((string)json_encode(
            ['uid' => $userId, 'provider' => $provider, 'exp' => $exp, 'sig' => $sig],
            JSON_THROW_ON_ERROR
        ));
    }

    // ── GET /api/admin/integrations/calendar/google/authorize ─────────────────

    public function googleAuthorize(): never
    {
        if (!GoogleCalendarClient::isConfigured()) {
            $this->error('Google Calendar OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).', 503);
        }
        $user = $this->authUser();
        if ($user === null) {
            $this->error('Unauthorized.', 401);
        }
        $state = $this->buildState((int)$user['id'], 'google');
        $this->success([
            'authorizationUrl' => GoogleCalendarClient::authorizeUrl($state),
            'state'            => $state,
        ]);
    }

    // ── GET /api/admin/integrations/calendar/outlook/authorize ────────────────

    public function outlookAuthorize(): never
    {
        if (!OutlookCalendarClient::isConfigured()) {
            $this->error('Outlook Calendar OAuth is not configured (MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET).', 503);
        }
        $user = $this->authUser();
        if ($user === null) {
            $this->error('Unauthorized.', 401);
        }
        $state = $this->buildState((int)$user['id'], 'outlook');
        $this->success([
            'authorizationUrl' => OutlookCalendarClient::authorizeUrl($state),
            'state'            => $state,
        ]);
    }

    // ── GET /api/admin/integrations/calendar/accounts ─────────────────────────

    public function accounts(): never
    {
        $user = $this->authUser();
        if ($user === null) {
            $this->error('Unauthorized.', 401);
        }
        $userId   = (int)$user['id'];
        $tokens   = (new CalendarOAuthTokenModel())->findAllByUser($userId);
        $accounts = (new CalendarSyncAccountModel())->findAllByUser($userId);

        // Group connected accounts by provider + email
        $connected = [];
        foreach ($tokens as $tok) {
            $key = $tok['provider'] . ':' . $tok['provider_email'];
            $connected[$key] = [
                'provider'       => $tok['provider'],
                'provider_email' => $tok['provider_email'],
                'connected'      => true,
                'calendars'      => [],
            ];
        }
        foreach ($accounts as $acct) {
            $key = $acct['provider'] . ':' . $acct['provider_email'];
            if (isset($connected[$key])) {
                $connected[$key]['calendars'][] = [
                    'id'             => $acct['id'],
                    'calendar_id'    => $acct['calendar_id'],
                    'calendar_name'  => $acct['calendar_name'],
                    'sync_enabled'   => (bool)$acct['sync_enabled'],
                    'sync_direction' => $acct['sync_direction'],
                    'last_synced_at' => $acct['last_synced_at'],
                ];
            }
        }

        $this->success(array_values($connected));
    }

    // ── DELETE /api/admin/integrations/calendar/accounts/:id ─────────────────
    // Disconnects an entire provider+email — deletes token + all its sync accounts.

    public function disconnect(int $id): never
    {
        $user = $this->authUser();
        if ($user === null) {
            $this->error('Unauthorized.', 401);
        }
        $userId = (int)$user['id'];

        $tokenModel   = new CalendarOAuthTokenModel();
        $accountModel = new CalendarSyncAccountModel();

        // id here refers to calendar_oauth_tokens.id
        $allTokens = $tokenModel->findAllByUser($userId);
        $target    = null;
        foreach ($allTokens as $t) {
            if ((int)$t['id'] === $id) {
                $target = $t;
                break;
            }
        }
        if ($target === null) {
            $this->error('Integration not found.', 404);
        }

        $accountModel->deleteByProviderEmail($userId, (string)$target['provider'], (string)$target['provider_email']);
        $tokenModel->delete($userId, (string)$target['provider'], (string)$target['provider_email']);

        $this->success(null, 'Calendar disconnected');
    }

    // ── PATCH /api/admin/integrations/calendar/accounts/:id ──────────────────
    // Updates a single sync-account row (sync_enabled, sync_direction).

    public function updateAccount(int $id): never
    {
        $user = $this->authUser();
        if ($user === null) {
            $this->error('Unauthorized.', 401);
        }
        $userId = (int)$user['id'];

        $model  = new CalendarSyncAccountModel();
        $acct   = $model->findById($id);
        if ($acct === null || (int)$acct['user_id'] !== $userId) {
            $this->error('Sync account not found.', 404);
        }

        $body  = $this->getJsonBody();
        $patch = [];
        if (array_key_exists('sync_enabled', $body)) {
            $patch['sync_enabled'] = (bool)$body['sync_enabled'];
        }
        if (array_key_exists('sync_direction', $body)) {
            $allowed = ['push_only', 'pull_only', 'two_way'];
            if (!in_array($body['sync_direction'], $allowed, true)) {
                $this->error('Invalid sync_direction.', 422);
            }
            $patch['sync_direction'] = $body['sync_direction'];
        }
        if ($patch !== []) {
            $model->update($id, $patch);
        }

        $this->success($model->findById($id), 'Sync account updated');
    }

    // ── GET /api/admin/integrations/calendar/settings ─────────────────────────

    public function getSettings(): never
    {
        $user = $this->authUser();
        if ($user === null) {
            $this->error('Unauthorized.', 401);
        }
        $this->success((new CalendarSyncSettingsModel())->findByUser((int)$user['id']));
    }

    // ── PUT /api/admin/integrations/calendar/settings ─────────────────────────

    public function updateSettings(): never
    {
        $user = $this->authUser();
        if ($user === null) {
            $this->error('Unauthorized.', 401);
        }
        $body    = $this->getJsonBody();
        $model   = new CalendarSyncSettingsModel();
        $model->save((int)$user['id'], $body);
        $this->success($model->findByUser((int)$user['id']), 'Settings saved');
    }

    // ── POST /api/admin/integrations/calendar/sync ────────────────────────────

    public function syncNow(): never
    {
        $user = $this->authUser();
        if ($user === null) {
            $this->error('Unauthorized.', 401);
        }
        $result = (new CalendarSyncService())->pullEvents((int)$user['id']);
        $this->success($result, 'Sync complete');
    }
}

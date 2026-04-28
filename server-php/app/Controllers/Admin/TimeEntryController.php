<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Models\ServiceModel;
use App\Models\TimeEntryModel;

/**
 * Time entries on engagements.
 */
class TimeEntryController extends BaseController
{
    private ServiceModel $services;
    private TimeEntryModel $entries;

    /**
     * PostgreSQL insufficient_privilege / permission denied → clear operator message.
     */
    private static function isDbPermissionDenied(\Throwable $e): bool
    {
        if (!$e instanceof \PDOException) {
            return false;
        }
        $state = $e->errorInfo[0] ?? '';
        if ($state === '42501') {
            return true;
        }
        $msg = strtolower($e->getMessage());

        return str_contains($msg, 'permission denied for')
            || str_contains($msg, 'must be owner of');
    }

    private static function dbGrantDeniedMessage(string $operations): string
    {
        $role = trim((string)(getenv('DB_USER') ?: ''));
        $rolePart = $role !== '' ? "PostgreSQL role \"{$role}\" (DB_USER)" : 'the PostgreSQL role in DB_USER';

        return 'Database access denied: ' . $rolePart . ' lacks privileges (' . $operations . '). '
            . 'Connect as a superuser and run the SQL printed by: php database/print_app_grants.php '
            . '(from the server-php directory), or apply database/migrations/029_app_pg_grants.sql after '
            . 'setting app_role there to match DB_USER.';
    }

    public function __construct()
    {
        $this->services = new ServiceModel();
        $this->entries  = new TimeEntryModel();
    }

    // ── GET /api/admin/services/:id/time-entries ─────────────────────────────

    public function indexForService(int $id): never
    {
        try {
            $service = $this->services->find($id);
            if ($service === null) {
                $this->error('Service not found.', 404);
            }
            $rows = $this->entries->listForService($id);
            $this->success($rows, 'Time entries retrieved');
        } catch (\Throwable $e) {
            if (self::isDbPermissionDenied($e)) {
                $this->error(self::dbGrantDeniedMessage('SELECT on time-related tables; INSERT for new time rows'), 503);
            }
            throw $e;
        }
    }

    // ── POST /api/admin/services/:id/time-entries ────────────────────────────

    /**
     * Body: { work_date, duration_minutes, activity_type, is_billable?, task_id?, notes?, user_id? }
     * user_id only for users.manage (otherwise forced to auth user).
     */
    public function storeForService(int $id): never
    {
        $service = $this->services->find($id);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }

        $body    = $this->getJsonBody();
        $actor   = $this->authUser();
        $actorId = $actor ? (int)$actor['id'] : 0;
        if ($actorId <= 0) {
            $this->error('Unauthorized.', 401);
        }

        $targetUserId = $actorId;
        if (!empty($body['user_id']) && (int)$body['user_id'] !== $actorId) {
            if (!$this->userHasManageAll($actor)) {
                $this->error('Only team administrators may log time on behalf of another user.', 403);
            }
            $targetUserId = (int)$body['user_id'];
            if ($targetUserId <= 0) {
                $this->error('Invalid user_id.', 422);
            }
        }

        $created = $this->entries->createWithValidation($service, array_merge($body, [
            'user_id' => $targetUserId,
        ]));

        if ($created === null) {
            $this->error(
                'Cannot save time entry. Ensure the service is open (not completed, cancelled, or billing-closed), ' .
                'and if a task is selected it must still be open (not done).',
                422
            );
        }

        $this->success($created, 'Time entry saved', 201);
    }

    // ── GET /api/admin/time-entries/report ───────────────────────────────────

    /**
     * Query: user_id (optional), date_from, date_to (YYYY-MM-DD).
     */
    public function report(): never
    {
        $uid   = (int)$this->query('user_id', 0);
        $uid   = $uid > 0 ? $uid : null;
        $from  = trim((string)$this->query('date_from', ''));
        $to    = trim((string)$this->query('date_to', ''));

        if ($from === '' || $to === '') {
            $this->error('date_from and date_to are required (YYYY-MM-DD).', 422);
        }

        try {
            $rows = $this->entries->reportByUserService($uid, $from, $to);
            $this->success($rows, 'Time entry report retrieved');
        } catch (\Throwable $e) {
            if (self::isDbPermissionDenied($e)) {
                $this->error(self::dbGrantDeniedMessage('SELECT on time_entries and related tables'), 503);
            }
            throw $e;
        }
    }

    // ── GET /api/admin/time-entries/active ───────────────────────────────────

    public function active(): never
    {
        $actor = $this->authUser();
        $actorId = $actor ? (int)$actor['id'] : 0;
        if ($actorId <= 0) {
            $this->error('Unauthorized.', 401);
        }
        try {
            $active = $this->entries->getActiveForUser($actorId);
            if ($active === null) {
                $this->success(null, 'No active timer');
            }
            $service = $this->services->find((int)$active['service_id']);
            if ($service !== null) {
                $active['service_type'] = $service['service_type'] ?? '';
                $active['client_name'] = $service['client_name'] ?? '';
            }
            $this->success($active, 'Active timer retrieved');
        } catch (\Throwable $e) {
            if (self::isDbPermissionDenied($e)) {
                $this->error(self::dbGrantDeniedMessage('SELECT on time-related tables'), 503);
            }
            throw $e;
        }
    }

    // ── POST /api/admin/services/:id/time-entries/start ──────────────────────

    public function startForService(int $id): never
    {
        $service = $this->services->find($id);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }
        $body = $this->getJsonBody();
        $actor = $this->authUser();
        $actorId = $actor ? (int)$actor['id'] : 0;
        if ($actorId <= 0) {
            $this->error('Unauthorized.', 401);
        }
        $targetUserId = $actorId;
        if (!empty($body['user_id']) && (int)$body['user_id'] !== $actorId) {
            if (!$this->userHasManageAll($actor)) {
                $this->error('Only team administrators may start timers for another user.', 403);
            }
            $targetUserId = (int)$body['user_id'];
            if ($targetUserId <= 0) {
                $this->error('Invalid user_id.', 422);
            }
        }

        $active = $this->entries->getActiveForUser($targetUserId);
        if ($active !== null) {
            $activeService = $this->services->find((int)$active['service_id']);
            if ($activeService !== null) {
                $active['service_type'] = $activeService['service_type'] ?? '';
                $active['client_name'] = $activeService['client_name'] ?? '';
            }
            $this->error('A timer is already running for this user.', 409, [], ['active_timer' => $active]);
        }

        $created = $this->entries->startTimerWithValidation($service, array_merge($body, [
            'user_id' => $targetUserId,
        ]));
        if ($created === null) {
            $this->error(
                'Cannot start timer. Ensure the service is open and the selected task (if any) is not done.',
                422
            );
        }
        $this->success($created, 'Timer started', 201);
    }

    // ── POST /api/admin/services/:id/time-entries/:entryId/stop ──────────────

    public function stopForService(int $id, int $entryId): never
    {
        $service = $this->services->find($id);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }
        $body = $this->getJsonBody();
        $actor = $this->authUser();
        $actorId = $actor ? (int)$actor['id'] : 0;
        if ($actorId <= 0) {
            $this->error('Unauthorized.', 401);
        }
        $stopped = $this->entries->stopTimerWithValidation($service, $entryId, $actorId, $body);
        if ($stopped === null) {
            $this->error(
                'Cannot stop timer. Ensure this timer is running for your user and the service/task is open.',
                422
            );
        }
        $this->success($stopped, 'Timer stopped');
    }

    // ── PATCH /api/admin/services/:id/time-entries/:entryId ──────────────────

    public function updateForService(int $id, int $entryId): never
    {
        $service = $this->services->find($id);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }
        $body = $this->getJsonBody();
        $actor = $this->authUser();
        $actorId = $actor ? (int)$actor['id'] : 0;
        if ($actorId <= 0) {
            $this->error('Unauthorized.', 401);
        }
        $updated = $this->entries->updateWithValidation(
            $service,
            $entryId,
            $actorId,
            $this->userHasManageAll($actor),
            $body
        );
        if ($updated === null) {
            $this->error(
                'Cannot update time entry. Ensure duration/date/activity are valid and the service/task is open.',
                422
            );
        }
        $this->success($updated, 'Time entry updated');
    }

    /**
     * @param array<string, mixed>|null $actor
     */
    private function userHasManageAll(?array $actor): bool
    {
        if ($actor === null) {
            return false;
        }
        if ($this->isSuperAdminEmail((string)($actor['email'] ?? ''))) {
            return true;
        }
        $list = $actor['role_permissions_array'] ?? [];
        if (!is_array($list)) {
            return false;
        }

        return in_array('users.manage', $list, true) || in_array('*', $list, true);
    }
}


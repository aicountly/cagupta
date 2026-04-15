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

    /** @internal debug session dc6652 */
    private static function agentDebugLog(string $hypothesisId, string $location, string $message, array $data = []): void
    {
        $line = json_encode([
            'sessionId' => 'dc6652',
            'runId' => 'grant-check',
            'hypothesisId' => $hypothesisId,
            'location' => $location,
            'message' => $message,
            'data' => $data,
            'timestamp' => (int) round(microtime(true) * 1000),
        ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) . "\n";
        $paths = [
            dirname(__DIR__, 4) . '/.cursor/debug-dc6652.log',
            rtrim(sys_get_temp_dir(), '/') . '/debug-dc6652.log',
        ];
        foreach ($paths as $path) {
            @file_put_contents($path, $line, FILE_APPEND | LOCK_EX);
        }
        error_log('[dc6652] ' . trim($line));
    }

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
            // #region agent log
            self::agentDebugLog('E', 'TimeEntryController.php:indexForService', 'list ok', ['serviceId' => $id, 'rowCount' => is_array($rows) ? count($rows) : -1]);
            // #endregion
            $this->success($rows, 'Time entries retrieved');
        } catch (\Throwable $e) {
            // #region agent log
            $hid = $e instanceof \JsonException ? 'C' : (($e instanceof \PDOException) ? 'A' : 'B');
            $pdoInfo = $e instanceof \PDOException ? ['sqlstate' => $e->errorInfo[0] ?? '', 'driver' => $e->errorInfo[1] ?? ''] : [];
            self::agentDebugLog($hid, 'TimeEntryController.php:indexForService', 'exception', array_merge([
                'serviceId' => $id,
                'class' => $e::class,
                'error' => $e->getMessage(),
            ], $pdoInfo));
            // #endregion
            if (self::isDbPermissionDenied($e)) {
                $this->error(
                    'Database access denied for this user. A PostgreSQL superuser must GRANT '
                    . 'USAGE on schema public and SELECT (plus INSERT for logging time) on application tables '
                    . 'to the same role as DB_USER. See database/migrations/029_app_pg_grants.sql.',
                    503
                );
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

        // #region agent log
        self::agentDebugLog('D', 'TimeEntryController.php:report', 'params', ['userId' => $uid, 'dateFrom' => $from, 'dateTo' => $to]);
        // #endregion
        try {
            $rows = $this->entries->reportByUserService($uid, $from, $to);
            // #region agent log
            self::agentDebugLog('A', 'TimeEntryController.php:report', 'report query ok', ['rowCount' => is_array($rows) ? count($rows) : -1]);
            // #endregion
            $this->success($rows, 'Time entry report retrieved');
        } catch (\Throwable $e) {
            // #region agent log
            $hid = $e instanceof \JsonException ? 'C' : (($e instanceof \PDOException) ? 'A' : 'B');
            $pdoInfo = $e instanceof \PDOException ? ['sqlstate' => $e->errorInfo[0] ?? '', 'driver' => $e->errorInfo[1] ?? ''] : [];
            self::agentDebugLog($hid, 'TimeEntryController.php:report', 'exception', array_merge([
                'class' => $e::class,
                'error' => $e->getMessage(),
            ], $pdoInfo));
            // #endregion
            if (self::isDbPermissionDenied($e)) {
                $this->error(
                    'Database access denied for this user. A PostgreSQL superuser must GRANT '
                    . 'USAGE on schema public and SELECT on application tables to the same role as DB_USER. '
                    . 'See database/migrations/029_app_pg_grants.sql.',
                    503
                );
            }
            throw $e;
        }
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


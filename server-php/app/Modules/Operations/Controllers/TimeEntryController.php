<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Config\Auth as AuthConfig;
use App\Config\Database;
use App\Controllers\BaseController;
use App\Libraries\TimesheetEngagementCap;
use App\Libraries\WorkHoldGate;
use App\Libraries\BrevoMailer;
use App\Libraries\OtpService;
use App\Models\ServiceModel;
use App\Models\TimeEntryModel;
use App\Models\TimesheetOverflowRequestModel;
use App\Models\UserModel;
use App\Models\UserNotificationModel;

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

    /**
     * Missing table/column (migrations not applied) → operator-facing hint instead of a generic 500.
     */
    private static function isDbSchemaMismatch(\Throwable $e): bool
    {
        if (!$e instanceof \PDOException) {
            return false;
        }
        $state = (string)($e->errorInfo[0] ?? '');

        return $state === '42P01' || $state === '42703';
    }

    private static function dbSchemaMismatchMessage(): string
    {
        return 'The database schema is missing objects required for timesheets (tables or columns). '
            . 'Apply pending migrations under server-php/database/migrations (for example cap/overflow support '
            . '037_time_entry_timers.sql and 057_timesheet_overflow_approvals.sql) so schema_migrations is up to date.';
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

        try {
            $this->storeForServiceExecute($id, $service);
        } catch (\Throwable $e) {
            if (self::isDbPermissionDenied($e)) {
                $this->error(
                    self::dbGrantDeniedMessage(
                        'SELECT/INSERT on time_entries, timesheet_overflow_requests, and related tables'
                    ),
                    503
                );
            }
            if (self::isDbSchemaMismatch($e)) {
                $this->error(self::dbSchemaMismatchMessage(), 503);
            }
            throw $e;
        }
    }

    /**
     * @param array<string, mixed> $service
     */
    private function storeForServiceExecute(int $id, array $service): never
    {
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

        $holdMsg = WorkHoldGate::reasonBlockedTimeEntry($service);
        if ($holdMsg !== null) {
            $this->error($holdMsg, 422);
        }

        $duration = (int)($body['duration_minutes'] ?? 0);
        if ($duration <= 0 || $duration > 1440) {
            $this->error('duration_minutes must be between 1 and 1440.', 422);
        }

        $eval = TimesheetEngagementCap::evaluateAppend($id, $service, $duration, null, null);
        $wantOverflow = !empty($body['request_overflow_approval']);

        if ($eval['has_cap'] && $eval['would_exceed'] && !$wantOverflow) {
            $this->error(
                'Logged time would exceed the allowance (3 × standard hours for this engagement). ' .
                'Reduce duration or submit with superadmin approval.',
                422,
                [],
                array_merge($eval, ['code' => 'timesheet_cap_exceeded'])
            );
        }

        if ($eval['has_cap'] && $eval['would_exceed'] && $wantOverflow) {
            $workDate = trim((string)($body['work_date'] ?? ''));
            if ($workDate === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $workDate)) {
                $this->error('work_date (YYYY-MM-DD) is required for an overflow approval request.', 422);
            }
            $activity = strtolower(trim((string)($body['activity_type'] ?? '')));
            if (!in_array($activity, TimeEntryModel::ACTIVITY_TYPES, true)) {
                $this->error('Invalid activity_type for overflow request.', 422);
            }
            $taskId = isset($body['task_id']) && $body['task_id'] !== '' && $body['task_id'] !== null
                ? trim((string)$body['task_id'])
                : null;
            if ($taskId !== null && !$this->entries->isTaskOpen($service, $taskId)) {
                $this->error('Selected task is not open.', 422);
            }
            $isBillable = array_key_exists('is_billable', $body) ? (bool)$body['is_billable'] : true;
            $notes      = isset($body['notes']) ? trim((string)$body['notes']) : null;
            if ($notes === '') {
                $notes = null;
            }
            if (\App\Libraries\ApprovalReason::validateOverflowNotes($notes) !== null) {
                $this->error(\App\Libraries\ApprovalReason::OVERFLOW_NOTES_MESSAGE, 422);
            }

            $overflow = new TimesheetOverflowRequestModel();
            $rid        = $overflow->create([
                'service_id'                 => $id,
                'user_id'                    => $targetUserId,
                'time_entry_id'              => null,
                'source_kind'                => 'manual_create',
                'duration_minutes_requested' => $duration,
                'work_date'                  => $workDate,
                'activity_type'              => $activity,
                'is_billable'                => $isBillable,
                'notes'                      => $notes,
                'task_id'                    => $taskId,
            ]);
            $overflow->insertAudit($rid, 'submitted', $actorId, ['service_id' => $id]);
            $this->notifySuperadminsTimesheetOverflow($rid, $service, $duration);

            $this->success(
                [
                    'overflow_request_id' => $rid,
                    'status'              => 'pending_superadmin',
                    'evaluation'          => $eval,
                ],
                'Timesheet overflow approval requested.',
                202
            );
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
        $requestedUserId = (int)$this->query('user_id', 0);
        [$actorUserId, $isSuperAdmin, $scopeUserId] = $this->resolveServiceVisibilityContext(
            $requestedUserId > 0 ? $requestedUserId : null
        );
        $uid = null;
        if ($isSuperAdmin) {
            $uid = $requestedUserId > 0 ? $requestedUserId : null;
        } else {
            $uid = $actorUserId;
        }
        $from  = trim((string)$this->query('date_from', ''));
        $to    = trim((string)$this->query('date_to', ''));

        if ($from === '' || $to === '') {
            $this->error('date_from and date_to are required (YYYY-MM-DD).', 422);
        }

        try {
            $rows = $this->entries->reportByUserService(
                $uid,
                $from,
                $to,
                $actorUserId,
                $isSuperAdmin,
                $scopeUserId
            );
            $this->success($rows, 'Time entry report retrieved');
        } catch (\Throwable $e) {
            if (self::isDbPermissionDenied($e)) {
                $this->error(self::dbGrantDeniedMessage('SELECT on time_entries and related tables'), 503);
            }
            throw $e;
        }
    }

    // ── GET /api/admin/reports/timesheets/insights ──────────────────────────

    public function reportInsights(): never
    {
        $requestedUserId = (int)$this->query('user_id', 0);
        [$actorUserId, $isSuperAdmin, $scopeUserId] = $this->resolveServiceVisibilityContext(
            $requestedUserId > 0 ? $requestedUserId : null
        );
        $from = trim((string)$this->query('date_from', ''));
        $to = trim((string)$this->query('date_to', ''));
        if ($from === '' || $to === '') {
            $this->error('date_from and date_to are required (YYYY-MM-DD).', 422);
        }

        $bucketRaw = strtolower(trim((string)$this->query('bucket', 'weekly')));
        $bucket = in_array($bucketRaw, ['daily', 'weekly', 'monthly'], true) ? $bucketRaw : 'weekly';
        $billableRaw = strtolower(trim((string)$this->query('billable_type', 'all')));
        $billableType = in_array($billableRaw, ['all', 'billable', 'non_billable'], true) ? $billableRaw : 'all';

        $filters = [
            'date_from' => $from,
            'date_to' => $to,
            'bucket' => $bucket,
            'billable_type' => $billableType,
            'user_id' => $isSuperAdmin ? $requestedUserId : $actorUserId,
            'client_id' => (int)$this->query('client_id', 0),
            'organization_id' => (int)$this->query('organization_id', 0),
            'service_id' => (int)$this->query('service_id', 0),
            'group_id' => (int)$this->query('group_id', 0),
            'actor_user_id' => $actorUserId,
            'is_super_admin' => $isSuperAdmin,
            'scope_user_id' => $scopeUserId,
        ];

        try {
            $data = $this->entries->reportInsights($filters);
            $this->success($data, 'Timesheet insights retrieved');
        } catch (\Throwable $e) {
            if (self::isDbPermissionDenied($e)) {
                $this->error(self::dbGrantDeniedMessage('SELECT on report, invoice, and receipt tables'), 503);
            }
            throw $e;
        }
    }

    // ── GET /api/admin/reports/timesheets/shift-target ───────────────────────

    /**
     * Query: date_from, date_to (YYYY-MM-DD), optional user_id (super admin only).
     */
    public function shiftTargetReport(): never
    {
        $requestedUserId = (int)$this->query('user_id', 0);
        [$actorUserId, $isSuperAdmin, $scopeUserId] = $this->resolveServiceVisibilityContext(
            $requestedUserId > 0 ? $requestedUserId : null
        );
        $from = trim((string)$this->query('date_from', ''));
        $to = trim((string)$this->query('date_to', ''));
        if ($from === '' || $to === '') {
            $this->error('date_from and date_to are required (YYYY-MM-DD).', 422);
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
            $this->error('date_from and date_to must be YYYY-MM-DD.', 422);
        }
        if (strcmp($to, $from) < 0) {
            $this->error('date_to must be on or after date_from.', 422);
        }
        try {
            $fromDt = new \DateTimeImmutable($from);
            $toDt = new \DateTimeImmutable($to);
        } catch (\Exception) {
            $this->error('Invalid date range.', 422);
        }
        $dayCount = (int)$fromDt->diff($toDt)->days + 1;
        if ($dayCount > 366) {
            $this->error('Date range cannot exceed 366 days.', 422);
        }

        $filterUserId = null;
        if ($isSuperAdmin) {
            if ($requestedUserId > 0) {
                $filterUserId = $requestedUserId;
            }
        } else {
            $filterUserId = $actorUserId;
        }

        try {
            $rows = $this->entries->listShiftTargetSummaryForDateRange($from, $to, $filterUserId);
        } catch (\Throwable $e) {
            if (self::isDbPermissionDenied($e)) {
                $this->error(self::dbGrantDeniedMessage('SELECT on time_entries and related tables'), 503);
            }
            throw $e;
        }

        $this->success([
            'meta' => [
                'date_from' => $from,
                'date_to'   => $to,
                'day_count' => $dayCount,
            ],
            'rows' => $rows,
        ], 'Shift target timesheet report retrieved');
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

        $holdMsg = WorkHoldGate::reasonBlockedTimeEntry($service);
        if ($holdMsg !== null) {
            $this->error($holdMsg, 422);
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

        $snap = $this->entries->snapshotTimerStop($service, $entryId, $actorId, $body);
        if ($snap === null) {
            $this->error(
                'Cannot stop timer. Ensure this timer is running for your user and the service/task is open.',
                422
            );
        }

        $eval        = TimesheetEngagementCap::evaluateAppend($id, $service, $snap['mins'], $entryId, null);
        $wantOverflow = !empty($body['request_overflow_approval']);

        if ($eval['has_cap'] && $eval['would_exceed'] && !$wantOverflow) {
            $this->error(
                'Stopping would exceed the allowance (3 × standard hours). Reduce time or stop with superadmin approval.',
                422,
                [],
                array_merge($eval, ['code' => 'timesheet_cap_exceeded'])
            );
        }

        if ($eval['has_cap'] && $eval['would_exceed'] && $wantOverflow) {
            $overflowNotes = isset($body['notes']) ? trim((string)$body['notes']) : trim((string)($snap['notes'] ?? ''));
            if (\App\Libraries\ApprovalReason::validateOverflowNotes($overflowNotes !== '' ? $overflowNotes : null) !== null) {
                $this->error(\App\Libraries\ApprovalReason::OVERFLOW_NOTES_MESSAGE, 422);
            }
            $db = Database::getConnection();
            $db->beginTransaction();
            try {
                $overflow = new TimesheetOverflowRequestModel();
                $rid      = $overflow->create([
                    'service_id'                 => $id,
                    'user_id'                    => $actorId,
                    'time_entry_id'              => $entryId,
                    'source_kind'                => 'timer_stop',
                    'duration_minutes_requested' => $snap['mins'],
                    'work_date'                  => $snap['work_date'],
                    'activity_type'              => $snap['activity'],
                    'is_billable'                => $snap['is_billable'],
                    'notes'                      => $overflowNotes,
                    'task_id'                    => $snap['task_id'],
                ]);
                $failReason = null;
                $stopped    = $this->entries->stopTimerWithValidation($service, $entryId, $actorId, $body, $rid, $failReason);
                if ($stopped === null) {
                    $db->rollBack();
                    if ($failReason === 'timesheet_cap_exceeded') {
                        $this->error('Could not stop timer (cap).', 422, [], array_merge($eval, ['code' => 'timesheet_cap_exceeded']));
                    }
                    $this->error(
                        'Cannot stop timer. Ensure this timer is running for your user and the service/task is open.',
                        422
                    );
                }
                $overflow->insertAudit($rid, 'submitted', $actorId, ['timer_stop' => true]);
                $db->commit();
                $this->notifySuperadminsTimesheetOverflow($rid, $service, $snap['mins']);
                $this->success($stopped, 'Timer stopped; pending superadmin approval for over-cap time.');
            } catch (\Throwable $e) {
                $db->rollBack();
                throw $e;
            }
        }

        $failReason = null;
        $stopped    = $this->entries->stopTimerWithValidation($service, $entryId, $actorId, $body, null, $failReason);
        if ($stopped === null) {
            if ($failReason === 'timesheet_cap_exceeded') {
                $this->error(
                    'Stopping would exceed the allowance (3 × standard hours).',
                    422,
                    [],
                    array_merge($eval, ['code' => 'timesheet_cap_exceeded'])
                );
            }
            $this->error(
                'Cannot stop timer. Ensure this timer is running for your user and the service/task is open.',
                422
            );
        }
        $this->success($stopped, 'Timer stopped');
    }

    // ── POST /api/admin/services/:id/time-entries/:entryId/request-modify-otp ─

    /**
     * Email the super admin an OTP containing full change details.
     * Body: { proposed_values: { work_date?, duration_minutes?, activity_type?, is_billable?, notes? }, reason: string }
     */
    public function requestModifyOtp(int $id, int $entryId): never
    {
        $service = $this->services->find($id);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }

        $entry = $this->entries->find($entryId);
        if ($entry === null || (int)$entry['service_id'] !== $id) {
            $this->error('Time entry not found.', 404);
        }

        $actor   = $this->authUser();
        $actorId = $actor ? (int)$actor['id'] : 0;
        if ($actorId <= 0) {
            $this->error('Unauthorized.', 401);
        }

        $body     = $this->getJsonBody();
        $proposed = is_array($body['proposed_values'] ?? null) ? $body['proposed_values'] : [];
        $reason   = trim((string)($body['reason'] ?? ''));
        if ($reason === '') {
            $this->error('A reason is required to request a timesheet modification OTP.', 422);
        }

        $users = new UserModel();
        $super = $users->findByEmail(AuthConfig::SUPER_ADMIN_EMAIL);
        if ($super === null || !$super['is_active']) {
            $this->error('Super admin account is not provisioned.', 500);
        }
        $superId    = (int)$super['id'];
        $superEmail = trim((string)($super['email'] ?? ''));
        if ($superEmail === '') {
            $this->error('Super admin has no email configured.', 500);
        }

        $otp = OtpService::generate($superId);

        $oldBillable = !empty($entry['is_billable']) ? 'Yes' : 'No';
        $newBillable = isset($proposed['is_billable'])
            ? ($proposed['is_billable'] ? 'Yes' : 'No')
            : '(unchanged)';

        $htmlBody = BrevoMailer::renderTemplate('timeentry-modify-otp', [
            'userName'      => (string)($super['name'] ?? $superEmail),
            'otpCode'       => $otp,
            'expiryMinutes' => (string)OtpService::expiryMinutes(),
            'entryId'       => (string)$entryId,
            'serviceType'   => (string)($service['service_type'] ?? '—'),
            'clientName'    => (string)($service['client_name'] ?? '—'),
            'requesterName' => (string)($actor['name'] ?? $actor['email'] ?? 'Unknown'),
            'oldDate'       => (string)($entry['work_date'] ?? '—'),
            'oldDuration'   => (string)($entry['duration_minutes'] ?? '—'),
            'oldActivity'   => str_replace('_', ' ', (string)($entry['activity_type'] ?? '—')),
            'oldBillable'   => $oldBillable,
            'oldNotes'      => (string)($entry['notes'] ?? ''),
            'newDate'       => isset($proposed['work_date']) ? (string)$proposed['work_date'] : '(unchanged)',
            'newDuration'   => isset($proposed['duration_minutes']) ? (string)$proposed['duration_minutes'] : '(unchanged)',
            'newActivity'   => isset($proposed['activity_type']) ? str_replace('_', ' ', (string)$proposed['activity_type']) : '(unchanged)',
            'newBillable'   => $newBillable,
            'newNotes'      => isset($proposed['notes']) ? (string)$proposed['notes'] : '(unchanged)',
            'reason'        => htmlspecialchars($reason, ENT_QUOTES, 'UTF-8'),
        ]);

        if ($htmlBody !== '') {
            BrevoMailer::send(
                $superEmail,
                (string)($super['name'] ?? $superEmail),
                'Timesheet Modification Approval — Entry #' . $entryId,
                $htmlBody
            );
        }

        $this->success(null, 'OTP sent to super admin email.');
    }

    // ── PATCH /api/admin/services/:id/time-entries/:entryId ──────────────────

    public function updateForService(int $id, int $entryId): never
    {
        $service = $this->services->find($id);
        if ($service === null) {
            $this->error('Service not found.', 404);
        }

        $existingEntry = $this->entries->find($entryId);
        if ($existingEntry === null || (int)$existingEntry['service_id'] !== $id) {
            $this->error('Time entry not found.', 404);
        }

        $isToday = ($existingEntry['work_date'] ?? '') === date('Y-m-d');

        if (!$isToday) {
            $otp = $this->readSuperadminOtpFromRequest();
            if ($otp === '' || !$this->verifySuperadminOtp($otp)) {
                $this->error(
                    'A valid superadmin OTP is required to modify a past timesheet entry. Request a code first.',
                    403
                );
            }
        }

        $body = $this->getJsonBody();
        $actor = $this->authUser();
        $actorId = $actor ? (int)$actor['id'] : 0;
        if ($actorId <= 0) {
            $this->error('Unauthorized.', 401);
        }

        $oldDur = (int)($existingEntry['duration_minutes'] ?? 0);
        $newDur = array_key_exists('duration_minutes', $body) ? (int)$body['duration_minutes'] : $oldDur;

        if ($newDur > $oldDur) {
            $eval = TimesheetEngagementCap::evaluateAppend($id, $service, $newDur, $entryId, $entryId);
            $want = !empty($body['request_overflow_approval']);
            if ($eval['has_cap'] && $eval['would_exceed'] && !$want) {
                $this->error(
                    'Updated duration would exceed the allowance (3 × standard hours). Reduce minutes or request superadmin approval.',
                    422,
                    [],
                    array_merge($eval, ['code' => 'timesheet_cap_exceeded'])
                );
            }
            if ($eval['has_cap'] && $eval['would_exceed'] && $want) {
                $workDate = array_key_exists('work_date', $body)
                    ? trim((string)$body['work_date'])
                    : trim((string)($existingEntry['work_date'] ?? ''));
                if ($workDate === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $workDate)) {
                    $this->error('work_date must be YYYY-MM-DD.', 422);
                }
                $activity = array_key_exists('activity_type', $body)
                    ? strtolower(trim((string)$body['activity_type']))
                    : strtolower(trim((string)($existingEntry['activity_type'] ?? '')));
                if (!in_array($activity, TimeEntryModel::ACTIVITY_TYPES, true)) {
                    $this->error('Invalid activity_type.', 422);
                }
                $taskId = array_key_exists('task_id', $body)
                    ? (($body['task_id'] !== '' && $body['task_id'] !== null) ? trim((string)$body['task_id']) : null)
                    : ($existingEntry['task_id'] ?? null);
                if ($taskId !== null && !$this->entries->isTaskOpen($service, (string)$taskId)) {
                    $this->error('Selected task is not open.', 422);
                }
                $isBillable = array_key_exists('is_billable', $body)
                    ? (bool)$body['is_billable']
                    : (bool)($existingEntry['is_billable'] ?? true);
                $notes = array_key_exists('notes', $body)
                    ? trim((string)$body['notes'])
                    : (($existingEntry['notes'] ?? null) !== null ? trim((string)$existingEntry['notes']) : null);
                if ($notes === '') {
                    $notes = null;
                }
                if (\App\Libraries\ApprovalReason::validateOverflowNotes($notes) !== null) {
                    $this->error(\App\Libraries\ApprovalReason::OVERFLOW_NOTES_MESSAGE, 422);
                }

                $overflow = new TimesheetOverflowRequestModel();
                $rid        = $overflow->create([
                    'service_id'                 => $id,
                    'user_id'                    => (int)$existingEntry['user_id'],
                    'time_entry_id'              => $entryId,
                    'source_kind'                => 'entry_edit',
                    'duration_minutes_requested' => $newDur,
                    'work_date'                  => $workDate,
                    'activity_type'              => $activity,
                    'is_billable'                => $isBillable,
                    'notes'                      => $notes,
                    'task_id'                    => $taskId,
                ]);
                $overflow->insertAudit($rid, 'submitted', $actorId, ['entry_edit' => $entryId]);
                $this->notifySuperadminsTimesheetOverflow($rid, $service, $newDur);

                $this->success(
                    [
                        'overflow_request_id' => $rid,
                        'status'              => 'pending_superadmin',
                        'evaluation'          => $eval,
                    ],
                    'Timesheet change pending superadmin approval.',
                    202
                );
            }
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
     * @param array<string, mixed> $service
     */
    private function notifySuperadminsTimesheetOverflow(int $requestId, array $service, int $minutes): void
    {
        $uids = (new UserModel())->idsHavingRoleNames(['super_admin']);
        $label = (string)($service['service_type'] ?? 'Service') . ' · ' . (string)($service['client_name'] ?? '');
        $body  = "Request #{$requestId}: {$minutes} min over engagement cap — {$label}";
        if ($uids !== []) {
            try {
                (new UserNotificationModel())->createForUsers(
                    $uids,
                    'timesheet_overflow',
                    'Timesheet overflow approval',
                    $body,
                    'timesheet_overflow_request',
                    $requestId
                );
            } catch (\Throwable $e) {
                error_log('[TimeEntryController] overflow notify: ' . $e->getMessage());
            }
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

    /**
     * @return array{0: int, 1: bool, 2: ?int}
     */
    private function resolveServiceVisibilityContext(?int $requestedScopeUserId = null): array
    {
        $actor = $this->authUser();
        $actorUserId = $actor ? (int)($actor['id'] ?? 0) : 0;
        if ($actorUserId <= 0) {
            $this->error('Unauthorized.', 401);
        }
        $isSuperAdmin = $this->isSuperAdminEmail((string)($actor['email'] ?? ''));
        $scopeUserId = null;
        if ($isSuperAdmin && $requestedScopeUserId !== null && $requestedScopeUserId > 0) {
            $scopeUserId = $requestedScopeUserId;
        }

        return [$actorUserId, $isSuperAdmin, $scopeUserId];
    }
}


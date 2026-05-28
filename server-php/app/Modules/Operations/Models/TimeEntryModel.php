<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Libraries\OfficeWorkingDays;
use App\Libraries\TimesheetEngagementCap;
use PDO;

/**
 * Time entries on service engagements (optionally linked to an open task).
 */
class TimeEntryModel
{
    public const SHIFT_TARGET_MINUTES = 510;

    public const ACTIVITY_TYPES = [
        'client_work',
        'internal_review',
        'documentation',
        'coordination',
        'research',
        'compliance_prep',
        'other',
    ];

    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT te.*, u.name AS user_name,
                    s.service_type,
                    COALESCE(c.organization_name,
                             NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                             o.name,
                             s.client_name,
                             'Unknown') AS client_name
             FROM time_entries te
             JOIN users u ON u.id = te.user_id
             JOIN services s ON s.id = te.service_id
             LEFT JOIN clients c ON c.id = s.client_id
             LEFT JOIN organizations o ON o.id = s.organization_id
             WHERE te.id = :id
             LIMIT 1"
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listForService(int $serviceId): array
    {
        $stmt = $this->db->prepare(
            "SELECT te.*, u.name AS user_name,
                    s.service_type,
                    COALESCE(c.organization_name,
                             NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                             o.name,
                             s.client_name,
                             'Unknown') AS client_name,
                    tor.status AS overflow_request_status,
                    tor.decision_notes AS overflow_decision_notes
             FROM time_entries te
             JOIN users u ON u.id = te.user_id
             JOIN services s ON s.id = te.service_id
             LEFT JOIN clients c ON c.id = s.client_id
             LEFT JOIN organizations o ON o.id = s.organization_id
             LEFT JOIN timesheet_overflow_requests tor ON tor.id = te.cap_overflow_request_id
             WHERE te.service_id = :sid
             ORDER BY te.work_date DESC, te.id DESC"
        );
        $stmt->execute([':sid' => $serviceId]);

        return $stmt->fetchAll();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getActiveForUser(int $userId): ?array
    {
        if ($userId <= 0) {
            return null;
        }
        $stmt = $this->db->prepare(
            "SELECT te.*, u.name AS user_name,
                    s.service_type,
                    COALESCE(c.organization_name,
                             NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                             o.name,
                             s.client_name,
                             'Unknown') AS client_name
             FROM time_entries te
             JOIN users u ON u.id = te.user_id
             JOIN services s ON s.id = te.service_id
             LEFT JOIN clients c ON c.id = s.client_id
             LEFT JOIN organizations o ON o.id = s.organization_id
             WHERE te.user_id = :uid AND te.timer_status = :status
             ORDER BY te.id DESC
             LIMIT 1"
        );
        $stmt->execute([
            ':uid' => $userId,
            ':status' => 'running',
        ]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * @param array<string, mixed> $service Row from ServiceModel::find
     * @param array<string, mixed> $data user_id, service_id, task_id?, work_date, duration_minutes, activity_type, is_billable, notes?
     *
     * @return array<string, mixed>|null New row or null on validation failure
     */
    public function createWithValidation(array $service, array $data): ?array
    {
        if ($this->isServiceClosedForTime($service)) {
            return null;
        }

        $userId = (int)($data['user_id'] ?? 0);
        if ($userId <= 0) {
            return null;
        }

        $taskId = isset($data['task_id']) && $data['task_id'] !== '' && $data['task_id'] !== null
            ? trim((string)$data['task_id'])
            : null;

        if ($taskId !== null && !$this->isTaskOpen($service, $taskId)) {
            return null;
        }

        $workDate = trim((string)($data['work_date'] ?? ''));
        if ($workDate === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $workDate)) {
            return null;
        }

        $duration = (int)($data['duration_minutes'] ?? 0);
        if ($duration <= 0 || $duration > 1440) {
            return null;
        }

        $activity = strtolower(trim((string)($data['activity_type'] ?? '')));
        if (!in_array($activity, self::ACTIVITY_TYPES, true)) {
            return null;
        }

        $isBillable = array_key_exists('is_billable', $data)
            ? (bool)$data['is_billable']
            : true;

        $notes = isset($data['notes']) ? trim((string)$data['notes']) : null;
        if ($notes === '') {
            $notes = null;
        }

        $serviceId = (int)($service['id'] ?? 0);
        if ($serviceId <= 0) {
            return null;
        }

        $stmt = $this->db->prepare(
            'INSERT INTO time_entries (
                user_id, service_id, task_id, work_date, duration_minutes,
                activity_type, is_billable, notes, timer_status, source
             ) VALUES (
                :uid, :sid, :task_id, :work_date, :dur,
                :activity, :billable, :notes, :timer_status, :source
             ) RETURNING id'
        );
        $stmt->execute([
            ':uid'      => $userId,
            ':sid'      => $serviceId,
            ':task_id'  => $taskId,
            ':work_date'=> $workDate,
            ':dur'      => $duration,
            ':activity' => $activity,
            ':billable' => $isBillable,
            ':notes'    => $notes,
            ':timer_status' => 'submitted',
            ':source' => 'manual',
        ]);
        $newId = (int)$stmt->fetchColumn();

        return $this->find($newId);
    }

    /**
     * @param array<string, mixed> $service
     * @param array<string, mixed> $data user_id, task_id?, activity_type, is_billable?, notes?
     *
     * @return array<string, mixed>|null
     */
    public function startTimerWithValidation(array $service, array $data): ?array
    {
        if ($this->isServiceClosedForTime($service)) {
            return null;
        }
        $userId = (int)($data['user_id'] ?? 0);
        if ($userId <= 0) {
            return null;
        }
        if ($this->getActiveForUser($userId) !== null) {
            return null;
        }
        $taskId = isset($data['task_id']) && $data['task_id'] !== '' && $data['task_id'] !== null
            ? trim((string)$data['task_id'])
            : null;
        if ($taskId !== null && !$this->isTaskOpen($service, $taskId)) {
            return null;
        }
        $activity = strtolower(trim((string)($data['activity_type'] ?? 'client_work')));
        if (!in_array($activity, self::ACTIVITY_TYPES, true)) {
            return null;
        }
        $isBillable = array_key_exists('is_billable', $data)
            ? (bool)$data['is_billable']
            : true;
        $notes = isset($data['notes']) ? trim((string)$data['notes']) : null;
        if ($notes === '') {
            $notes = null;
        }
        $serviceId = (int)($service['id'] ?? 0);
        if ($serviceId <= 0) {
            return null;
        }
        $now = gmdate('Y-m-d H:i:sP');
        $workDate = gmdate('Y-m-d');

        $stmt = $this->db->prepare(
            'INSERT INTO time_entries (
                user_id, service_id, task_id, work_date, duration_minutes,
                activity_type, is_billable, notes, started_at, ended_at, timer_status, source
             ) VALUES (
                :uid, :sid, :task_id, :work_date, :dur,
                :activity, :billable, :notes, :started_at, NULL, :timer_status, :source
             ) RETURNING id'
        );
        $stmt->execute([
            ':uid'      => $userId,
            ':sid'      => $serviceId,
            ':task_id'  => $taskId,
            ':work_date'=> $workDate,
            ':dur'      => 1,
            ':activity' => $activity,
            ':billable' => $isBillable,
            ':notes'    => $notes,
            ':started_at' => $now,
            ':timer_status' => 'running',
            ':source' => 'timer',
        ]);
        $newId = (int)$stmt->fetchColumn();

        return $this->find($newId);
    }

    /**
     * Snapshot for stopping a running timer (duration, dates, fields) — null if validation fails.
     *
     * @param array<string, mixed> $service
     * @param array<string, mixed> $data
     * @return array{
     *   mins:int,end_at:string,work_date:string,task_id:?string,activity:string,
     *   is_billable:bool,notes:?string
     * }|null
     */
    public function snapshotTimerStop(array $service, int $entryId, int $actorUserId, array $data): ?array
    {
        if ($this->isServiceClosedForTime($service)) {
            return null;
        }
        $row = $this->find($entryId);
        if ($row === null || (int)$row['service_id'] !== (int)$service['id']) {
            return null;
        }
        if ((int)$row['user_id'] !== $actorUserId) {
            return null;
        }
        if ((string)($row['timer_status'] ?? '') !== 'running') {
            return null;
        }
        $taskId = isset($data['task_id']) && $data['task_id'] !== '' && $data['task_id'] !== null
            ? trim((string)$data['task_id'])
            : ($row['task_id'] ?? null);
        if ($taskId !== null && !$this->isTaskOpen($service, (string)$taskId)) {
            return null;
        }
        $activity = isset($data['activity_type'])
            ? strtolower(trim((string)$data['activity_type']))
            : strtolower(trim((string)($row['activity_type'] ?? 'client_work')));
        if (!in_array($activity, self::ACTIVITY_TYPES, true)) {
            return null;
        }
        $isBillable = array_key_exists('is_billable', $data)
            ? (bool)$data['is_billable']
            : (bool)($row['is_billable'] ?? true);
        $notes = array_key_exists('notes', $data)
            ? trim((string)$data['notes'])
            : (($row['notes'] ?? null) !== null ? trim((string)$row['notes']) : null);
        if ($notes === '') {
            $notes = null;
        }
        $startTs = isset($row['started_at']) ? strtotime((string)$row['started_at']) : false;
        if ($startTs === false) {
            return null;
        }
        $endTs = time();

        $midnightTs = mktime(
            0, 0, 0,
            (int)date('n', $startTs),
            (int)date('j', $startTs) + 1,
            (int)date('Y', $startTs)
        );
        if ($endTs > $midnightTs) {
            $endTs = $midnightTs;
        }

        $mins = (int)floor(($endTs - $startTs) / 60);
        if ($mins < 1) {
            $mins = 1;
        }
        $endAt = gmdate('Y-m-d H:i:sP', $endTs);
        $workDate = date('Y-m-d', $startTs);

        return [
            'mins'        => $mins,
            'end_at'      => $endAt,
            'work_date'   => $workDate,
            'task_id'     => $taskId,
            'activity'    => $activity,
            'is_billable' => $isBillable,
            'notes'       => $notes,
        ];
    }

    /**
     * @param array<string, mixed> $service
     * @param array<string, mixed> $data activity_type?, is_billable?, task_id?, notes?
     *
     * @return array<string, mixed>|null
     */
    public function stopTimerWithValidation(
        array $service,
        int $entryId,
        int $actorUserId,
        array $data = [],
        ?int $attachOverflowRequestId = null,
        ?string &$failureReason = null
    ): ?array {
        $failureReason = null;
        $snap = $this->snapshotTimerStop($service, $entryId, $actorUserId, $data);
        if ($snap === null) {
            return null;
        }
        $serviceId = (int)$service['id'];
        $eval      = TimesheetEngagementCap::evaluateAppend(
            $serviceId,
            $service,
            $snap['mins'],
            $entryId,
            null
        );
        if ($eval['has_cap'] && $eval['would_exceed'] && $attachOverflowRequestId === null) {
            $failureReason = 'timesheet_cap_exceeded';

            return null;
        }

        $capSql = '';
        $exec   = [
            ':ended_at'   => $snap['end_at'],
            ':dur'        => $snap['mins'],
            ':work_date'  => $snap['work_date'],
            ':task_id'    => $snap['task_id'],
            ':activity'   => $snap['activity'],
            ':billable'   => $snap['is_billable'],
            ':notes'      => $snap['notes'],
            ':status'     => 'stopped',
            ':id'         => $entryId,
        ];
        if ($attachOverflowRequestId !== null && $attachOverflowRequestId > 0) {
            $capSql                      = ', cap_overflow_request_id = :corid';
            $exec[':corid']              = $attachOverflowRequestId;
        }

        $stmt = $this->db->prepare(
            "UPDATE time_entries
             SET ended_at = :ended_at,
                 duration_minutes = :dur,
                 work_date = :work_date,
                 task_id = :task_id,
                 activity_type = :activity,
                 is_billable = :billable,
                 notes = :notes,
                 timer_status = :status,
                 updated_at = NOW()
                 {$capSql}
             WHERE id = :id"
        );
        $stmt->execute($exec);

        return $this->find($entryId);
    }

    /**
     * Apply fields after superadmin approved an entry_edit overflow request (no past-date OTP gate).
     *
     * @param array<string, mixed> $service
     * @param array<string, mixed> $data duration_minutes, work_date, activity_type, is_billable, notes?, task_id?, timer_status?
     *
     * @return array<string, mixed>|null
     */
    public function applyOverflowApprovedEdit(array $service, int $entryId, array $data): ?array
    {
        if ($this->isServiceClosedForTime($service)) {
            return null;
        }
        $row = $this->find($entryId);
        if ($row === null || (int)$row['service_id'] !== (int)$service['id']) {
            return null;
        }
        if ((string)($row['timer_status'] ?? '') === 'running') {
            return null;
        }

        $duration = (int)($data['duration_minutes'] ?? 0);
        if ($duration <= 0 || $duration > 1440) {
            return null;
        }
        $workDate = trim((string)($data['work_date'] ?? ''));
        if ($workDate === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $workDate)) {
            return null;
        }
        $taskId = isset($data['task_id']) && $data['task_id'] !== '' && $data['task_id'] !== null
            ? trim((string)$data['task_id'])
            : null;
        if ($taskId !== null && !$this->isTaskOpen($service, (string)$taskId)) {
            return null;
        }
        $activity = strtolower(trim((string)($data['activity_type'] ?? '')));
        if (!in_array($activity, self::ACTIVITY_TYPES, true)) {
            return null;
        }
        $isBillable = array_key_exists('is_billable', $data)
            ? (bool)$data['is_billable']
            : (bool)$row['is_billable'];
        $notes = isset($data['notes']) ? trim((string)$data['notes']) : null;
        if ($notes === '') {
            $notes = null;
        }
        $timerStatus = strtolower(trim((string)($data['timer_status'] ?? 'submitted')));
        if (!in_array($timerStatus, ['stopped', 'submitted'], true)) {
            return null;
        }

        $stmt = $this->db->prepare(
            'UPDATE time_entries
             SET work_date = :work_date,
                 duration_minutes = :dur,
                 task_id = :task_id,
                 activity_type = :activity,
                 is_billable = :billable,
                 notes = :notes,
                 timer_status = :timer_status,
                 cap_overflow_request_id = NULL,
                 updated_at = NOW()
             WHERE id = :id'
        );
        $stmt->execute([
            ':work_date'    => $workDate,
            ':dur'          => $duration,
            ':task_id'      => $taskId,
            ':activity'     => $activity,
            ':billable'     => $isBillable,
            ':notes'        => $notes,
            ':timer_status' => $timerStatus,
            ':id'           => $entryId,
        ]);

        return $this->find($entryId);
    }

    public function deleteById(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM time_entries WHERE id = :id');

        return $stmt->execute([':id' => $id]);
    }

    /** After superadmin approves a timer_stop overflow — optional duration tweak already on row. */
    public function clearOverflowLinkSetDuration(int $entryId, int $durationMinutes): void
    {
        $stmt = $this->db->prepare(
            'UPDATE time_entries
             SET duration_minutes = :dur, cap_overflow_request_id = NULL, updated_at = NOW()
             WHERE id = :id'
        );
        $stmt->execute([':dur' => $durationMinutes, ':id' => $entryId]);
    }

    /**
     * @param array<string, mixed> $service
     * @param array<string, mixed> $data
     *
     * @return array<string, mixed>|null
     */
    public function updateWithValidation(array $service, int $entryId, int $actorUserId, bool $canManageAll, array $data): ?array
    {
        if ($this->isServiceClosedForTime($service)) {
            return null;
        }
        $row = $this->find($entryId);
        if ($row === null || (int)$row['service_id'] !== (int)$service['id']) {
            return null;
        }
        if ((int)$row['user_id'] !== $actorUserId && !$canManageAll) {
            return null;
        }
        if ((string)($row['timer_status'] ?? '') === 'running') {
            return null;
        }

        $duration = array_key_exists('duration_minutes', $data)
            ? (int)$data['duration_minutes']
            : (int)$row['duration_minutes'];
        if ($duration <= 0 || $duration > 1440) {
            return null;
        }
        $workDate = array_key_exists('work_date', $data)
            ? trim((string)$data['work_date'])
            : trim((string)$row['work_date']);
        if ($workDate === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $workDate)) {
            return null;
        }
        $taskId = array_key_exists('task_id', $data)
            ? (($data['task_id'] !== '' && $data['task_id'] !== null) ? trim((string)$data['task_id']) : null)
            : ($row['task_id'] ?? null);
        if ($taskId !== null && !$this->isTaskOpen($service, (string)$taskId)) {
            return null;
        }
        $activity = array_key_exists('activity_type', $data)
            ? strtolower(trim((string)$data['activity_type']))
            : strtolower(trim((string)$row['activity_type']));
        if (!in_array($activity, self::ACTIVITY_TYPES, true)) {
            return null;
        }
        $isBillable = array_key_exists('is_billable', $data)
            ? (bool)$data['is_billable']
            : (bool)$row['is_billable'];
        $notes = array_key_exists('notes', $data)
            ? trim((string)$data['notes'])
            : (($row['notes'] ?? null) !== null ? trim((string)$row['notes']) : null);
        if ($notes === '') {
            $notes = null;
        }
        $timerStatus = array_key_exists('timer_status', $data)
            ? strtolower(trim((string)$data['timer_status']))
            : strtolower(trim((string)($row['timer_status'] ?? 'submitted')));
        if (!in_array($timerStatus, ['stopped', 'submitted'], true)) {
            return null;
        }

        $stmt = $this->db->prepare(
            'UPDATE time_entries
             SET work_date = :work_date,
                 duration_minutes = :dur,
                 task_id = :task_id,
                 activity_type = :activity,
                 is_billable = :billable,
                 notes = :notes,
                 timer_status = :timer_status,
                 updated_at = NOW()
             WHERE id = :id'
        );
        $stmt->execute([
            ':work_date' => $workDate,
            ':dur' => $duration,
            ':task_id' => $taskId,
            ':activity' => $activity,
            ':billable' => $isBillable,
            ':notes' => $notes,
            ':timer_status' => $timerStatus,
            ':id' => $entryId,
        ]);

        return $this->find($entryId);
    }

    /**
     * @param array<string, mixed> $service
     */
    public function isServiceClosedForTime(array $service): bool
    {
        $st = strtolower((string)($service['status'] ?? ''));
        if (in_array($st, ['completed', 'cancelled'], true)) {
            return true;
        }
        $bc = strtolower((string)($service['billing_closure'] ?? ''));
        if (in_array($bc, ['built', 'non_billable'], true)) {
            return true;
        }

        return false;
    }

    /**
     * @param array<string, mixed> $service
     */
    public function isTaskOpen(array $service, string $taskId): bool
    {
        $tasks = $this->decodeTasks($service['tasks'] ?? []);
        foreach ($tasks as $t) {
            if (!is_array($t)) {
                continue;
            }
            $id = isset($t['id']) ? (string)$t['id'] : '';
            if ($id !== $taskId) {
                continue;
            }
            $st = isset($t['status']) ? (string)$t['status'] : '';

            return $st !== 'done';
        }

        return false;
    }

    /**
     * After billing is marked built: persist planned vs actual metrics and return summary for UI.
     *
     * @return array{
     *   invoiced_subtotal: float,
     *   billable_hours: float,
     *   non_billable_hours: float,
     *   planned_value_at_user_rates: float,
     *   avg_achieved_rate_per_hour: float|null,
     *   is_below_planned: bool,
     *   variance_amount: float
     * }
     */
    public function finalizeBillingSnapshot(int $serviceId, float $invoicedSubtotal): array
    {
        $stmt = $this->db->prepare(
            "SELECT te.user_id,
                    SUM(te.duration_minutes) FILTER (WHERE te.is_billable) AS billable_mins,
                    SUM(te.duration_minutes) FILTER (WHERE NOT te.is_billable) AS non_billable_mins
             FROM time_entries te
             WHERE te.service_id = :sid
               AND te.timer_status <> :running
             GROUP BY te.user_id"
        );
        $stmt->execute([':sid' => $serviceId, ':running' => 'running']);
        $perUser = $stmt->fetchAll();

        $billableHoursTotal = 0.0;
        $nonBillableHoursTotal = 0.0;
        $plannedValue = 0.0;

        foreach ($perUser as $row) {
            $uid = (int)$row['user_id'];
            $bm  = (float)($row['billable_mins'] ?? 0);
            $nbm = (float)($row['non_billable_mins'] ?? 0);
            $bh  = round($bm / 60.0, 4);
            $nbh = round($nbm / 60.0, 4);
            $billableHoursTotal += $bh;
            $nonBillableHoursTotal += $nbh;

            $uStmt = $this->db->prepare(
                'SELECT COALESCE(planned_billable_rate_per_hour, 0)::float AS rate
                 FROM users WHERE id = :id LIMIT 1'
            );
            $uStmt->execute([':id' => $uid]);
            $rate = (float)$uStmt->fetchColumn();
            $plannedValue += $bh * $rate;
        }

        $plannedValue       = round($plannedValue, 2);
        $invoicedSubtotal   = round($invoicedSubtotal, 2);
        $variance           = round($plannedValue - $invoicedSubtotal, 2);
        $isBelow            = $plannedValue > 0 && $invoicedSubtotal < $plannedValue - 0.005;

        $avgAchieved = null;
        if ($billableHoursTotal > 0.0001) {
            $avgAchieved = round($invoicedSubtotal / $billableHoursTotal, 2);
        }

        $uStmt = $this->db->prepare(
            'UPDATE services SET
                billing_planned_value_at_close = :pv,
                billing_billable_hours_at_close = :bh,
                billing_avg_achieved_rate_per_hour = :ar,
                updated_at = NOW()
             WHERE id = :id'
        );
        $uStmt->execute([
            ':pv' => $plannedValue,
            ':bh' => $billableHoursTotal,
            ':ar' => $avgAchieved,
            ':id' => $serviceId,
        ]);

        return [
            'invoiced_subtotal'             => $invoicedSubtotal,
            'billable_hours'                => round($billableHoursTotal, 4),
            'non_billable_hours'            => round($nonBillableHoursTotal, 4),
            'planned_value_at_user_rates'   => $plannedValue,
            'avg_achieved_rate_per_hour'    => $avgAchieved,
            'is_below_planned'              => $isBelow,
            'variance_amount'               => $variance,
        ];
    }

    /**
     * Daily user-wise punched summary with billable/non-billable split.
     *
     * @return array<int, array<string, mixed>>
     */
    public function listDailyUserPunchedSummary(string $workDate): array
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $workDate)) {
            return [];
        }

        $stmt = $this->db->prepare(
            "SELECT
                u.id AS user_id,
                COALESCE(NULLIF(TRIM(u.name), ''), TRIM(u.email), 'User') AS user_name,
                TRIM(u.email) AS user_email,
                u.shift_target_minutes,
                COALESCE(u.shift_target_disabled, FALSE) AS shift_target_disabled,
                (CASE WHEN COALESCE(u.shift_target_disabled, FALSE) THEN 0 ELSE u.shift_target_minutes END) AS effective_shift_target_minutes,
                COALESCE(SUM(te.duration_minutes) FILTER (WHERE te.is_billable), 0) AS billable_minutes,
                COALESCE(SUM(te.duration_minutes) FILTER (WHERE NOT te.is_billable), 0) AS non_billable_minutes,
                COALESCE(SUM(te.duration_minutes), 0) AS total_punched_minutes,
                GREATEST(0, (CASE WHEN COALESCE(u.shift_target_disabled, FALSE) THEN 0 ELSE u.shift_target_minutes END) - COALESCE(SUM(te.duration_minutes), 0)) AS idle_minutes
            FROM users u
            LEFT JOIN time_entries te
                ON te.user_id = u.id
               AND te.work_date = :work_date
               AND te.timer_status <> :running
            WHERE u.is_active = TRUE
              AND TRIM(COALESCE(u.email, '')) <> ''
            GROUP BY u.id, u.name, u.email, u.shift_target_minutes, u.shift_target_disabled
            ORDER BY u.name ASC, u.id ASC"
        );
        $stmt->execute([
            ':work_date' => $workDate,
            ':running'   => 'running',
        ]);

        return $stmt->fetchAll();
    }

    /**
     * Per-user punch totals vs shift target over an inclusive date range.
     * Target minutes = (working day count) × shift target (same user set as daily super-admin report).
     * Working days exclude configured weekly off days and office holidays.
     *
     * @return array<int, array<string, mixed>>
     */
    public function listShiftTargetSummaryForDateRange(
        string $dateFrom,
        string $dateTo,
        ?int $filterUserId
    ): array {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) {
            return [];
        }
        try {
            $from = new \DateTimeImmutable($dateFrom);
            $to = new \DateTimeImmutable($dateTo);
        } catch (\Exception) {
            return [];
        }
        if ($to < $from) {
            return [];
        }
        $dayCount = OfficeWorkingDays::countWorkingDays($this->db, $dateFrom, $dateTo);

        $uidClause = '';
        $params = [
            ':df'      => $dateFrom,
            ':dt'      => $dateTo,
            ':running' => 'running',
        ];
        if ($filterUserId !== null && $filterUserId > 0) {
            $uidClause = ' AND u.id = :filter_uid';
            $params[':filter_uid'] = $filterUserId;
        }

        $stmt = $this->db->prepare(
            "SELECT
                u.id AS user_id,
                COALESCE(NULLIF(TRIM(u.name), ''), TRIM(u.email), 'User') AS user_name,
                TRIM(u.email) AS user_email,
                u.shift_target_minutes,
                COALESCE(u.shift_target_disabled, FALSE) AS shift_target_disabled,
                (CASE WHEN COALESCE(u.shift_target_disabled, FALSE) THEN 0 ELSE u.shift_target_minutes END) AS effective_shift_target_minutes,
                ({$dayCount} * (CASE WHEN COALESCE(u.shift_target_disabled, FALSE) THEN 0 ELSE u.shift_target_minutes END)) AS total_target_minutes,
                COALESCE(SUM(te.duration_minutes) FILTER (WHERE te.is_billable), 0) AS billable_minutes,
                COALESCE(SUM(te.duration_minutes) FILTER (WHERE NOT te.is_billable), 0) AS non_billable_minutes,
                COALESCE(SUM(te.duration_minutes), 0) AS total_punched_minutes,
                GREATEST(0, ({$dayCount} * (CASE WHEN COALESCE(u.shift_target_disabled, FALSE) THEN 0 ELSE u.shift_target_minutes END)) - COALESCE(SUM(te.duration_minutes), 0)) AS deficit_minutes,
                (CASE WHEN COALESCE(u.shift_target_disabled, FALSE) THEN 0 ELSE GREATEST(0, COALESCE(SUM(te.duration_minutes), 0) - ({$dayCount} * u.shift_target_minutes)) END) AS overtime_minutes
            FROM users u
            LEFT JOIN time_entries te
                ON te.user_id = u.id
               AND te.work_date >= :df
               AND te.work_date <= :dt
               AND te.timer_status <> :running
            WHERE u.is_active = TRUE
              AND TRIM(COALESCE(u.email, '')) <> ''
              {$uidClause}
            GROUP BY u.id, u.name, u.email, u.shift_target_minutes, u.shift_target_disabled
            ORDER BY u.name ASC, u.id ASC"
        );
        $stmt->execute($params);

        return $stmt->fetchAll();
    }

    /**
     * Aggregated report for timesheets (per user, optional date range).
     *
     * @return array<int, array<string, mixed>>
     */
    public function reportByUserService(
        ?int $userId,
        string $dateFrom,
        string $dateTo,
        ?int $actorUserId = null,
        bool $isPrimarySuperAdmin = false,
        bool $canViewTeam = false,
        ?int $scopeUserId = null,
        bool $scopeAll = false
    ): array {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) {
            return [];
        }

        // client_name is a computed expression: PostgreSQL requires it to be aggregated
        // (or repeated verbatim in GROUP BY). MAX is safe here — one display name per group.
        $sql = "SELECT
                    te.user_id,
                    u.name AS user_name,
                    te.service_id,
                    s.service_type,
                    MAX(COALESCE(c.organization_name,
                        NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                        o.name,
                        s.client_name,
                        'Unknown')) AS client_name,
                    cg.id AS group_id,
                    cg.name AS group_name,
                    SUM(te.duration_minutes) FILTER (WHERE te.is_billable) AS billable_minutes,
                    SUM(te.duration_minutes) FILTER (WHERE NOT te.is_billable) AS non_billable_minutes
                FROM time_entries te
                JOIN users u ON u.id = te.user_id
                JOIN services s ON s.id = te.service_id
                LEFT JOIN clients c ON c.id = s.client_id
                LEFT JOIN organizations o ON o.id = s.organization_id
                LEFT JOIN client_groups cg ON cg.id = COALESCE(c.group_id, o.group_id)
                WHERE te.work_date >= :df AND te.work_date <= :dt
                  AND te.timer_status <> :running";

        $params = [':df' => $dateFrom, ':dt' => $dateTo, ':running' => 'running'];
        if ($userId !== null && $userId > 0) {
            $sql               .= ' AND te.user_id = :uid';
            $params[':uid'] = $userId;
        }
        $this->applyServiceVisibilityScope(
            $sql,
            $params,
            $actorUserId,
            $isPrimarySuperAdmin,
            $canViewTeam,
            $scopeUserId,
            $scopeAll,
            's'
        );
        $sql .= ' GROUP BY te.user_id, u.name, te.service_id, s.service_type,
                    c.organization_name, c.first_name, c.last_name, o.name, s.client_name,
                    cg.id, cg.name
                  ORDER BY u.name, te.service_id';

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll();
    }

    /**
     * 360-degree time-sheet analytics payload for dashboards and charts.
     *
     * @param array<string, mixed> $filters
     * @return array<string, mixed>
     */
    public function reportInsights(array $filters): array
    {
        $dateFrom = (string)($filters['date_from'] ?? '');
        $dateTo = (string)($filters['date_to'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) {
            return [
                'summary' => [],
                'series' => [],
                'breakdowns' => ['employees' => [], 'clients' => [], 'services' => [], 'financeByClient' => []],
                'table' => [],
            ];
        }

        $bucket = strtolower(trim((string)($filters['bucket'] ?? 'weekly')));
        $bucketExpr = match ($bucket) {
            'daily' => "te.work_date::date",
            'monthly' => "date_trunc('month', te.work_date::timestamp)::date",
            default => "date_trunc('week', te.work_date::timestamp)::date",
        };
        $bucketKey = match ($bucket) {
            'daily' => 'daily',
            'monthly' => 'monthly',
            default => 'weekly',
        };

        [$whereSql, $params] = $this->buildInsightsWhere(
            $filters,
            isset($filters['actor_user_id']) ? (int)$filters['actor_user_id'] : null,
            !empty($filters['is_primary_super_admin']),
            !empty($filters['can_view_team']),
            isset($filters['scope_user_id']) ? (int)$filters['scope_user_id'] : null,
            !empty($filters['scope_all'])
        );

        $summaryStmt = $this->db->prepare(
            "SELECT
                COALESCE(SUM(te.duration_minutes) FILTER (WHERE te.is_billable), 0) AS billable_minutes,
                COALESCE(SUM(te.duration_minutes) FILTER (WHERE NOT te.is_billable), 0) AS non_billable_minutes,
                COALESCE(SUM(
                    CASE WHEN te.is_billable
                        THEN (te.duration_minutes / 60.0) * COALESCE(u.planned_billable_rate_per_hour, 0)
                        ELSE 0
                    END
                ), 0) AS expected_billable
            FROM time_entries te
            JOIN users u ON u.id = te.user_id
            JOIN services s ON s.id = te.service_id
            LEFT JOIN clients c ON c.id = s.client_id
            LEFT JOIN organizations o ON o.id = s.organization_id
            LEFT JOIN client_groups cg ON cg.id = COALESCE(c.group_id, o.group_id)
            WHERE {$whereSql}"
        );
        $summaryStmt->execute($params);
        $summaryRow = $summaryStmt->fetch() ?: [];

        $financeStmt = $this->db->prepare(
            "WITH filtered_services AS (
                SELECT DISTINCT te.service_id
                FROM time_entries te
                JOIN services s ON s.id = te.service_id
                LEFT JOIN clients c ON c.id = s.client_id
                LEFT JOIN organizations o ON o.id = s.organization_id
                LEFT JOIN client_groups cg ON cg.id = COALESCE(c.group_id, o.group_id)
                WHERE {$whereSql}
            ),
            inv AS (
                SELECT t.service_id,
                       SUM(COALESCE(t.subtotal, t.amount, 0)) AS actual_billed
                FROM txn t
                JOIN filtered_services fs ON fs.service_id = t.service_id
                WHERE t.txn_type = 'invoice'
                  AND t.status = 'active'
                  AND (t.invoice_status IS NULL OR t.invoice_status <> 'cancelled')
                GROUP BY t.service_id
            ),
            rec AS (
                SELECT i.service_id,
                       SUM(r.amount) AS received
                FROM txn r
                JOIN txn i ON i.id = r.linked_txn_id
                JOIN filtered_services fs ON fs.service_id = i.service_id
                WHERE r.txn_type = 'receipt'
                  AND r.status = 'active'
                  AND i.txn_type = 'invoice'
                  AND i.status = 'active'
                GROUP BY i.service_id
            )
            SELECT
                COALESCE(SUM(inv.actual_billed), 0) AS actual_billed,
                COALESCE(SUM(rec.received), 0) AS received
            FROM filtered_services fs
            LEFT JOIN inv ON inv.service_id = fs.service_id
            LEFT JOIN rec ON rec.service_id = fs.service_id"
        );
        $financeStmt->execute($params);
        $financeRow = $financeStmt->fetch() ?: [];

        $seriesStmt = $this->db->prepare(
            "SELECT
                {$bucketExpr} AS bucket_start,
                COALESCE(SUM(te.duration_minutes) FILTER (WHERE te.is_billable), 0) AS billable_minutes,
                COALESCE(SUM(te.duration_minutes) FILTER (WHERE NOT te.is_billable), 0) AS non_billable_minutes,
                COALESCE(SUM(
                    CASE WHEN te.is_billable
                        THEN (te.duration_minutes / 60.0) * COALESCE(u.planned_billable_rate_per_hour, 0)
                        ELSE 0
                    END
                ), 0) AS expected_billable
            FROM time_entries te
            JOIN users u ON u.id = te.user_id
            JOIN services s ON s.id = te.service_id
            LEFT JOIN clients c ON c.id = s.client_id
            LEFT JOIN organizations o ON o.id = s.organization_id
            LEFT JOIN client_groups cg ON cg.id = COALESCE(c.group_id, o.group_id)
            WHERE {$whereSql}
            GROUP BY {$bucketExpr}
            ORDER BY {$bucketExpr} ASC"
        );
        $seriesStmt->execute($params);
        $seriesRows = $seriesStmt->fetchAll();

        $employeeStmt = $this->db->prepare(
            "SELECT
                te.user_id,
                u.name AS user_name,
                COALESCE(SUM(te.duration_minutes) FILTER (WHERE te.is_billable), 0) AS billable_minutes,
                COALESCE(SUM(te.duration_minutes) FILTER (WHERE NOT te.is_billable), 0) AS non_billable_minutes,
                COALESCE(SUM(
                    CASE WHEN te.is_billable
                        THEN (te.duration_minutes / 60.0) * COALESCE(u.planned_billable_rate_per_hour, 0)
                        ELSE 0
                    END
                ), 0) AS expected_billable
            FROM time_entries te
            JOIN users u ON u.id = te.user_id
            JOIN services s ON s.id = te.service_id
            LEFT JOIN clients c ON c.id = s.client_id
            LEFT JOIN organizations o ON o.id = s.organization_id
            LEFT JOIN client_groups cg ON cg.id = COALESCE(c.group_id, o.group_id)
            WHERE {$whereSql}
            GROUP BY te.user_id, u.name
            ORDER BY u.name ASC"
        );
        $employeeStmt->execute($params);
        $employeeRows = $employeeStmt->fetchAll();

        $clientStmt = $this->db->prepare(
            "SELECT
                COALESCE(c.id, o.id, 0) AS client_key_id,
                CASE WHEN c.id IS NOT NULL THEN 'contact' WHEN o.id IS NOT NULL THEN 'organization' ELSE 'unknown' END AS client_type,
                COALESCE(c.organization_name,
                    NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                    o.name,
                    s.client_name,
                    'Unknown') AS client_name,
                COALESCE(SUM(te.duration_minutes) FILTER (WHERE te.is_billable), 0) AS billable_minutes,
                COALESCE(SUM(te.duration_minutes) FILTER (WHERE NOT te.is_billable), 0) AS non_billable_minutes
            FROM time_entries te
            JOIN services s ON s.id = te.service_id
            LEFT JOIN clients c ON c.id = s.client_id
            LEFT JOIN organizations o ON o.id = s.organization_id
            LEFT JOIN client_groups cg ON cg.id = COALESCE(c.group_id, o.group_id)
            WHERE {$whereSql}
            GROUP BY c.id, o.id, c.organization_name, c.first_name, c.last_name, o.name, s.client_name
            ORDER BY client_name ASC"
        );
        $clientStmt->execute($params);
        $clientRows = $clientStmt->fetchAll();

        $serviceRows = $this->reportByUserService(
            isset($filters['user_id']) && (int)$filters['user_id'] > 0 ? (int)$filters['user_id'] : null,
            $dateFrom,
            $dateTo,
            isset($filters['actor_user_id']) ? (int)$filters['actor_user_id'] : null,
            !empty($filters['is_primary_super_admin']),
            !empty($filters['can_view_team']),
            isset($filters['scope_user_id']) ? (int)$filters['scope_user_id'] : null,
            !empty($filters['scope_all'])
        );

        $financeByClientStmt = $this->db->prepare(
            "WITH filtered_services AS (
                SELECT DISTINCT s.id AS service_id,
                    COALESCE(c.id, o.id, 0) AS client_key_id,
                    CASE WHEN c.id IS NOT NULL THEN 'contact' WHEN o.id IS NOT NULL THEN 'organization' ELSE 'unknown' END AS client_type,
                    COALESCE(c.organization_name,
                        NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                        o.name,
                        s.client_name,
                        'Unknown') AS client_name
                FROM time_entries te
                JOIN services s ON s.id = te.service_id
                LEFT JOIN clients c ON c.id = s.client_id
                LEFT JOIN organizations o ON o.id = s.organization_id
                LEFT JOIN client_groups cg ON cg.id = COALESCE(c.group_id, o.group_id)
                WHERE {$whereSql}
            ),
            inv AS (
                SELECT t.service_id,
                       SUM(COALESCE(t.subtotal, t.amount, 0)) AS actual_billed
                FROM txn t
                JOIN filtered_services fs ON fs.service_id = t.service_id
                WHERE t.txn_type = 'invoice'
                  AND t.status = 'active'
                  AND (t.invoice_status IS NULL OR t.invoice_status <> 'cancelled')
                GROUP BY t.service_id
            ),
            rec AS (
                SELECT i.service_id,
                       SUM(r.amount) AS received
                FROM txn r
                JOIN txn i ON i.id = r.linked_txn_id
                JOIN filtered_services fs ON fs.service_id = i.service_id
                WHERE r.txn_type = 'receipt'
                  AND r.status = 'active'
                  AND i.txn_type = 'invoice'
                  AND i.status = 'active'
                GROUP BY i.service_id
            )
            SELECT
                fs.client_key_id,
                fs.client_type,
                fs.client_name,
                COALESCE(SUM(inv.actual_billed), 0) AS actual_billed,
                COALESCE(SUM(rec.received), 0) AS received
            FROM filtered_services fs
            LEFT JOIN inv ON inv.service_id = fs.service_id
            LEFT JOIN rec ON rec.service_id = fs.service_id
            GROUP BY fs.client_key_id, fs.client_type, fs.client_name
            ORDER BY fs.client_name ASC"
        );
        $financeByClientStmt->execute($params);
        $financeByClientRows = $financeByClientStmt->fetchAll();

        $billableMinutes = (int)($summaryRow['billable_minutes'] ?? 0);
        $nonBillableMinutes = (int)($summaryRow['non_billable_minutes'] ?? 0);
        $expectedBillable = round((float)($summaryRow['expected_billable'] ?? 0), 2);
        $actualBilled = round((float)($financeRow['actual_billed'] ?? 0), 2);
        $received = round((float)($financeRow['received'] ?? 0), 2);
        $outstanding = round($actualBilled - $received, 2);

        return [
            'summary' => [
                'bucket' => $bucketKey,
                'billable_minutes' => $billableMinutes,
                'non_billable_minutes' => $nonBillableMinutes,
                'total_minutes' => $billableMinutes + $nonBillableMinutes,
                'expected_billable' => $expectedBillable,
                'actual_billed' => $actualBilled,
                'received' => $received,
                'outstanding' => $outstanding,
                'variance_expected_vs_actual' => round($expectedBillable - $actualBilled, 2),
            ],
            'series' => array_map(static function (array $row): array {
                return [
                    'bucket_start' => (string)($row['bucket_start'] ?? ''),
                    'billable_minutes' => (int)($row['billable_minutes'] ?? 0),
                    'non_billable_minutes' => (int)($row['non_billable_minutes'] ?? 0),
                    'expected_billable' => round((float)($row['expected_billable'] ?? 0), 2),
                ];
            }, $seriesRows),
            'breakdowns' => [
                'employees' => array_map(static function (array $row): array {
                    return [
                        'user_id' => (int)($row['user_id'] ?? 0),
                        'user_name' => (string)($row['user_name'] ?? ''),
                        'billable_minutes' => (int)($row['billable_minutes'] ?? 0),
                        'non_billable_minutes' => (int)($row['non_billable_minutes'] ?? 0),
                        'expected_billable' => round((float)($row['expected_billable'] ?? 0), 2),
                    ];
                }, $employeeRows),
                'clients' => array_map(static function (array $row): array {
                    return [
                        'client_key_id' => (int)($row['client_key_id'] ?? 0),
                        'client_type' => (string)($row['client_type'] ?? 'unknown'),
                        'client_name' => (string)($row['client_name'] ?? ''),
                        'billable_minutes' => (int)($row['billable_minutes'] ?? 0),
                        'non_billable_minutes' => (int)($row['non_billable_minutes'] ?? 0),
                    ];
                }, $clientRows),
                'services' => $serviceRows,
                'financeByClient' => array_map(static function (array $row): array {
                    $actual = round((float)($row['actual_billed'] ?? 0), 2);
                    $received = round((float)($row['received'] ?? 0), 2);
                    return [
                        'client_key_id' => (int)($row['client_key_id'] ?? 0),
                        'client_type' => (string)($row['client_type'] ?? 'unknown'),
                        'client_name' => (string)($row['client_name'] ?? ''),
                        'actual_billed' => $actual,
                        'received' => $received,
                        'outstanding' => round($actual - $received, 2),
                    ];
                }, $financeByClientRows),
            ],
            'table' => $serviceRows,
        ];
    }

    /**
     * @param array<string, mixed> $filters
     * @return array{0: string, 1: array<string, mixed>}
     */
    private function buildInsightsWhere(
        array $filters,
        ?int $actorUserId = null,
        bool $isPrimarySuperAdmin = false,
        bool $canViewTeam = false,
        ?int $scopeUserId = null,
        bool $scopeAll = false
    ): array
    {
        $where = [
            'te.work_date >= :df',
            'te.work_date <= :dt',
            'te.timer_status <> :running',
        ];
        $params = [
            ':df' => (string)$filters['date_from'],
            ':dt' => (string)$filters['date_to'],
            ':running' => 'running',
        ];

        $uid = (int)($filters['user_id'] ?? 0);
        if ($uid > 0) {
            $where[] = 'te.user_id = :uid';
            $params[':uid'] = $uid;
        }
        $sid = (int)($filters['service_id'] ?? 0);
        if ($sid > 0) {
            $where[] = 'te.service_id = :sid';
            $params[':sid'] = $sid;
        }
        $clientId = (int)($filters['client_id'] ?? 0);
        if ($clientId > 0) {
            $where[] = 's.client_id = :client_id';
            $params[':client_id'] = $clientId;
        }
        $orgId = (int)($filters['organization_id'] ?? 0);
        if ($orgId > 0) {
            $where[] = 's.organization_id = :org_id';
            $params[':org_id'] = $orgId;
        }
        $groupId = (int)($filters['group_id'] ?? 0);
        if ($groupId > 0) {
            $where[] = 'cg.id = :group_id';
            $params[':group_id'] = $groupId;
        }
        $billableType = strtolower(trim((string)($filters['billable_type'] ?? 'all')));
        if ($billableType === 'billable') {
            $where[] = 'te.is_billable = true';
        } elseif ($billableType === 'non_billable') {
            $where[] = 'te.is_billable = false';
        }
        $this->applyServiceVisibilityScope(
            $where,
            $params,
            $actorUserId,
            $isPrimarySuperAdmin,
            $canViewTeam,
            $scopeUserId,
            $scopeAll,
            's'
        );

        return [implode(' AND ', $where), $params];
    }

    /**
     * @param array<int, string>|string      $where
     * @param array<string, mixed>           $params
     */
    private function applyServiceVisibilityScope(
        array|string &$where,
        array &$params,
        ?int $actorUserId,
        bool $isPrimarySuperAdmin,
        bool $canViewTeam,
        ?int $scopeUserId,
        bool $scopeAll,
        string $serviceAlias = 's'
    ): void {
        if ($scopeAll && ($isPrimarySuperAdmin || $canViewTeam)) {
            return;
        }

        $scopedUserId = null;
        if ($isPrimarySuperAdmin) {
            if ($scopeUserId !== null && $scopeUserId > 0) {
                $scopedUserId = $scopeUserId;
            } else {
                return;
            }
        } elseif ($canViewTeam) {
            if ($scopeUserId !== null && $scopeUserId > 0) {
                $scopedUserId = $scopeUserId;
            } elseif ($actorUserId !== null && $actorUserId > 0) {
                $scopedUserId = $actorUserId;
            }
        } elseif ($actorUserId !== null && $actorUserId > 0) {
            $scopedUserId = $actorUserId;
        }
        if ($scopedUserId === null) {
            return;
        }

        $scopeSql = "(
            {$serviceAlias}.assigned_to = :scope_uid
            OR EXISTS (
                SELECT 1 FROM service_assignees sa_scope
                WHERE sa_scope.service_id = {$serviceAlias}.id
                  AND sa_scope.user_id = :scope_uid
            )
        )";
        if (is_array($where)) {
            $where[] = $scopeSql;
        } else {
            $where .= ' AND ' . $scopeSql;
        }
        $params[':scope_uid'] = $scopedUserId;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function decodeTasks(mixed $tasksRaw): array
    {
        if (is_array($tasksRaw)) {
            return $tasksRaw;
        }
        if (is_string($tasksRaw) && $tasksRaw !== '') {
            $decoded = json_decode($tasksRaw, true);

            return is_array($decoded) ? $decoded : [];
        }

        return [];
    }

    /**
     * Σ (hours × user planned_billable_rate_per_hour) for a service, split billable vs non-billable.
     * Excludes running timers.
     *
     * @return array{billed_hours_fees: float, unbilled_hours_fees: float, billable_hours: float, unbillable_hours: float}
     */
    public function sumPlannedRatesForService(int $serviceId): array
    {
        $stmt = $this->db->prepare(
            "SELECT
                COALESCE(SUM((CASE WHEN te.is_billable THEN te.duration_minutes ELSE 0 END) / 60.0
                    * COALESCE(u.planned_billable_rate_per_hour, 0)), 0)::float AS billed_fees,
                COALESCE(SUM((CASE WHEN NOT te.is_billable THEN te.duration_minutes ELSE 0 END) / 60.0
                    * COALESCE(u.planned_billable_rate_per_hour, 0)), 0)::float AS unbilled_fees,
                COALESCE(SUM(CASE WHEN te.is_billable THEN te.duration_minutes ELSE 0 END) / 60.0, 0)::float AS billable_h,
                COALESCE(SUM(CASE WHEN NOT te.is_billable THEN te.duration_minutes ELSE 0 END) / 60.0, 0)::float AS unbillable_h
             FROM time_entries te
             JOIN users u ON u.id = te.user_id
             WHERE te.service_id = :sid
               AND te.timer_status <> 'running'"
        );
        $stmt->execute([':sid' => $serviceId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

        return [
            'billed_hours_fees'   => round((float)($row['billed_fees'] ?? 0), 2),
            'unbilled_hours_fees' => round((float)($row['unbilled_fees'] ?? 0), 2),
            'billable_hours'      => round((float)($row['billable_h'] ?? 0), 4),
            'unbillable_hours'    => round((float)($row['unbillable_h'] ?? 0), 4),
        ];
    }
}

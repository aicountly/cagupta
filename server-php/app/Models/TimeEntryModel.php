<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * Time entries on service engagements (optionally linked to an open task).
 */
class TimeEntryModel
{
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
            'SELECT te.*, u.name AS user_name
             FROM time_entries te
             JOIN users u ON u.id = te.user_id
             WHERE te.id = :id
             LIMIT 1'
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
            'SELECT te.*, u.name AS user_name
             FROM time_entries te
             JOIN users u ON u.id = te.user_id
             WHERE te.service_id = :sid
             ORDER BY te.work_date DESC, te.id DESC'
        );
        $stmt->execute([':sid' => $serviceId]);

        return $stmt->fetchAll();
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
                activity_type, is_billable, notes
             ) VALUES (
                :uid, :sid, :task_id, :work_date, :dur,
                :activity, :billable, :notes
             ) RETURNING id'
        );
        $stmt->execute([
            ':uid'      => $userId,
            ':sid'      => $serviceId,
            ':task_id'  => $taskId,
            ':work_date'=> $workDate,
            ':dur'      => $duration,
            ':activity' => $activity,
            ':billable' => $isBillable ? 'true' : 'false',
            ':notes'    => $notes,
        ]);
        $newId = (int)$stmt->fetchColumn();

        return $this->find($newId);
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
             GROUP BY te.user_id"
        );
        $stmt->execute([':sid' => $serviceId]);
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
     * Aggregated report for timesheets (per user, optional date range).
     *
     * @return array<int, array<string, mixed>>
     */
    public function reportByUserService(
        ?int $userId,
        string $dateFrom,
        string $dateTo
    ): array {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) {
            return [];
        }

        $sql = "SELECT
                    te.user_id,
                    u.name AS user_name,
                    te.service_id,
                    s.service_type,
                    COALESCE(c.organization_name,
                        NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                        o.name,
                        s.client_name,
                        'Unknown') AS client_name,
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
                WHERE te.work_date >= :df AND te.work_date <= :dt";

        $params = [':df' => $dateFrom, ':dt' => $dateTo];
        if ($userId !== null && $userId > 0) {
            $sql               .= ' AND te.user_id = :uid';
            $params[':uid'] = $userId;
        }
        $sql .= ' GROUP BY te.user_id, u.name, te.service_id, s.service_type,
                    c.organization_name, c.first_name, c.last_name, o.name, s.client_name,
                    cg.id, cg.name
                  ORDER BY u.name, te.service_id';

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll();
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
}

<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class TimesheetOverflowRequestModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @param array{
     *   service_id:int,user_id:int,time_entry_id?:int|null,source_kind:string,
     *   duration_minutes_requested:int,work_date:string,activity_type:string,
     *   is_billable:bool,notes?:?string,task_id?:?string
     * } $data
     */
    public function create(array $data): int
    {
        $stmt = $this->db->prepare(
            "INSERT INTO timesheet_overflow_requests (
                service_id, user_id, time_entry_id, source_kind, status,
                duration_minutes_requested, work_date, activity_type, is_billable, notes, task_id
             ) VALUES (
                :sid, :uid, :teid, :skind, 'pending',
                :dur, :wd, :act, :bill, :notes, :task
             ) RETURNING id"
        );
        $stmt->execute([
            ':sid'   => $data['service_id'],
            ':uid'   => $data['user_id'],
            ':teid'  => $data['time_entry_id'] ?? null,
            ':skind' => $data['source_kind'],
            ':dur'   => $data['duration_minutes_requested'],
            ':wd'    => $data['work_date'],
            ':act'   => $data['activity_type'],
            ':bill'  => !empty($data['is_billable']) ? 'true' : 'false',
            ':notes' => $data['notes'] ?? null,
            ':task'  => $data['task_id'] ?? null,
        ]);

        return (int)$stmt->fetchColumn();
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM timesheet_overflow_requests WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    public function linkTimeEntryToCapColumn(int $timeEntryId, int $requestId): void
    {
        $stmt = $this->db->prepare(
            'UPDATE time_entries SET cap_overflow_request_id = :rid, updated_at = NOW() WHERE id = :tid'
        );
        $stmt->execute([':rid' => $requestId, ':tid' => $timeEntryId]);
    }

    /** @return array<int, array<string, mixed>> */
    public function listPendingWithContext(): array
    {
        $stmt = $this->db->query(
            "SELECT r.*,
                    s.service_type,
                    COALESCE(c.organization_name,
                             NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                             o.name,
                             s.client_name,
                             'Unknown') AS client_name,
                    u.name AS user_name
             FROM timesheet_overflow_requests r
             JOIN services s ON s.id = r.service_id
             LEFT JOIN clients c ON c.id = s.client_id
             LEFT JOIN organizations o ON o.id = s.organization_id
             JOIN users u ON u.id = r.user_id
             WHERE r.status = 'pending'
             ORDER BY r.id ASC"
        );

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /**
     * @param array<string, mixed> $payload
     */
    public function insertAudit(int $requestId, string $action, ?int $actorUserId, array $payload = []): void
    {
        $stmt = $this->db->prepare(
            "INSERT INTO timesheet_overflow_audit (request_id, action, actor_user_id, payload)
             VALUES (:rid, :act, :uid, CAST(:payload AS jsonb))"
        );
        $stmt->execute([
            ':rid'     => $requestId,
            ':act'     => $action,
            ':uid'     => $actorUserId,
            ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ]);
    }

    public function markRejected(int $requestId, int $superadminId, string $reason): void
    {
        $stmt = $this->db->prepare(
            "UPDATE timesheet_overflow_requests
             SET status = 'rejected',
                 decided_by = :uid,
                 decided_at = NOW(),
                 decision_notes = :notes
             WHERE id = :id AND status = 'pending'"
        );
        $stmt->execute([
            ':id' => $requestId,
            ':uid' => $superadminId,
            ':notes' => $reason !== '' ? $reason : null,
        ]);
    }

    public function markApproved(
        int $requestId,
        int $superadminId,
        string $status,
        ?int $approvedMinutes,
        ?string $notes
    ): void {
        $stmt = $this->db->prepare(
            "UPDATE timesheet_overflow_requests
             SET status = :st,
                 approved_duration_minutes = :adm,
                 decided_by = :uid,
                 decided_at = NOW(),
                 decision_notes = :notes
             WHERE id = :id AND status = 'pending'"
        );
        $stmt->execute([
            ':st'   => $status,
            ':adm' => $approvedMinutes,
            ':uid' => $superadminId,
            ':notes' => $notes !== null && $notes !== '' ? $notes : null,
            ':id'  => $requestId,
        ]);
    }

    public function beginTransaction(): void
    {
        $this->db->beginTransaction();
    }

    public function commit(): void
    {
        $this->db->commit();
    }

    public function rollBack(): void
    {
        $this->db->rollBack();
    }
}

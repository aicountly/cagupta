<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * ServiceTemporaryAssignmentModel — CRUD for `service_temporary_assignments`.
 *
 * Handles the per-service handover records that are scoped to a leave period.
 */
class ServiceTemporaryAssignmentModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Find a single assignment by primary key.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT a.*,
                    s.service_type, s.status AS service_status,
                    COALESCE(c.organization_name,
                             NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                             o.name,
                             s.client_name,
                             'Unknown') AS client_name,
                    ou.name AS original_user_name,
                    tu.name AS temp_user_name,
                    tu.email AS temp_user_email,
                    rb.name AS revoked_by_name
             FROM service_temporary_assignments a
             JOIN services s ON s.id = a.service_id
             LEFT JOIN clients c ON c.id = s.client_id
             LEFT JOIN organizations o ON o.id = s.organization_id
             JOIN users ou ON ou.id = a.original_user_id
             JOIN users tu ON tu.id = a.temp_user_id
             LEFT JOIN users rb ON rb.id = a.revoked_by
             WHERE a.id = :id
             LIMIT 1"
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /**
     * List all assignments for a given leave record (with enriched service data).
     *
     * @return array<int, array<string, mixed>>
     */
    public function listForLeave(int $leaveId): array
    {
        $stmt = $this->db->prepare(
            "SELECT a.*,
                    s.service_type, s.status AS service_status, s.financial_year,
                    COALESCE(c.organization_name,
                             NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                             o.name,
                             s.client_name,
                             'Unknown') AS client_name,
                    ou.name AS original_user_name,
                    tu.name AS temp_user_name,
                    tu.email AS temp_user_email,
                    rb.name AS revoked_by_name
             FROM service_temporary_assignments a
             JOIN services s ON s.id = a.service_id
             LEFT JOIN clients c ON c.id = s.client_id
             LEFT JOIN organizations o ON o.id = s.organization_id
             JOIN users ou ON ou.id = a.original_user_id
             JOIN users tu ON tu.id = a.temp_user_id
             LEFT JOIN users rb ON rb.id = a.revoked_by
             WHERE a.leave_id = :leave_id
             ORDER BY a.id ASC"
        );
        $stmt->execute([':leave_id' => $leaveId]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /**
     * Return services that the given user currently holds as temporary charge.
     *
     * "Currently active" means:
     *   - today is within start_date..end_date
     *   - revoked_at IS NULL
     *   - the linked leave is still 'active'
     *
     * @return array<int, array<string, mixed>>
     */
    public function listActiveChargesForUser(int $tempUserId, string $today): array
    {
        $stmt = $this->db->prepare(
            "SELECT a.*,
                    s.service_type, s.status AS service_status, s.financial_year,
                    s.fees, s.due_date,
                    COALESCE(c.organization_name,
                             NULLIF(TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))), ''),
                             o.name,
                             s.client_name,
                             'Unknown') AS client_name,
                    ou.name  AS original_user_name,
                    ou.email AS original_user_email,
                    l.start_date AS leave_start, l.end_date AS leave_end,
                    l.reason AS leave_reason
             FROM service_temporary_assignments a
             JOIN user_leaves l ON l.id = a.leave_id
             JOIN services s   ON s.id  = a.service_id
             LEFT JOIN clients c ON c.id = s.client_id
             LEFT JOIN organizations o ON o.id = s.organization_id
             JOIN users ou ON ou.id = a.original_user_id
             WHERE a.temp_user_id = :temp_user_id
               AND a.start_date  <= :today
               AND a.end_date    >= :today
               AND a.revoked_at IS NULL
               AND l.status = 'active'
             ORDER BY a.end_date ASC, a.id ASC"
        );
        $stmt->execute([
            ':temp_user_id' => $tempUserId,
            ':today'        => $today,
        ]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /**
     * Check whether the given user has an active temporary charge for a specific
     * service today (used by ServiceController to gate show access).
     */
    public function hasActiveCharge(int $tempUserId, int $serviceId, string $today): bool
    {
        $stmt = $this->db->prepare(
            "SELECT 1
             FROM service_temporary_assignments a
             JOIN user_leaves l ON l.id = a.leave_id
             WHERE a.temp_user_id = :temp_user_id
               AND a.service_id   = :service_id
               AND a.start_date  <= :today
               AND a.end_date    >= :today
               AND a.revoked_at IS NULL
               AND l.status = 'active'
             LIMIT 1"
        );
        $stmt->execute([
            ':temp_user_id' => $tempUserId,
            ':service_id'   => $serviceId,
            ':today'        => $today,
        ]);

        return (bool)$stmt->fetchColumn();
    }

    /**
     * Upsert an assignment (insert or update temp_user_id if the (leave_id, service_id)
     * pair already exists and was previously revoked).
     */
    public function upsert(
        int $leaveId,
        int $serviceId,
        int $originalUserId,
        int $tempUserId,
        string $startDate,
        string $endDate,
        int $createdBy
    ): int {
        $stmt = $this->db->prepare(
            "INSERT INTO service_temporary_assignments
                 (leave_id, service_id, original_user_id, temp_user_id, start_date, end_date, created_by)
             VALUES (:leave_id, :service_id, :original_user_id, :temp_user_id, :start_date, :end_date, :created_by)
             ON CONFLICT (leave_id, service_id) DO UPDATE
                 SET temp_user_id     = EXCLUDED.temp_user_id,
                     original_user_id = EXCLUDED.original_user_id,
                     start_date       = EXCLUDED.start_date,
                     end_date         = EXCLUDED.end_date,
                     revoked_at       = NULL,
                     revoked_by       = NULL
             RETURNING id"
        );
        $stmt->execute([
            ':leave_id'         => $leaveId,
            ':service_id'       => $serviceId,
            ':original_user_id' => $originalUserId,
            ':temp_user_id'     => $tempUserId,
            ':start_date'       => $startDate,
            ':end_date'         => $endDate,
            ':created_by'       => $createdBy,
        ]);

        return (int)$stmt->fetchColumn();
    }

    /**
     * Revoke a single assignment by setting revoked_at = NOW().
     * Returns false if the assignment does not belong to the given leave.
     */
    public function revoke(int $assignmentId, int $leaveId, int $revokedBy): bool
    {
        $stmt = $this->db->prepare(
            "UPDATE service_temporary_assignments
             SET revoked_at = NOW(), revoked_by = :revoked_by
             WHERE id = :id AND leave_id = :leave_id AND revoked_at IS NULL"
        );
        $stmt->execute([
            ':revoked_by' => $revokedBy,
            ':id'         => $assignmentId,
            ':leave_id'   => $leaveId,
        ]);

        return $stmt->rowCount() > 0;
    }
}

<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * LeaveModel — CRUD for the `user_leaves` table.
 */
class LeaveModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Find a leave record by primary key, including the on-leave user's name.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT l.*,
                    u.name  AS user_name,
                    u.email AS user_email,
                    cb.name AS created_by_name
             FROM user_leaves l
             JOIN users u  ON u.id  = l.user_id
             LEFT JOIN users cb ON cb.id = l.created_by
             WHERE l.id = :id
             LIMIT 1"
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /**
     * Return all leave records ordered by start_date desc.
     *
     * @param string $status  Filter by status ('active'|'cancelled'|'' for all)
     * @param int    $userId  Filter by user_id (0 = all users)
     * @return array<int, array<string, mixed>>
     */
    public function list(string $status = '', int $userId = 0): array
    {
        $conditions = [];
        $params     = [];

        if ($status !== '') {
            $conditions[] = 'l.status = :status';
            $params[':status'] = $status;
        }
        if ($userId > 0) {
            $conditions[] = 'l.user_id = :user_id';
            $params[':user_id'] = $userId;
        }

        $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

        $stmt = $this->db->prepare(
            "SELECT l.*,
                    u.name  AS user_name,
                    u.email AS user_email,
                    cb.name AS created_by_name
             FROM user_leaves l
             JOIN users u  ON u.id  = l.user_id
             LEFT JOIN users cb ON cb.id = l.created_by
             {$where}
             ORDER BY l.start_date DESC, l.id DESC"
        );
        $stmt->execute($params);

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /**
     * Insert a new leave record and return the new id.
     *
     * @param array<string, mixed> $data
     */
    public function insert(array $data): int
    {
        $stmt = $this->db->prepare(
            "INSERT INTO user_leaves (user_id, start_date, end_date, reason, status, created_by)
             VALUES (:user_id, :start_date, :end_date, :reason, 'active', :created_by)
             RETURNING id"
        );
        $stmt->execute([
            ':user_id'    => (int)$data['user_id'],
            ':start_date' => (string)$data['start_date'],
            ':end_date'   => (string)$data['end_date'],
            ':reason'     => isset($data['reason']) ? (string)$data['reason'] : null,
            ':created_by' => isset($data['created_by']) ? (int)$data['created_by'] : null,
        ]);

        return (int)$stmt->fetchColumn();
    }

    /**
     * Update dates, reason, or status of a leave record.
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): void
    {
        $sets   = [];
        $params = [':id' => $id];

        $allowed = ['start_date', 'end_date', 'reason', 'status'];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $sets[]           = "{$field} = :{$field}";
                $params[":{$field}"] = $data[$field];
            }
        }
        if ($sets === []) {
            return;
        }
        $sets[] = 'updated_at = NOW()';

        $stmt = $this->db->prepare(
            'UPDATE user_leaves SET ' . implode(', ', $sets) . ' WHERE id = :id'
        );
        $stmt->execute($params);
    }

    /**
     * Cancel a leave (sets status = 'cancelled' and bulk-revokes all assignments).
     */
    public function cancel(int $id, int $revokedBy): void
    {
        $this->db->beginTransaction();
        try {
            $this->update($id, ['status' => 'cancelled']);

            $stmt = $this->db->prepare(
                "UPDATE service_temporary_assignments
                 SET revoked_at = NOW(), revoked_by = :revoked_by
                 WHERE leave_id = :leave_id AND revoked_at IS NULL"
            );
            $stmt->execute([':revoked_by' => $revokedBy, ':leave_id' => $id]);

            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * Return true when another active (non-cancelled) leave overlaps the given
     * date range for the same user, optionally excluding a leave id (for updates).
     */
    public function hasOverlap(int $userId, string $startDate, string $endDate, ?int $excludeId = null): bool
    {
        $excludeSql = $excludeId !== null ? 'AND id != :exclude_id' : '';
        $stmt = $this->db->prepare(
            "SELECT 1 FROM user_leaves
             WHERE user_id = :user_id
               AND status  = 'active'
               AND start_date <= :end_date
               AND end_date   >= :start_date
               {$excludeSql}
             LIMIT 1"
        );
        $params = [
            ':user_id'    => $userId,
            ':start_date' => $startDate,
            ':end_date'   => $endDate,
        ];
        if ($excludeId !== null) {
            $params[':exclude_id'] = $excludeId;
        }
        $stmt->execute($params);

        return (bool)$stmt->fetchColumn();
    }
}

<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class PartnerAssignmentModel
{
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
            'SELECT pa.*, s.title AS service_title, s.status AS service_status,
                    u.name AS partner_name, u.email AS partner_email,
                    ab.name AS assigned_by_name
             FROM partner_assignments pa
             JOIN services s ON s.id = pa.service_id
             JOIN users u ON u.id = pa.partner_user_id
             LEFT JOIN users ab ON ab.id = pa.assigned_by
             WHERE pa.id = :id'
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * @return array{assignments: array, total: int}
     */
    public function paginateForPartner(int $partnerUserId, int $page = 1, int $perPage = 20, ?string $status = null): array
    {
        $offset = ($page - 1) * $perPage;
        $where  = 'pa.partner_user_id = :uid';
        $params = [':uid' => $partnerUserId];

        if ($status !== null && $status !== '') {
            $where .= ' AND pa.status = :st';
            $params[':st'] = $status;
        }

        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM partner_assignments pa WHERE {$where}");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT pa.*, s.title AS service_title, s.status AS service_status,
                    s.total_fee, ab.name AS assigned_by_name
             FROM partner_assignments pa
             JOIN services s ON s.id = pa.service_id
             LEFT JOIN users ab ON ab.id = pa.assigned_by
             WHERE {$where}
             ORDER BY pa.assigned_at DESC
             LIMIT :lim OFFSET :off"
        );
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':lim', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return ['assignments' => $stmt->fetchAll(), 'total' => $total];
    }

    /**
     * @return array{assignments: array, total: int}
     */
    public function paginateAll(int $page = 1, int $perPage = 50, ?string $status = null): array
    {
        $offset = ($page - 1) * $perPage;
        $where  = '1=1';
        $params = [];

        if ($status !== null && $status !== '') {
            $where .= ' AND pa.status = :st';
            $params[':st'] = $status;
        }

        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM partner_assignments pa WHERE {$where}");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT pa.*, s.title AS service_title, s.status AS service_status,
                    s.total_fee, u.name AS partner_name, u.email AS partner_email,
                    ab.name AS assigned_by_name
             FROM partner_assignments pa
             JOIN services s ON s.id = pa.service_id
             JOIN users u ON u.id = pa.partner_user_id
             LEFT JOIN users ab ON ab.id = pa.assigned_by
             WHERE {$where}
             ORDER BY pa.assigned_at DESC
             LIMIT :lim OFFSET :off"
        );
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':lim', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return ['assignments' => $stmt->fetchAll(), 'total' => $total];
    }

    public function create(array $data): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO partner_assignments (service_id, partner_user_id, assigned_by, status, partner_payout_pct, partner_payout_flat, notes)
             VALUES (:sid, :pid, :ab, \'assigned\', :pct, :flat, :notes) RETURNING id'
        );
        $stmt->execute([
            ':sid'  => $data['service_id'],
            ':pid'  => $data['partner_user_id'],
            ':ab'   => $data['assigned_by'] ?? null,
            ':pct'  => $data['partner_payout_pct'] ?? null,
            ':flat' => $data['partner_payout_flat'] ?? null,
            ':notes'=> $data['notes'] ?? null,
        ]);

        return (int)$stmt->fetchColumn();
    }

    public function updateStatus(int $id, string $status, int $partnerUserId): bool
    {
        $completedAt = $status === 'completed' ? 'NOW()' : 'completed_at';
        $stmt = $this->db->prepare(
            "UPDATE partner_assignments SET status = :st, completed_at = {$completedAt}, updated_at = NOW()
             WHERE id = :id AND partner_user_id = :pid"
        );

        return $stmt->execute([':st' => $status, ':id' => $id, ':pid' => $partnerUserId]);
    }

    public function adminUpdateStatus(int $id, string $status): bool
    {
        $completedAt = $status === 'completed' ? 'NOW()' : 'completed_at';
        $stmt = $this->db->prepare(
            "UPDATE partner_assignments SET status = :st, completed_at = {$completedAt}, updated_at = NOW() WHERE id = :id"
        );

        return $stmt->execute([':st' => $status, ':id' => $id]);
    }

    public function countByPartner(int $partnerUserId, ?string $status = null): int
    {
        if ($status !== null) {
            $stmt = $this->db->prepare('SELECT COUNT(*) FROM partner_assignments WHERE partner_user_id = :uid AND status = :st');
            $stmt->execute([':uid' => $partnerUserId, ':st' => $status]);
        } else {
            $stmt = $this->db->prepare('SELECT COUNT(*) FROM partner_assignments WHERE partner_user_id = :uid');
            $stmt->execute([':uid' => $partnerUserId]);
        }

        return (int)$stmt->fetchColumn();
    }
}

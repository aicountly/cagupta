<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class AssociateRedemptionRequestModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    public function createPending(int $userId, string $catalogKey, int $points): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO associate_redemption_requests (associate_user_id, catalog_key, points, status)
             VALUES (:u, :ck, :p, \'pending\')
             RETURNING id'
        );
        $stmt->execute([':u' => $userId, ':ck' => $catalogKey, ':p' => $points]);

        return (int)$stmt->fetchColumn();
    }

    /** @return array<int, array<string, mixed>> */
    public function listForAssociate(int $userId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM associate_redemption_requests WHERE associate_user_id = :u ORDER BY created_at DESC'
        );
        $stmt->execute([':u' => $userId]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /** @return array{total: int, rows: array<int, array<string, mixed>>} */
    public function listAdmin(string $status, int $page, int $per): array
    {
        $where = '1=1';
        $params = [];
        if ($status !== '' && $status !== 'all') {
            $where = 'status = :st';
            $params[':st'] = $status;
        }
        $off = ($page - 1) * $per;
        $c = $this->db->prepare("SELECT COUNT(*) FROM associate_redemption_requests WHERE {$where}");
        foreach ($params as $k => $v) {
            $c->bindValue($k, $v);
        }
        $c->execute();
        $total = (int)$c->fetchColumn();
        $stmt = $this->db->prepare(
            "SELECT r.*, u.name, u.email
             FROM associate_redemption_requests r
             JOIN users u ON u.id = r.associate_user_id
             WHERE {$where}
             ORDER BY r.created_at DESC
             LIMIT :lim OFFSET :off"
        );
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':lim', $per, PDO::PARAM_INT);
        $stmt->bindValue(':off', $off, PDO::PARAM_INT);
        $stmt->execute();

        return ['total' => $total, 'rows' => $stmt->fetchAll(PDO::FETCH_ASSOC) ?: []];
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM associate_redemption_requests WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $r = $stmt->fetch(PDO::FETCH_ASSOC);

        return $r ?: null;
    }

    public function setStatus(int $id, string $status, ?int $fulfilledBy, ?string $notes): bool
    {
        if (!in_array($status, ['pending', 'approved', 'rejected', 'fulfilled'], true)) {
            return false;
        }
        $stmt = $this->db->prepare(
            'UPDATE associate_redemption_requests SET
                status = :st,
                fulfilled_by = :fb,
                admin_notes = COALESCE(:n, admin_notes),
                decided_at = NOW()
             WHERE id = :id'
        );

        return $stmt->execute([':st' => $status, ':fb' => $fulfilledBy, ':n' => $notes, ':id' => $id]);
    }
}

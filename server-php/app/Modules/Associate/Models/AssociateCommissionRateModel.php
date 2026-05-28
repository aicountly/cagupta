<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class AssociateCommissionRateModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Effective percent for tier on date, or null to use firm default.
     */
    public function effectivePercent(int $associateUserId, int $tier, string $onDate): ?float
    {
        $stmt = $this->db->prepare(
            'SELECT percent FROM associate_commission_rates
             WHERE associate_user_id = :uid AND tier = :tier
               AND effective_from <= :d
               AND (effective_to IS NULL OR effective_to >= :d2)
             ORDER BY effective_from DESC
             LIMIT 1'
        );
        $stmt->execute([
            ':uid' => $associateUserId,
            ':tier'=> $tier,
            ':d'   => $onDate,
            ':d2'  => $onDate,
        ]);
        $v = $stmt->fetchColumn();

        return $v !== false ? (float)$v : null;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listForAssociate(int $associateUserId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM associate_commission_rates
             WHERE associate_user_id = :uid
             ORDER BY tier ASC, effective_from DESC'
        );
        $stmt->execute([':uid' => $associateUserId]);

        return $stmt->fetchAll();
    }

    /**
     * @param array<string, mixed> $data
     */
    public function insert(array $data): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO associate_commission_rates (associate_user_id, tier, percent, effective_from, effective_to)
             VALUES (:uid, :tier, :pct, :efrom, :eto) RETURNING id'
        );
        $stmt->execute([
            ':uid'   => $data['associate_user_id'],
            ':tier'  => $data['tier'],
            ':pct'   => $data['percent'],
            ':efrom' => $data['effective_from'] ?? date('Y-m-d'),
            ':eto'   => $data['effective_to'] ?? null,
        ]);

        return (int)$stmt->fetchColumn();
    }

    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM associate_commission_rates WHERE id = :id');

        return $stmt->execute([':id' => $id]);
    }
}

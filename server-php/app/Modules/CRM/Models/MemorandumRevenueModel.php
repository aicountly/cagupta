<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/** Engagement types counted as “memorandum revenue” for group monitoring. */
final class MemorandumRevenueModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /** @return array<int, int> */
    public function listEngagementTypeIds(): array
    {
        $stmt = $this->db->query('SELECT engagement_type_id FROM memorandum_revenue_engagement_types ORDER BY engagement_type_id');
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return array_map(static fn ($r) => (int)$r['engagement_type_id'], $rows);
    }

    /** @param array<int> $ids */
    public function replaceAll(array $ids): void
    {
        $this->db->beginTransaction();
        try {
            $this->db->exec('DELETE FROM memorandum_revenue_engagement_types');
            $ins = $this->db->prepare(
                'INSERT INTO memorandum_revenue_engagement_types (engagement_type_id) VALUES (:id)'
            );
            foreach (array_unique(array_filter(array_map('intval', $ids))) as $id) {
                if ($id > 0) {
                    $ins->execute([':id' => $id]);
                }
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }
}

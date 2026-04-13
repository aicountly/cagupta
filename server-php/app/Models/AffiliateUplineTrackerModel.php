<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class AffiliateUplineTrackerModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function get(int $parentUserId, int $childUserId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM affiliate_upline_sub_tracker
             WHERE parent_user_id = :p AND child_user_id = :c LIMIT 1'
        );
        $stmt->execute([':p' => $parentUserId, ':c' => $childUserId]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    public function upsertBlocks(int $parentUserId, int $childUserId, float $cumulative, int $blocksPaid): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO affiliate_upline_sub_tracker (parent_user_id, child_user_id, cumulative_child_commission, blocks_paid)
             VALUES (:p, :c, :cum, :bp)
             ON CONFLICT (parent_user_id, child_user_id) DO UPDATE SET
                cumulative_child_commission = EXCLUDED.cumulative_child_commission,
                blocks_paid = EXCLUDED.blocks_paid,
                updated_at = NOW()'
        );
        $stmt->execute([
            ':p'   => $parentUserId,
            ':c'   => $childUserId,
            ':cum' => $cumulative,
            ':bp'  => $blocksPaid,
        ]);
    }
}

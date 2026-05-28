<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class AssociateRewardLedgerModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    public function insertRow(array $r): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO associate_reward_ledger (associate_user_id, delta_points, kind, ref_type, ref_id, label)
             VALUES (:u, :dp, :k, :rt, :rid, :lb)'
        );
        $stmt->execute([
            ':u'   => (int)$r['associate_user_id'],
            ':dp'  => (int)$r['delta_points'],
            ':k'   => $r['kind'],
            ':rt'  => $r['ref_type'] ?? null,
            ':rid' => isset($r['ref_id']) ? (int)$r['ref_id'] : null,
            ':lb'  => $r['label'] ?? null,
        ]);
    }

    public function balancePoints(int $userId): int
    {
        $stmt = $this->db->prepare(
            'SELECT COALESCE(SUM(delta_points), 0) FROM associate_reward_ledger WHERE associate_user_id = :u'
        );
        $stmt->execute([':u' => $userId]);

        return (int)$stmt->fetchColumn();
    }

    public function deleteDownlineEarningsForInvoice(int $invoiceTxnId): void
    {
        $this->db->prepare(
            'DELETE FROM associate_reward_ledger
             WHERE ref_type = \'downline_commission\' AND ref_id = :iid'
        )->execute([':iid' => $invoiceTxnId]);
    }

    /** @return array<int, array<string, mixed>> */
    public function listForAssociate(int $userId, int $limit = 80): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM associate_reward_ledger
             WHERE associate_user_id = :u
             ORDER BY id DESC
             LIMIT :lim'
        );
        $stmt->bindValue(':u', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':lim', max(1, min(200, $limit)), PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }
}

<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class AffiliatePayoutCycleAmendmentModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @param array<int, array{commission_accrual_id: int, amount_final: float, note?: string|null}> $adjustments
     */
    public function insertPending(int $cycleId, int $requestedByUserId, array $adjustments, ?string $requestReason = null): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO affiliate_payout_cycle_amendments (
                affiliate_payout_cycle_id, status, adjustments_json, requested_by_user_id, request_reason
            ) VALUES (:cid, \'pending\', CAST(:adj AS jsonb), :uid, :reason)
            RETURNING id'
        );
        $stmt->execute([
            ':cid'    => $cycleId,
            ':adj'    => json_encode(array_values($adjustments), JSON_THROW_ON_ERROR),
            ':uid'    => $requestedByUserId,
            ':reason' => $requestReason,
        ]);

        return (int)$stmt->fetchColumn();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM affiliate_payout_cycle_amendments WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function findPendingForCycle(int $cycleId): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT * FROM affiliate_payout_cycle_amendments
             WHERE affiliate_payout_cycle_id = :cid AND status = 'pending'
             ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute([':cid' => $cycleId]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listPendingWithCycle(): array
    {
        $stmt = $this->db->query(
            "SELECT a.*,
                    c.period_start, c.period_end, c.status AS cycle_status, c.cycle_anchor,
                    u.name AS requested_by_name
             FROM affiliate_payout_cycle_amendments a
             JOIN affiliate_payout_cycles c ON c.id = a.affiliate_payout_cycle_id
             LEFT JOIN users u ON u.id = a.requested_by_user_id
             WHERE a.status = 'pending'
             ORDER BY a.created_at ASC"
        );

        return $stmt ? $stmt->fetchAll() : [];
    }

    public function markApproved(int $id, int $decidedByUserId): void
    {
        $stmt = $this->db->prepare(
            "UPDATE affiliate_payout_cycle_amendments
             SET status = 'approved', decided_by_user_id = :db, decided_at = NOW()
             WHERE id = :id AND status = 'pending'"
        );
        $stmt->execute([':db' => $decidedByUserId, ':id' => $id]);
    }

    public function markRejected(int $id, int $decidedByUserId, string $reason): void
    {
        $stmt = $this->db->prepare(
            "UPDATE affiliate_payout_cycle_amendments
             SET status = 'rejected', decided_by_user_id = :db, decided_at = NOW(),
                 reject_reason = :rs
             WHERE id = :id AND status = 'pending'"
        );
        $stmt->execute([':db' => $decidedByUserId, ':rs' => $reason, ':id' => $id]);
    }
}

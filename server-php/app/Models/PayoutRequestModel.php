<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class PayoutRequestModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listForAffiliate(int $affiliateUserId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM payout_requests WHERE affiliate_user_id = :uid ORDER BY created_at DESC'
        );
        $stmt->execute([':uid' => $affiliateUserId]);

        return $stmt->fetchAll();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listAll(string $status = '', int $page = 1, int $perPage = 30): array
    {
        $where  = ['1=1'];
        $params = [];
        if ($status !== '') {
            $where[]         = 'pr.status = :st';
            $params[':st']   = $status;
        }
        $whereClause = implode(' AND ', $where);
        $offset      = ($page - 1) * $perPage;

        $stmt = $this->db->prepare(
            "SELECT pr.*, u.name AS affiliate_name, u.email AS affiliate_email
             FROM payout_requests pr
             JOIN users u ON u.id = pr.affiliate_user_id
             WHERE {$whereClause}
             ORDER BY pr.created_at DESC
             LIMIT :lim OFFSET :off"
        );
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':lim', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM payout_requests WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * @param array<int, array{commission_accrual_id: int, amount: float}> $lines
     */
    public function createWithLines(int $affiliateUserId, float $totalAmount, bool $fastTrack, array $lines): int
    {
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare(
                'INSERT INTO payout_requests (affiliate_user_id, requested_amount, status, fast_track)
                 VALUES (:uid, :amt, \'pending\', :ft) RETURNING id'
            );
            $stmt->execute([
                ':uid' => $affiliateUserId,
                ':amt' => $totalAmount,
                ':ft'  => $fastTrack,
            ]);
            $pid = (int)$stmt->fetchColumn();

            $lineStmt = $this->db->prepare(
                'INSERT INTO payout_request_lines (payout_request_id, commission_accrual_id, amount)
                 VALUES (:pid, :cid, :amt)'
            );
            $accStmt = $this->db->prepare(
                "UPDATE commission_accruals SET status = 'in_payout' WHERE id = :id AND status = 'accrued'"
            );

            foreach ($lines as $ln) {
                $cid = (int)$ln['commission_accrual_id'];
                $amt = (float)$ln['amount'];
                if (!$accStmt->execute([':id' => $cid])) {
                    throw new \RuntimeException('Failed to reserve accrual.');
                }
                if ($accStmt->rowCount() === 0) {
                    throw new \RuntimeException('Accrual not available for payout.');
                }
                $lineStmt->execute([':pid' => $pid, ':cid' => $cid, ':amt' => $amt]);
            }

            $this->db->commit();

            return $pid;
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function setStatus(int $id, string $status, ?int $decidedBy, ?string $notes): bool
    {
        $stmt = $this->db->prepare(
            'UPDATE payout_requests SET status = :st, decided_by = :db, decided_at = NOW(), admin_notes = COALESCE(:n, admin_notes)
             WHERE id = :id'
        );

        return $stmt->execute([
            ':st' => $status,
            ':db' => $decidedBy,
            ':n'  => $notes,
            ':id' => $id,
        ]);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function linesForPayout(int $payoutRequestId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM payout_request_lines WHERE payout_request_id = :id'
        );
        $stmt->execute([':id' => $payoutRequestId]);

        return $stmt->fetchAll();
    }

    /**
     * Revert in_payout accruals to accrued when rejecting a pending request.
     */
    public function releaseAccrualsForRejected(int $payoutRequestId): void
    {
        $lines = $this->linesForPayout($payoutRequestId);
        $upd   = $this->db->prepare(
            "UPDATE commission_accruals SET status = 'accrued' WHERE id = :id AND status = 'in_payout'"
        );
        foreach ($lines as $ln) {
            $upd->execute([':id' => (int)$ln['commission_accrual_id']]);
        }
    }

    /**
     * Mark accruals paid when payout marked paid.
     */
    public function finalizeAccrualsPaid(int $payoutRequestId): void
    {
        $lines = $this->linesForPayout($payoutRequestId);
        $upd   = $this->db->prepare(
            "UPDATE commission_accruals SET status = 'paid' WHERE id = :id AND status = 'in_payout'"
        );
        foreach ($lines as $ln) {
            $upd->execute([':id' => (int)$ln['commission_accrual_id']]);
        }
    }
}

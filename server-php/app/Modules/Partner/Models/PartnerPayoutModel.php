<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

/**
 * Handles partner_payout_accruals, partner_payout_requests, and partner_payout_request_lines.
 */
final class PartnerPayoutModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    // ── Accruals ─────────────────────────────────────────────────────────────

    public function availableBalance(int $partnerUserId): float
    {
        $stmt = $this->db->prepare(
            "SELECT COALESCE(SUM(amount), 0)
             FROM partner_payout_accruals
             WHERE partner_user_id = :uid AND status = 'accrued'"
        );
        $stmt->execute([':uid' => $partnerUserId]);

        return (float)$stmt->fetchColumn();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listAccrualsForPartner(int $partnerUserId, int $page = 1, int $perPage = 30): array
    {
        $offset = ($page - 1) * $perPage;
        $stmt   = $this->db->prepare(
            "SELECT ppa.*, s.title AS service_title
             FROM partner_payout_accruals ppa
             LEFT JOIN services s ON s.id = ppa.service_id
             WHERE ppa.partner_user_id = :uid
             ORDER BY ppa.accrual_date DESC
             LIMIT :lim OFFSET :off"
        );
        $stmt->bindValue(':uid', $partnerUserId);
        $stmt->bindValue(':lim', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    public function totalEarned(int $partnerUserId): float
    {
        $stmt = $this->db->prepare(
            "SELECT COALESCE(SUM(amount), 0)
             FROM partner_payout_accruals
             WHERE partner_user_id = :uid AND status IN ('accrued', 'in_payout', 'paid')"
        );
        $stmt->execute([':uid' => $partnerUserId]);

        return (float)$stmt->fetchColumn();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listAvailableForPayoutFifo(int $partnerUserId): array
    {
        $stmt = $this->db->prepare(
            "SELECT id, amount FROM partner_payout_accruals
             WHERE partner_user_id = :uid AND status = 'accrued'
             ORDER BY accrual_date ASC, id ASC"
        );
        $stmt->execute([':uid' => $partnerUserId]);

        return $stmt->fetchAll();
    }

    // ── Payout Requests ──────────────────────────────────────────────────────

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listRequestsForPartner(int $partnerUserId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM partner_payout_requests
             WHERE partner_user_id = :uid ORDER BY created_at DESC'
        );
        $stmt->execute([':uid' => $partnerUserId]);

        return $stmt->fetchAll();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listAllRequests(int $page = 1, int $perPage = 50, ?string $status = null): array
    {
        $offset = ($page - 1) * $perPage;
        $where  = '1=1';
        $params = [];
        if ($status !== null && $status !== '') {
            $where .= ' AND pr.status = :st';
            $params[':st'] = $status;
        }

        $stmt = $this->db->prepare(
            "SELECT pr.*, u.name AS partner_name, u.email AS partner_email
             FROM partner_payout_requests pr
             JOIN users u ON u.id = pr.partner_user_id
             WHERE {$where}
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
    public function findRequest(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM partner_payout_requests WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * @param array<int, array{accrual_id: int, amount: float}> $lines
     */
    public function createWithLines(int $partnerUserId, float $amount, array $lines): int
    {
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare(
                'INSERT INTO partner_payout_requests (partner_user_id, requested_amount, status)
                 VALUES (:uid, :amt, \'pending\') RETURNING id'
            );
            $stmt->execute([':uid' => $partnerUserId, ':amt' => $amount]);
            $pid = (int)$stmt->fetchColumn();

            $lineStmt = $this->db->prepare(
                'INSERT INTO partner_payout_request_lines (payout_request_id, accrual_id, amount)
                 VALUES (:pid, :aid, :amt)'
            );
            $accrualStmt = $this->db->prepare(
                "UPDATE partner_payout_accruals SET status = 'in_payout' WHERE id = :id AND status = 'accrued'"
            );

            foreach ($lines as $line) {
                $lineStmt->execute([
                    ':pid' => $pid,
                    ':aid' => $line['accrual_id'],
                    ':amt' => $line['amount'],
                ]);
                $accrualStmt->execute([':id' => $line['accrual_id']]);
            }

            $this->db->commit();

            return $pid;
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function updateRequestStatus(int $id, string $status, ?int $decidedBy, ?string $adminNotes = null): bool
    {
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare(
                'UPDATE partner_payout_requests SET status = :st, decided_by = :db, decided_at = NOW(),
                 admin_notes = COALESCE(:notes, admin_notes) WHERE id = :id'
            );
            $stmt->execute([
                ':st'    => $status,
                ':db'    => $decidedBy,
                ':notes' => $adminNotes,
                ':id'    => $id,
            ]);

            $accrualStatus = match ($status) {
                'paid'     => 'paid',
                'rejected' => 'accrued',
                default    => null,
            };

            if ($accrualStatus !== null) {
                $this->db->prepare(
                    "UPDATE partner_payout_accruals SET status = :as
                     WHERE id IN (SELECT accrual_id FROM partner_payout_request_lines WHERE payout_request_id = :pid)"
                )->execute([':as' => $accrualStatus, ':pid' => $id]);
            }

            $this->db->commit();

            return true;
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }
}

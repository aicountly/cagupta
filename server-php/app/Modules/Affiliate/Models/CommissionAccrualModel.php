<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use PDO;

final class CommissionAccrualModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function findByInvoiceTxnId(int $invoiceTxnId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM commission_accruals WHERE invoice_txn_id = :id ORDER BY id ASC'
        );
        $stmt->execute([':id' => $invoiceTxnId]);

        return $stmt->fetchAll();
    }

    /**
     * Delete all accrued rows for an invoice (not paid / not in payout).
     *
     * @return int rows deleted
     */
    public function deleteAccruedForInvoice(int $invoiceTxnId): int
    {
        $stmt = $this->db->prepare(
            "DELETE FROM commission_accruals
             WHERE invoice_txn_id = :id AND status = 'accrued'"
        );
        $stmt->execute([':id' => $invoiceTxnId]);

        return $stmt->rowCount();
    }

    /**
     * Sum of invoice_commission amounts for child (accrued only).
     */
    public function sumChildInvoiceCommissions(int $childAffiliateUserId): float
    {
        $stmt = $this->db->prepare(
            "SELECT COALESCE(SUM(amount), 0) FROM commission_accruals
             WHERE affiliate_user_id = :uid
               AND accrual_type = 'invoice_commission'
               AND status = 'accrued'"
        );
        $stmt->execute([':uid' => $childAffiliateUserId]);

        return (float)$stmt->fetchColumn();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM commission_accruals WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * @param array<string, mixed> $row
     */
    public function insert(array $row): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO commission_accruals (
                affiliate_user_id, invoice_txn_id, service_id, accrual_type, accrual_date,
                commission_mode, tier_used, net_fee_base, rate_percent, amount, currency,
                status, child_affiliate_user_id, metadata
            ) VALUES (
                :affiliate_user_id, :invoice_txn_id, :service_id, :accrual_type, :accrual_date,
                :commission_mode, :tier_used, :net_fee_base, :rate_percent, :amount, :currency,
                :status, :child_affiliate_user_id, CAST(:metadata AS jsonb)
            ) RETURNING id'
        );
        $stmt->execute([
            ':affiliate_user_id'       => $row['affiliate_user_id'],
            ':invoice_txn_id'         => $row['invoice_txn_id'] ?? null,
            ':service_id'             => $row['service_id'] ?? null,
            ':accrual_type'           => $row['accrual_type'],
            ':accrual_date'           => $row['accrual_date'],
            ':commission_mode'        => $row['commission_mode'] ?? null,
            ':tier_used'              => $row['tier_used'] ?? null,
            ':net_fee_base'           => $row['net_fee_base'],
            ':rate_percent'           => $row['rate_percent'] ?? null,
            ':amount'                 => $row['amount'],
            ':currency'               => $row['currency'] ?? 'INR',
            ':status'                 => $row['status'] ?? 'accrued',
            ':child_affiliate_user_id'=> $row['child_affiliate_user_id'] ?? null,
            ':metadata'               => json_encode($row['metadata'] ?? [], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ]);

        return (int)$stmt->fetchColumn();
    }

    /**
     * @return array{total: float, rows: array<int, array<string, mixed>>}
     */
    public function paginateForAffiliate(
        int $affiliateUserId,
        int $page = 1,
        int $perPage = 30,
        ?string $dateFrom = null,
        ?string $dateTo = null
    ): array {
        $where  = ['affiliate_user_id = :uid'];
        $params = [':uid' => $affiliateUserId];
        if ($dateFrom !== null && $dateFrom !== '') {
            $where[]              = 'accrual_date >= :df';
            $params[':df']        = $dateFrom;
        }
        if ($dateTo !== null && $dateTo !== '') {
            $where[]              = 'accrual_date <= :dt';
            $params[':dt']        = $dateTo;
        }
        $whereClause = implode(' AND ', $where);
        $offset      = ($page - 1) * $perPage;

        $sumStmt = $this->db->prepare(
            "SELECT COALESCE(SUM(amount), 0) FROM commission_accruals WHERE {$whereClause} AND status = 'accrued'"
        );
        $sumStmt->execute($params);
        $totalAmt = (float)$sumStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT ca.*, t.invoice_number
             FROM commission_accruals ca
             LEFT JOIN txn t ON t.id = ca.invoice_txn_id
             WHERE {$whereClause}
             ORDER BY ca.accrual_date DESC, ca.id DESC
             LIMIT :lim OFFSET :off"
        );
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':lim', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return ['total' => $totalAmt, 'rows' => $stmt->fetchAll()];
    }

    /**
     * Available balance: accrued amounts not attached to a paid/approved payout.
     */
    public function availableBalance(int $affiliateUserId): float
    {
        $stmt = $this->db->prepare(
            "SELECT COALESCE(SUM(ca.amount), 0)
             FROM commission_accruals ca
             WHERE ca.affiliate_user_id = :uid
               AND ca.status = 'accrued'
               AND NOT EXISTS (
                   SELECT 1 FROM payout_request_lines prl
                   JOIN payout_requests pr ON pr.id = prl.payout_request_id
                   WHERE prl.commission_accrual_id = ca.id
                     AND pr.status IN ('pending', 'approved', 'paid')
               )"
        );
        $stmt->execute([':uid' => $affiliateUserId]);

        return (float)$stmt->fetchColumn();
    }

    /**
     * Accrued rows available for a new payout (FIFO order).
     *
     * @return array<int, array<string, mixed>>
     */
    public function listAvailableForPayoutFifo(int $affiliateUserId): array
    {
        $stmt = $this->db->prepare(
            "SELECT ca.* FROM commission_accruals ca
             WHERE ca.affiliate_user_id = :uid
               AND ca.status = 'accrued'
               AND NOT EXISTS (
                   SELECT 1 FROM payout_request_lines prl
                   JOIN payout_requests pr ON pr.id = prl.payout_request_id
                   WHERE prl.commission_accrual_id = ca.id
                     AND pr.status IN ('pending', 'approved', 'paid')
               )
             ORDER BY ca.accrual_date ASC, ca.id ASC"
        );
        $stmt->execute([':uid' => $affiliateUserId]);

        return $stmt->fetchAll();
    }

    /** Net sum of stair-step upline bonus rows (includes negative reversals). */
    public function sumUplineBonusesForPair(int $parentUserId, int $childUserId): float
    {
        $stmt = $this->db->prepare(
            "SELECT COALESCE(SUM(amount), 0) FROM commission_accruals
             WHERE affiliate_user_id = :p
               AND child_affiliate_user_id = :c
               AND accrual_type = 'upline_sub_bonus'
               AND status = 'accrued'"
        );
        $stmt->execute([':p' => $parentUserId, ':c' => $childUserId]);

        return (float)$stmt->fetchColumn();
    }
}

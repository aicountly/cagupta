<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Libraries\LedgerDimensions;
use PDO;

/**
 * Rows in txn_settlement_allocation: how each receipt is applied.
 */
final class TxnSettlementAllocationModel
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /** @return list<array<string, mixed>> */
    public function listForReceipt(int $receiptTxnId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM txn_settlement_allocation WHERE source_txn_id = :sid ORDER BY id ASC'
        );
        $stmt->execute([':sid' => $receiptTxnId]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /**
     * @return array{invoices: list<int>, payments: list<int>}
     */
    public function distinctTargetsForReceipt(int $receiptTxnId): array
    {
        $rows = $this->listForReceipt($receiptTxnId);
        $inv = [];
        $pay = [];
        foreach ($rows as $r) {
            $tt = (string)($r['target_type'] ?? '');
            $tid = (int)($r['target_txn_id'] ?? 0);
            if ($tt === 'invoice' && $tid > 0) {
                $inv[$tid] = $tid;
            }
            if ($tt === 'payment_expense' && $tid > 0) {
                $pay[$tid] = $tid;
            }
        }

        return ['invoices' => array_values($inv), 'payments' => array_values($pay)];
    }

    public function sumAllocatedToInvoice(int $invoiceTxnId): float
    {
        $stmt = $this->db->prepare(
            "SELECT COALESCE(SUM(a.amount), 0)
             FROM txn_settlement_allocation a
             INNER JOIN txn r ON r.id = a.source_txn_id
             WHERE a.target_type = 'invoice'
               AND a.target_txn_id = :iid
               AND r.txn_type = 'receipt'
               AND r.status IS DISTINCT FROM 'cancelled'"
        );
        $stmt->execute([':iid' => $invoiceTxnId]);

        return (float)$stmt->fetchColumn();
    }

    public function sumAllocatedToPaymentExpense(int $paymentTxnId): float
    {
        $stmt = $this->db->prepare(
            "SELECT COALESCE(SUM(a.amount), 0)
             FROM txn_settlement_allocation a
             INNER JOIN txn r ON r.id = a.source_txn_id
             WHERE a.target_type = 'payment_expense'
               AND a.target_txn_id = :pid
               AND r.txn_type = 'receipt'
               AND r.status IS DISTINCT FROM 'cancelled'"
        );
        $stmt->execute([':pid' => $paymentTxnId]);

        return (float)$stmt->fetchColumn();
    }

    /**
     * Replace all allocation rows for a receipt (caller runs inside txn if needed).
     *
     * @param list<array{target_type:string, target_txn_id?:int|null, amount:float}> $rows
     */
    public function replaceForReceipt(int $receiptTxnId, array $rows): void
    {
        $del = $this->db->prepare('DELETE FROM txn_settlement_allocation WHERE source_txn_id = :sid');
        $del->execute([':sid' => $receiptTxnId]);
        $this->insertForReceipt($receiptTxnId, $rows);
    }

    /**
     * Allocation rows joined with receipt metadata for bill settlement reporting.
     *
     * @return list<array<string, mixed>>
     */
    public function listReceiptAllocationsForReporting(
        int $clientId,
        int $orgId,
        string $ledgerClass,
        ?string $dateFrom,
        ?string $dateTo
    ): array {
        $lc  = LedgerDimensions::normalizeLedgerClass($ledgerClass);
        $where = [
            "r.txn_type = 'receipt'",
            "r.status IS DISTINCT FROM 'cancelled'",
            'r.ledger_class = :lc',
        ];
        $params = [':lc' => $lc];
        if ($clientId > 0) {
            $where[] = 'r.client_id = :cid';
            $params[':cid'] = $clientId;
        } elseif ($orgId > 0) {
            $where[] = 'r.organization_id = :oid';
            $params[':oid'] = $orgId;
        }
        if ($dateFrom !== null && $dateFrom !== '') {
            $where[] = 'r.txn_date >= :df';
            $params[':df'] = $dateFrom;
        }
        if ($dateTo !== null && $dateTo !== '') {
            $where[] = 'r.txn_date <= :dt';
            $params[':dt'] = $dateTo;
        }
        $sql = 'SELECT a.*, r.id AS receipt_id, r.public_ref, r.txn_date AS receipt_date,
                       r.ledger_movement_kind AS receipt_kind
                FROM txn_settlement_allocation a
                INNER JOIN txn r ON r.id = a.source_txn_id
                WHERE ' . implode(' AND ', $where) . '
                ORDER BY r.txn_date ASC, a.id ASC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    public function insertForReceipt(int $receiptTxnId, array $rows): void
    {
        $ins = $this->db->prepare(
            'INSERT INTO txn_settlement_allocation (source_txn_id, target_type, target_txn_id, amount)
             VALUES (:sid, :tt, :tid, :amt)'
        );
        foreach ($rows as $r) {
            $tt = (string)($r['target_type'] ?? '');
            if ($tt === 'unallocated_advance') {
                $tid = null;
            } else {
                $tid = isset($r['target_txn_id']) ? (int)$r['target_txn_id'] : 0;
                if ($tid <= 0) {
                    continue;
                }
            }
            $ins->execute([
                ':sid' => $receiptTxnId,
                ':tt'  => $tt,
                ':tid' => $tid,
                ':amt' => round((float)($r['amount'] ?? 0), 2),
            ]);
        }
    }
}

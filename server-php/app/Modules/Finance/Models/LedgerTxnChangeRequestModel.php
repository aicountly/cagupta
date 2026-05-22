<?php
declare(strict_types=1);

namespace App\Models;

use App\Config\Database;
use App\Libraries\LedgerTxnChangeService;
use PDO;

final class LedgerTxnChangeRequestModel
{
    public const ACTION_UPDATE          = 'update';
    public const ACTION_REVERSE         = 'reverse';
    public const ACTION_CANCEL          = 'cancel';
    public const ACTION_CANCEL_REVERSAL = 'cancel_reversal';

    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<string, mixed> $txnSnapshot
     */
    public function insertPending(
        ?int $txnId,
        string $action,
        array $payload,
        array $txnSnapshot,
        int $requestedByUserId,
        ?string $requestReason = null
    ): int {
        $stmt = $this->db->prepare(
            'INSERT INTO ledger_txn_change_requests (
                txn_id, action, status, payload, txn_snapshot,
                request_reason, requested_by_user_id
             ) VALUES (
                :tid, :action, \'pending\', CAST(:payload AS jsonb), CAST(:snap AS jsonb),
                :reason, :uid
             ) RETURNING id'
        );
        $stmt->execute([
            ':tid'     => $txnId,
            ':action'  => $action,
            ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            ':snap'    => json_encode($txnSnapshot, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            ':reason'  => $requestReason !== null && trim($requestReason) !== '' ? trim($requestReason) : null,
            ':uid'     => $requestedByUserId,
        ]);

        return (int)$stmt->fetchColumn();
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM ledger_txn_change_requests WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /** @return array<string, mixed>|null */
    public function findPendingForTxn(int $txnId): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT * FROM ledger_txn_change_requests
             WHERE txn_id = :tid AND status = 'pending'
             ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute([':tid' => $txnId]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /** @return array<string, mixed>|null */
    public function findPendingBulkCancel(): ?array
    {
        $stmt = $this->db->query(
            "SELECT * FROM ledger_txn_change_requests
             WHERE txn_id IS NULL AND action = 'cancel' AND status = 'pending'
             ORDER BY id DESC LIMIT 1"
        );
        $row = $stmt ? $stmt->fetch() : false;

        return $row ?: null;
    }

    /** @return array<int, array<string, mixed>> */
    public function listPendingWithDetails(): array
    {
        $stmt = $this->db->query(
            "SELECT r.*,
                    u.name AS requested_by_name,
                    u.email AS requested_by_email
             FROM ledger_txn_change_requests r
             LEFT JOIN users u ON u.id = r.requested_by_user_id
             WHERE r.status = 'pending'
             ORDER BY r.created_at ASC"
        );

        return $stmt ? $stmt->fetchAll() : [];
    }

    public function markApproved(int $id, int $decidedByUserId, ?string $decisionNotes = null): void
    {
        $stmt = $this->db->prepare(
            "UPDATE ledger_txn_change_requests
             SET status = 'approved',
                 decided_by_user_id = :db,
                 decided_at = NOW(),
                 decision_notes = :notes
             WHERE id = :id AND status = 'pending'"
        );
        $notes = $decisionNotes !== null && trim($decisionNotes) !== '' ? trim($decisionNotes) : null;
        $stmt->execute([':db' => $decidedByUserId, ':notes' => $notes, ':id' => $id]);
    }

    public function markRejected(int $id, int $decidedByUserId, string $reason): void
    {
        $stmt = $this->db->prepare(
            "UPDATE ledger_txn_change_requests
             SET status = 'rejected',
                 decided_by_user_id = :db,
                 decided_at = NOW(),
                 reject_reason = :rs
             WHERE id = :id AND status = 'pending'"
        );
        $stmt->execute([':db' => $decidedByUserId, ':rs' => trim($reason), ':id' => $id]);
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    public static function toPendingSummary(array $row): array
    {
        $payload = self::decodeJsonField($row['payload'] ?? []);
        $snap    = self::decodeJsonField($row['txn_snapshot'] ?? []);

        $action = (string)($row['action'] ?? '');

        return [
            'approval_id'    => (int)$row['id'],
            'txn_id'         => $row['txn_id'] !== null ? (int)$row['txn_id'] : null,
            'action'         => $action,
            'payload'        => $payload,
            'txn_snapshot'   => $snap,
            'request_reason' => $row['request_reason'] ?? null,
            'created_at'     => $row['created_at'] ?? null,
            'change_rows'    => LedgerTxnChangeService::buildChangeRows(
                $snap,
                $payload,
                $action,
                (string)($snap['txn_type'] ?? '')
            ),
        ];
    }

    /**
     * @param mixed $raw
     *
     * @return array<string, mixed>
     */
    public static function decodeJsonField(mixed $raw): array
    {
        if (is_array($raw)) {
            return $raw;
        }
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);

            return is_array($decoded) ? $decoded : [];
        }

        return [];
    }
}
